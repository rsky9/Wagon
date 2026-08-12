import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { createHmac } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Webhook fan-out (Phase 5): after the outbox relay marks a message published,
 * matching subscriptions get a WebhookDelivery. This loop retries pending/failed
 * deliveries up to 3 attempts with HMAC-SHA256 signing.
 */
@Injectable()
export class WebhookDispatcher implements OnModuleInit {
  private readonly logger = new Logger(WebhookDispatcher.name)
  private running = false

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.running = true
    void this.loop()
  }

  /** Enqueue deliveries for every active subscription matching the event code. */
  async enqueue(eventCode: string, payload: unknown) {
    const subs = await this.prisma.webhookSubscription.findMany({
      where: { status: 'active' },
    })
    for (const sub of subs) {
      const types = sub.eventTypes as string[]
      if (!types?.includes(eventCode)) continue
      await this.prisma.webhookDelivery.create({
        data: { subscriptionId: sub.id, eventCode, payload: payload as never },
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

  private async deliver() {
    const pending = await this.prisma.webhookDelivery.findMany({
      where: { status: { in: ['pending', 'failed'] }, OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }] },
      include: { subscription: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
    })
    for (const d of pending) {
      if (d.attempts >= 3) {
        await this.prisma.webhookDelivery.update({ where: { id: d.id }, data: { status: 'failed' } })
        continue
      }
      const body = JSON.stringify({
        event: d.eventCode,
        timestamp: new Date().toISOString(),
        data: d.payload,
      })
      const signature = createHmac('sha256', d.subscription.secret).update(body).digest('hex')
      let ok = false
      try {
        const res = await fetch(d.subscription.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-wagon-signature': `sha256=${signature}` },
          body,
          signal: AbortSignal.timeout(5000),
        })
        ok = res.ok
        await this.prisma.webhookDelivery.update({
          where: { id: d.id },
          data: { status: ok ? 'sent' : 'failed', responseStatus: res.status, lastAttemptAt: new Date() },
        })
      } catch {
        await this.prisma.webhookDelivery.update({
          where: { id: d.id },
          data: { status: 'failed', lastAttemptAt: new Date(), nextRetryAt: new Date(Date.now() + 30_000) },
        })
      }
      if (ok) this.logger.log(`[webhook] ${d.eventCode} → ${d.subscription.url} (${d.subscription.name})`)
    }
  }
}
