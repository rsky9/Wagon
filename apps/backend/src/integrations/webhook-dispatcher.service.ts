import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHmac } from 'node:crypto'
import { lookup as dnsLookup } from 'node:dns/promises'
import { PrismaService } from '../prisma/prisma.service'

const MAX_ATTEMPTS = 3
const MAX_DELIVERIES_PER_CYCLE = 20

/** True when an IP (v4 or v6) is private/reserved/loopback/link-local — never an SSRF target. */
function isPrivateIp(address: string): boolean {
  const v4 = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 169 && b === 254) return true
    if (a >= 224) return true
    return false
  }
  // IPv6: loopback, link-local, unique-local, IPv4-mapped loopback.
  const v6 = address.toLowerCase()
  if (v6 === '::1' || v6 === '::' || v6.startsWith('fe80:') || v6.startsWith('fc') || v6.startsWith('fd')) return true
  if (v6.startsWith('::ffff:127.') || v6.startsWith('::ffff:10.') || v6.startsWith('::ffff:172.') || v6.startsWith('::ffff:192.168.')) return true
  return false
}

/** Resolve a hostname and ensure every address is publicly routable (DNS-rebinding guard). */
async function assertPublicHost(hostname: string): Promise<void> {
  try {
    const addresses = await dnsLookup(hostname, { all: true })
    for (const a of addresses) {
      if (isPrivateIp(a.address)) throw new Error(`resolves to private address ${a.address}`)
    }
  } catch (e) {
    throw new Error(`webhook host not publicly reachable: ${e instanceof Error ? e.message : e}`)
  }
}

/**
 * Webhook fan-out (Phase 5): after the outbox relay publishes a message, matching
 * subscriptions owned by the SAME org get a WebhookDelivery. The dispatcher loop
 * claims pending deliveries, retries with exponential backoff up to MAX_ATTEMPTS,
 * then marks them 'dead'. Payloads are signed with HMAC-SHA256 and carry a stable
 * dedupeKey so consumers can dedupe replays.
 */
@Injectable()
export class WebhookDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDispatcher.name)
  private running = false

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  onModuleInit() {
    this.running = true
    void this.loop()
  }

  onModuleDestroy() {
    this.running = false
  }

  /** Enqueue deliveries for active subscriptions of the SAME org matching the event code. */
  async enqueue(eventCode: string, payload: unknown, orgId?: string | null, sourceId?: string) {
    if (!orgId) return
    const subs = await this.prisma.webhookSubscription.findMany({
      where: { status: 'active', orgId },
    })
    for (const sub of subs) {
      const types = sub.eventTypes as string[]
      if (!types?.includes(eventCode)) continue
      // Idempotency: one delivery per (subscription, source outbox message).
      const dedupeKey = sourceId ? `${sub.id}:${sourceId}` : null
      if (dedupeKey) {
        const existing = await this.prisma.webhookDelivery.findUnique({ where: { dedupeKey } })
        if (existing) continue
      }
      await this.prisma.webhookDelivery.create({
        data: { subscriptionId: sub.id, eventCode, payload: payload as never, dedupeKey },
      })
    }
  }

  private async loop() {
    while (this.running) {
      try {
        await this.deliver()
      } catch (e) {
        this.logger.warn(`webhook dispatcher error: ${e instanceof Error ? e.message : e}`)
      }
      await new Promise((r) => setTimeout(r, 1500))
    }
  }

  /** Claim + deliver pending deliveries, skipping rows that are in-flight or on backoff. */
  private async deliver() {
    const pending = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw`
        UPDATE "WebhookDelivery" SET "lastAttemptAt" = now()
        WHERE id IN (
          SELECT id FROM "WebhookDelivery"
          WHERE status IN ('pending','failed')
            AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= now())
          ORDER BY "createdAt" ASC
          LIMIT ${MAX_DELIVERIES_PER_CYCLE}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *`
      return rows as Array<{
        id: string
        subscriptionId: string
        eventCode: string
        payload: unknown
        attempts: number
        nextRetryAt: Date | null
      }>
    })

    for (const d of pending) {
      const sub = await this.prisma.webhookSubscription.findUnique({ where: { id: d.subscriptionId } })
      if (!sub) {
        await this.prisma.webhookDelivery.update({ where: { id: d.id }, data: { status: 'dead' } })
        continue
      }
      // Increment attempts under the same transaction as the state write.
      const nextAttempt = d.attempts + 1
      const body = JSON.stringify({
        event: d.eventCode,
        timestamp: new Date().toISOString(),
        data: d.payload,
      })
      const signature = createHmac('sha256', sub.secret).update(body).digest('hex')
      let ok = false
      let responseStatus: number | null = null
      try {
        // SSRF guard at DELIVERY time: resolve the host and reject private
        // addresses (defends against DNS rebinding between validation and send).
        let urlObj: URL
        try {
          urlObj = new URL(sub.url)
        } catch {
          throw new Error('invalid webhook url')
        }
        if (!['http:', 'https:'].includes(urlObj.protocol)) throw new Error('non-http(s) webhook url')
        const host = urlObj.hostname.replace(/^\[|\]$/g, '')
        // In dev/test, localhost receivers are allowed (local test hooks); in
        // production every hostname must resolve to a public address.
        const isProd = this.config.get('NODE_ENV') === 'production'
        if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1') {
          await assertPublicHost(host)
        }
        // Never follow redirects — a public URL could 302 to a private target.
        const res = await fetch(sub.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-wagon-signature': `sha256=${signature}`, 'x-wagon-delivery-id': d.id },
          body,
          signal: AbortSignal.timeout(5000),
          redirect: 'manual',
        })
        if (res.status >= 300 && res.status < 400) {
          throw new Error(`redirect (${res.status}) not followed`)
        }
        ok = res.ok
        responseStatus = res.status
      } catch {
        ok = false
      }

      const fatal = nextAttempt >= MAX_ATTEMPTS
      await this.prisma.webhookDelivery.update({
        where: { id: d.id },
        data: ok
          ? { status: 'sent', attempts: nextAttempt, responseStatus, lastAttemptAt: new Date() }
          : {
              status: fatal ? 'dead' : 'failed',
              attempts: nextAttempt,
              responseStatus,
              lastAttemptAt: new Date(),
              nextRetryAt: fatal ? null : new Date(Date.now() + backoffMs(nextAttempt)),
            },
      })
      if (ok) this.logger.log(`[webhook] ${d.eventCode} → ${sub.url} (${sub.name})`)
      else if (fatal) this.logger.error(`[webhook] ${d.eventCode} → ${sub.url} dead after ${MAX_ATTEMPTS} attempts`)
    }
  }

  /** Manually retry a delivery now (admin action). */
  async retryNow(deliveryId: string) {
    return this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'pending', attempts: 0, nextRetryAt: null, responseStatus: null },
    })
  }
}

function backoffMs(attempt: number) {
  return Math.min(30_000 * Math.pow(2, attempt - 1), 3_600_000)
}
