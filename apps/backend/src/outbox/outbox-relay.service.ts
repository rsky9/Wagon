import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { WebhookDispatcher } from '../integrations/webhook-dispatcher.service'

const MAX_ATTEMPTS = 5
const CLAIM_TIMEOUT_MS = 60_000
const BATCH_SIZE = 20

/**
 * Transactional outbox relay: claims pending OutboxMessage rows, publishes the
 * ledger row FIRST (status = published), then fans out to webhooks. Claims that
 * are left 'publishing' by a crashed instance are reclaimed by a sweep. Messages
 * that exhaust MAX_ATTEMPTS go to a dead-letter state ('dead').
 *
 * Ordering matters: the outbox row is marked published before webhook fan-out so
 * a crash between the two never loses the event from the ledger — subscribers
 * that were missed are reconciled by the idempotent webhook dispatcher.
 */
@Injectable()
export class OutboxRelay implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name)
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly webhooks?: WebhookDispatcher,
  ) {}

  onModuleInit() {
    this.running = true
    void this.loop()
  }

  onModuleDestroy() {
    this.running = false
  }

  private async loop() {
    while (this.running) {
      try {
        await this.reapStaleClaims()
        await this.drain()
      } catch (e) {
        this.logger.warn(`outbox loop error: ${e instanceof Error ? e.message : e}`)
      }
      await new Promise((r) => {
        const t = setTimeout(r, 1000)
        t.unref()
      })
    }
  }

  /** Reclaim rows stuck in 'publishing' past the timeout (crash recovery). */
  private async reapStaleClaims() {
    const stale = await this.prisma.outboxMessage.updateMany({
      where: {
        status: 'publishing',
        claimedAt: { lte: new Date(Date.now() - CLAIM_TIMEOUT_MS) },
      },
      data: { status: 'pending' },
    })
    if (stale.count > 0) this.logger.warn(`[outbox] reclaimed ${stale.count} stale 'publishing' messages`)
  }

  /** Claim a batch with SKIP LOCKED, then publish ledger + fan out per message. */
  private async drain() {
    const batch = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.$queryRaw`
        UPDATE "OutboxMessage" SET status = 'publishing', attempts = attempts + 1, "claimedAt" = now()
        WHERE id IN (
          SELECT id FROM "OutboxMessage"
          WHERE status IN ('pending', 'failed') AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= now())
          ORDER BY "createdAt" ASC
          LIMIT ${BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *`
      return claimed as Array<{
        id: string
        orgId: string | null
        aggregateType: string
        aggregateId: string
        eventType: string
        payload: unknown
        attempts: number
      }>
    })

    for (const msg of batch) {
      // Per-message error isolation: one failure must not strand the batch.
      try {
        // 1. Fan out to webhooks FIRST (idempotent by outbox message id), so a
        //    crash after this point leaves the row 'publishing' — which the
        //    stale-claim sweep reclaims and re-delivers (at-least-once).
        await this.webhooks?.enqueue(msg.eventType, msg.payload, msg.orgId, msg.id)
        // 2. Only mark the ledger row published once delivery is enqueued.
        await this.prisma.outboxMessage.update({
          where: { id: msg.id },
          data: { status: 'published', publishedAt: new Date() },
        })
        this.logger.log(`[outbox] ${msg.aggregateType}:${msg.aggregateId} → ${msg.eventType}`)
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        const fatal = msg.attempts >= MAX_ATTEMPTS
        await this.prisma.outboxMessage.update({
          where: { id: msg.id },
          data: {
            status: fatal ? 'dead' : 'failed',
            lastError: error,
            nextRetryAt: fatal ? null : new Date(Date.now() + backoffMs(msg.attempts)),
          },
        })
        this.logger.error(`[outbox] ${msg.eventType} failed (attempt ${msg.attempts}): ${error}${fatal ? ' → dead' : ''}`)
      }
    }
  }

  /** Write a domain event + outbox message in the same transaction as the domain write. */
  async emit(
    tx: {
      logisticsEvent: {
        create: (args: { data: Record<string, unknown> }) => Promise<unknown>
        update?: never
      }
      outboxMessage: {
        create: (args: { data: Record<string, unknown> }) => Promise<unknown>
      }
    },
    event: {
      eventType: string
      eventCode: string
      classifier?: string
      entityType: string
      entityId: string
      orgId?: string | null
      shipmentId?: string | null
      legId?: string | null
      occurredAt?: Date
      source?: string
      actorId?: string | null
      location?: string | null
      evidence?: string | null
      correlationId?: string | null
      payload?: unknown
    },
  ) {
    const occurredAt = event.occurredAt ?? new Date()
    await tx.logisticsEvent.create({
      data: {
        eventType: event.eventType,
        eventCode: event.eventCode,
        classifier: event.classifier ?? 'ACT',
        entityType: event.entityType,
        entityId: event.entityId,
        orgId: event.orgId ?? null,
        shipmentId: event.shipmentId ?? null,
        legId: event.legId ?? null,
        occurredAt,
        source: event.source ?? 'system',
        actorId: event.actorId ?? null,
        location: event.location ?? null,
        evidence: event.evidence ?? null,
        correlationId: event.correlationId ?? null,
        payload: (event.payload as never) ?? undefined,
      },
    })
    await tx.outboxMessage.create({
      data: {
        orgId: event.orgId ?? null,
        aggregateType: event.entityType,
        aggregateId: event.entityId,
        eventType: event.eventCode,
        payload: (event.payload as never) ?? { eventType: event.eventCode },
        dedupeKey: event.correlationId ?? null,
      },
    })
  }
}

function backoffMs(attempt: number) {
  return Math.min(30_000 * Math.pow(2, attempt), 3_600_000)
}
