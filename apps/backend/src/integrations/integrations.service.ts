import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { OrgAccessService } from '../org-access/org-access.service'
import { WebhookDispatcher } from './webhook-dispatcher.service'
import type { User } from '@prisma/client'

const CONNECTOR_KINDS = ['tms', 'erp', 'carrier_api', 'tracking', 'customs']
const SSRF_BLOCKED = ['127.0.0.1', '::1', '0.0.0.0', '169.254.169.254', 'metadata.google.internal', '[::1]']

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAccess: OrgAccessService,
    private readonly dispatcher: WebhookDispatcher,
    private readonly config: ConfigService,
  ) {}

  private stripSecret<T extends { secret: string }>(obj: T) {
    const { secret: _secret, ...rest } = obj
    return rest
  }

  private validateWebhookUrl(url: string) {
    if (!/^https?:\/\//.test(url)) throw new BadRequestException('Webhook URL must be http(s)')
    const host = (() => {
      try {
        return new URL(url).hostname.toLowerCase()
      } catch {
        throw new BadRequestException('Invalid webhook URL')
      }
    })()
    const isProd = this.config.get('NODE_ENV') === 'production'
    // In dev, localhost is allowed so integrations can be tested against local receivers.
    const blocked = isProd ? [...SSRF_BLOCKED, 'localhost'] : SSRF_BLOCKED
    if (blocked.includes(host) || (!isProd && (host.endsWith('.local') || host.endsWith('.internal')))) {
      throw new BadRequestException('Webhook URL host not allowed')
    }
  }

  // ---------- Connectors ----------

  async createConnector(input: { kind: string; name: string; baseUrl?: string; apiKeyRef?: string; config?: unknown }, user: User) {
    const org = await this.orgAccess.primaryOrg(user)
    if (!CONNECTOR_KINDS.includes(input.kind)) throw new BadRequestException('Invalid connector kind')
    if (!input.name?.trim()) throw new BadRequestException('Connector name required')
    const connector = await this.prisma.integrationConnector.create({
      data: {
        orgId: org.id,
        kind: input.kind,
        name: input.name.trim(),
        baseUrl: input.baseUrl,
        apiKeyRef: input.apiKeyRef,
        config: input.config as never,
        status: 'active',
      },
    })
    return { connector }
  }

  async listConnectors(user: User) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const connectors = await this.prisma.integrationConnector.findMany({ where: { orgId: { in: orgIds } }, orderBy: { createdAt: 'desc' } })
    return { connectors }
  }

  async connectorDetail(id: string, user: User) {
    const connector = await this.prisma.integrationConnector.findUnique({ where: { id } })
    if (!connector) throw new NotFoundException('Connector not found')
    if (!(await this.orgAccess.isMember(user, connector.orgId))) throw new ForbiddenException('Not your connector')
    return { connector }
  }

  /** Poke a connector: mark lastSyncAt (a real sync would poll the carrier API). */
  async syncConnector(id: string, user: User) {
    const connector = await this.prisma.integrationConnector.findUnique({ where: { id } })
    if (!connector) throw new NotFoundException('Connector not found')
    if (!(await this.orgAccess.isMember(user, connector.orgId))) throw new ForbiddenException('Not your connector')
    const updated = await this.prisma.integrationConnector.update({ where: { id }, data: { lastSyncAt: new Date() } })
    return { connector: updated, syncedAt: updated.lastSyncAt }
  }

  async setConnectorStatus(id: string, status: 'active' | 'disabled', user: User) {
    const connector = await this.prisma.integrationConnector.findUnique({ where: { id } })
    if (!connector) throw new NotFoundException('Connector not found')
    if (!(await this.orgAccess.isMember(user, connector.orgId))) throw new ForbiddenException('Not your connector')
    const updated = await this.prisma.integrationConnector.update({ where: { id }, data: { status } })
    return { connector: updated }
  }

  async deleteConnector(id: string, user: User) {
    const connector = await this.prisma.integrationConnector.findUnique({ where: { id } })
    if (!connector) throw new NotFoundException('Connector not found')
    if (!(await this.orgAccess.isMember(user, connector.orgId))) throw new ForbiddenException('Not your connector')
    await this.prisma.integrationConnector.delete({ where: { id } })
    return { deleted: true }
  }

  // ---------- Webhooks ----------

  async createWebhook(input: { name: string; url: string; eventTypes: string[] }, user: User) {
    this.validateWebhookUrl(input.url)
    if (!input.eventTypes?.length) throw new BadRequestException('Need at least one event type')
    const org = await this.orgAccess.primaryOrg(user)
    const secret = randomBytes(32).toString('hex')
    const webhook = await this.prisma.webhookSubscription.create({
      data: { orgId: org.id, name: input.name, url: input.url, secret, eventTypes: input.eventTypes as never, status: 'active' },
    })
    return { webhook: { ...this.stripSecret(webhook), secret } }
  }

  async listWebhooks(user: User) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const webhooks = await this.prisma.webhookSubscription.findMany({ where: { orgId: { in: orgIds } }, orderBy: { createdAt: 'desc' } })
    return { webhooks: webhooks.map((w) => this.stripSecret(w)) }
  }

  async webhookDetail(id: string, user: User) {
    const webhook = await this.prisma.webhookSubscription.findUnique({ where: { id } })
    if (!webhook) throw new NotFoundException('Webhook not found')
    if (!(await this.orgAccess.isMember(user, webhook.orgId))) throw new ForbiddenException('Not your webhook')
    return { webhook: this.stripSecret(webhook) }
  }

  async updateWebhook(id: string, input: { name?: string; url?: string; eventTypes?: string[] }, user: User) {
    const webhook = await this.prisma.webhookSubscription.findUnique({ where: { id } })
    if (!webhook) throw new NotFoundException('Webhook not found')
    if (!(await this.orgAccess.isMember(user, webhook.orgId))) throw new ForbiddenException('Not your webhook')
    if (input.url) this.validateWebhookUrl(input.url)
    if (input.eventTypes && !input.eventTypes.length) throw new BadRequestException('Need at least one event type')
    const updated = await this.prisma.webhookSubscription.update({
      where: { id },
      data: {
        name: input.name,
        url: input.url,
        eventTypes: input.eventTypes as never,
      },
    })
    return { webhook: this.stripSecret(updated) }
  }

  async setWebhookStatus(id: string, status: 'active' | 'paused', user: User) {
    const webhook = await this.prisma.webhookSubscription.findUnique({ where: { id } })
    if (!webhook) throw new NotFoundException('Webhook not found')
    if (!(await this.orgAccess.isMember(user, webhook.orgId))) throw new ForbiddenException('Not your webhook')
    const updated = await this.prisma.webhookSubscription.update({ where: { id }, data: { status } })
    return { webhook: this.stripSecret(updated) }
  }

  async rotateSecret(id: string, user: User) {
    const webhook = await this.prisma.webhookSubscription.findUnique({ where: { id } })
    if (!webhook) throw new NotFoundException('Webhook not found')
    if (!(await this.orgAccess.isMember(user, webhook.orgId))) throw new ForbiddenException('Not your webhook')
    const secret = randomBytes(32).toString('hex')
    await this.prisma.webhookSubscription.update({ where: { id }, data: { secret } })
    return { rotated: true, secret }
  }

  async deliveries(id: string, user: User) {
    const webhook = await this.prisma.webhookSubscription.findUnique({ where: { id } })
    if (!webhook) throw new NotFoundException('Webhook not found')
    if (!(await this.orgAccess.isMember(user, webhook.orgId))) throw new ForbiddenException('Not your webhook')
    const deliveries = await this.prisma.webhookDelivery.findMany({ where: { subscriptionId: id }, orderBy: { createdAt: 'desc' }, take: 50 })
    return { webhook: this.stripSecret(webhook), deliveries }
  }

  /** Send a probe delivery to verify the endpoint + signature path. */
  async testWebhook(id: string, user: User) {
    const webhook = await this.prisma.webhookSubscription.findUnique({ where: { id } })
    if (!webhook) throw new NotFoundException('Webhook not found')
    if (!(await this.orgAccess.isMember(user, webhook.orgId))) throw new ForbiddenException('Not your webhook')
    const delivery = await this.prisma.webhookDelivery.create({
      data: {
        subscriptionId: id,
        eventCode: '__TEST__',
        payload: { test: true, at: new Date().toISOString() } as never,
        status: 'pending',
      },
    })
    return { delivery, note: 'A probe delivery has been queued; check /deliveries for the outcome' }
  }

  async retryDelivery(deliveryId: string, user: User) {
    const delivery = await this.prisma.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { subscription: true } })
    if (!delivery) throw new NotFoundException('Delivery not found')
    if (!(await this.orgAccess.isMember(user, delivery.subscription.orgId))) throw new ForbiddenException('Not your delivery')
    const updated = await this.dispatcher.retryNow(deliveryId)
    return { delivery: updated }
  }

  async listDeliveries(user: User, status?: string) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const subscriptions = await this.prisma.webhookSubscription.findMany({ where: { orgId: { in: orgIds } }, select: { id: true } })
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: { subscriptionId: { in: subscriptions.map((s) => s.id) }, ...(status ? { status } : {}) },
      include: { subscription: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { deliveries }
  }
}
