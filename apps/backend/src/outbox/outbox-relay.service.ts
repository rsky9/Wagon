import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Transactional outbox relay: claims pending OutboxMessage rows and "publishes"
 * them. Currently delivery is logging + marking published; a real bus (NATS
 * JetStream) plugs in here later. Consumers must be idempotent.
 */
@Injectable()
export class OutboxRelay implements OnModuleInit {
  private readonly logger = new Logger(OutboxRelay.name)
  private running = false

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.running = true
    void this.loop()
  }

  private async loop() {
    while (this.running) {
      try {
        await this.drain()
      } catch (e) {
        this.logger.warn(`outbox drain error: ${e instanceof Error ? e.message : e}`)
      }
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  /** Claim + publish a batch of pending messages. */
  private async drain() {
    const batch = await this.prisma.$transaction(async (tx) => {
      // For each aggregate: oldest first, claim with SKIP LOCKED semantics via updateMany.
      const claimed = await tx.$queryRaw`
        UPDATE "OutboxMessage" SET status = 'publishing', attempts = attempts + 1
        WHERE id IN (
          SELECT id FROM "OutboxMessage"
          WHERE status = 'pending'
          ORDER BY "createdAt" ASC
          LIMIT 20
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *`
      return claimed as Array<{ id: string; aggregateType: string; aggregateId: string; eventType: string; payload: unknown }>
    })

    for (const msg of batch) {
      // Publish to subscribers (log-only here; webhook fan-out comes in Phase 5).
      this.logger.log(`[outbox] ${msg.aggregateType}:${msg.aggregateId} → ${msg.eventType}`)
      await this.prisma.outboxMessage.update({
        where: { id: msg.id },
        data: { status: 'published', publishedAt: new Date() },
      })
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
        aggregateType: event.entityType,
        aggregateId: event.entityId,
        eventType: event.eventCode,
        payload: (event.payload as never) ?? { eventType: event.eventCode },
      },
    })
  }
}
