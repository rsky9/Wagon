import { Injectable, BadRequestException, NotFoundException, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { OrgAccessService } from '../org-access/org-access.service'
import { WebhookDispatcher } from './webhook-dispatcher.service'
import type { User } from '@prisma/client'

const CONNECTOR_KINDS = ['tms', 'erp', 'carrier_api', 'tracking', 'customs']
const SSRF_BLOCKED = ['127.0.0.1', '::1', '0.0.0.0', '169.254.169.254', 'metadata.google.internal', '[::1]']

/** True when a host resolves to (or literally is) a private/reserved range. */
function isPrivateHost(host: string): boolean {
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 169 && b === 254) return true
    if (a >= 224) return true
    return false
  }
  return false
}

/** HMAC-style sha256 hex for machine credential verification (not reversible). */
export function sha256(input: string) {
  return createHash('sha256').update(input).digest('hex')
}

/** Connector marketplace: discoverable connector definitions any org can install. */
export interface ConnectorDefinition {
  kind: string
  name: string
  description: string
  protocol: string
  capabilities: string[]
  configSchema: string[]
}

export const CONNECTOR_CATALOG: ConnectorDefinition[] = [
  {
    kind: 'tms',
    name: 'Transport Management System',
    description: 'Exchange loads, trips and POD status with your TMS',
    protocol: 'REST + webhooks',
    capabilities: ['load.sync', 'trip.status', 'pod.receive'],
    configSchema: ['baseUrl', 'apiKeyRef'],
  },
  {
    kind: 'erp',
    name: 'ERP / Finance',
    description: 'Sync invoices, settlements and GST data to your ERP',
    protocol: 'REST + webhooks',
    capabilities: ['invoice.sync', 'settlement.sync', 'gst.report'],
    configSchema: ['baseUrl', 'apiKeyRef'],
  },
  {
    kind: 'carrier_api',
    name: 'Carrier API',
    description: 'Book and track with partner carrier APIs (ocean/air/rail)',
    protocol: 'REST / EDI-X12',
    capabilities: ['booking.create', 'tracking.poll', 'rate.fetch'],
    configSchema: ['baseUrl', 'apiKeyRef', 'ediProfile'],
  },
  {
    kind: 'tracking',
    name: 'IoT / Telematics',
    description: 'Receive GPS and telematics events from fleet devices',
    protocol: 'webhook / MQTT bridge',
    capabilities: ['gps.ingest', 'temp.sensor', 'device.events'],
    configSchema: ['webhookUrl', 'tokenRef'],
  },
  {
    kind: 'customs',
    name: 'Customs / EDI',
    description: 'File declarations and exchange documents with customs brokers',
    protocol: 'SFTP / EDIFACT',
    capabilities: ['declaration.file', 'document.exchange', 'status.webhook'],
    configSchema: ['sftpHost', 'sftpUser', 'keyRef', 'brokerRef'],
  },
]

/** The event catalog every webhook subscription can choose from. */
export const WEBHOOK_EVENT_CATALOG: Array<{ code: string; label: string; source: string }> = [
  { code: 'SHIPMENT_CREATED', label: 'Shipment created', source: 'foundation' },
  { code: 'PLAN_PROPOSED', label: 'Plan proposed', source: 'planning' },
  { code: 'PLAN_SELECTED', label: 'Plan selected', source: 'planning' },
  { code: 'LEG_DEPARTED', label: 'Leg departed', source: 'foundation' },
  { code: 'LEG_ARRIVED', label: 'Leg arrived', source: 'foundation' },
  { code: 'LEG_FAILED', label: 'Leg failed', source: 'foundation' },
  { code: 'LOAD_CREATED', label: 'Load created', source: 'loads' },
  { code: 'BOOKING_CONFIRMED', label: 'Carrier booking confirmed', source: 'forwarding' },
  { code: 'CLAIM_FILED', label: 'Claim filed', source: 'finance' },
  { code: 'SETTLEMENT_PAID', label: 'Settlement paid', source: 'finance' },
  { code: 'AI_RECOMMENDED', label: 'AI recommendation', source: 'ai' },
  { code: 'AI_DECIDED', label: 'AI decision', source: 'ai' },
]

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
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new BadRequestException('Invalid webhook URL')
    }
    const host = parsed.hostname.toLowerCase()
    const isProd = this.config.get('NODE_ENV') === 'production'
    // Cloud-metadata + loopback aliases are ALWAYS blocked (SSRF), in dev too.
    if (SSRF_BLOCKED.includes(host)) {
      throw new BadRequestException('Webhook URL host not allowed')
    }
    // localhost is allowed in dev (local test receivers) but blocked in prod.
    if (isProd && (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal'))) {
      throw new BadRequestException('Webhook URL host not allowed')
    }
    // Private/reserved IP ranges are always an SSRF risk.
    if (isPrivateHost(host)) {
      throw new BadRequestException('Webhook URL host must be publicly reachable')
    }
  }

  // ---------- Connectors ----------

  /** Management actions (create/update/delete/rotate) require owner/admin org-role. */
  private async assertOrgAdmin(user: User, orgId: string) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { organizationId: orgId, userId: user.id, role: { in: ['owner', 'admin'] } },
    })
    if (!member) throw new ForbiddenException('Requires owner/admin role in this organization')
  }

  /** Connector marketplace: list discoverable connector definitions + webhook event catalog. */
  catalog() {
    return { connectors: CONNECTOR_CATALOG, events: WEBHOOK_EVENT_CATALOG }
  }

  /** Install a connector from the marketplace (kind must exist in the catalog). */
  async installConnector(input: { kind: string; name?: string; baseUrl?: string; apiKeyRef?: string; config?: unknown }, user: User) {
    const definition = CONNECTOR_CATALOG.find((c) => c.kind === input.kind)
    if (!definition) throw new BadRequestException(`Connector kind "${input.kind}" not in the marketplace`)
    return this.createConnector({
      kind: input.kind,
      name: input.name?.trim() || definition.name,
      baseUrl: input.baseUrl,
      apiKeyRef: input.apiKeyRef,
      config: input.config,
    }, user)
  }

  async createConnector(input: { kind: string; name: string; baseUrl?: string; apiKeyRef?: string; config?: unknown; generateKey?: boolean }, user: User) {
    const org = await this.orgAccess.primaryOrg(user)
    await this.assertOrgAdmin(user, org.id)
    if (!CONNECTOR_KINDS.includes(input.kind)) throw new BadRequestException('Invalid connector kind')
    if (!input.name?.trim()) throw new BadRequestException('Connector name required')
    // Optional machine credential for the programmatic marketplace.
    let apiKeyHash: string | undefined
    let apiKey: string | undefined
    if (input.generateKey) {
      apiKey = `wgn_${randomBytes(24).toString('base64url')}`
      apiKeyHash = sha256(apiKey)
    }
    const connector = await this.prisma.integrationConnector.create({
      data: {
        orgId: org.id,
        kind: input.kind,
        name: input.name.trim(),
        baseUrl: input.baseUrl,
        apiKeyRef: input.apiKeyRef,
        apiKeyHash,
        config: input.config as never,
        status: 'active',
      },
    })
    // Never leak the hash; return the raw key exactly once.
    const { apiKeyHash: _hash, ...safe } = connector
    return { connector: safe, ...(apiKey ? { apiKey, note: 'Store this key — it is shown only once. Authenticate programmatic calls with x-api-key.' } : {}) }
  }

  /** Resolve an active connector by its machine credential (programmatic calls). */
  async verifyApiKey(apiKey: string): Promise<{ connectorId: string; orgId: string }> {
    if (!apiKey) throw new UnauthorizedException('Missing x-api-key')
    const connector = await this.prisma.integrationConnector.findUnique({ where: { apiKeyHash: sha256(apiKey) } })
    if (!connector || connector.status !== 'active') throw new UnauthorizedException('Invalid or disabled API key')
    return { connectorId: connector.id, orgId: connector.orgId }
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
    await this.assertOrgAdmin(user, connector.orgId)
    const updated = await this.prisma.integrationConnector.update({ where: { id }, data: { status } })
    return { connector: updated }
  }

  async deleteConnector(id: string, user: User) {
    const connector = await this.prisma.integrationConnector.findUnique({ where: { id } })
    if (!connector) throw new NotFoundException('Connector not found')
    if (!(await this.orgAccess.isMember(user, connector.orgId))) throw new ForbiddenException('Not your connector')
    await this.assertOrgAdmin(user, connector.orgId)
    await this.prisma.integrationConnector.delete({ where: { id } })
    return { deleted: true }
  }

  // ---------- Webhooks ----------

  async createWebhook(input: { name: string; url: string; eventTypes: string[] }, user: User) {
    this.validateWebhookUrl(input.url)
    if (!input.eventTypes?.length) throw new BadRequestException('Need at least one event type')
    const org = await this.orgAccess.primaryOrg(user)
    await this.assertOrgAdmin(user, org.id)
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
    await this.assertOrgAdmin(user, webhook.orgId)
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
    await this.assertOrgAdmin(user, webhook.orgId)
    const updated = await this.prisma.webhookSubscription.update({ where: { id }, data: { status } })
    return { webhook: this.stripSecret(updated) }
  }

  async rotateSecret(id: string, user: User) {
    const webhook = await this.prisma.webhookSubscription.findUnique({ where: { id } })
    if (!webhook) throw new NotFoundException('Webhook not found')
    if (!(await this.orgAccess.isMember(user, webhook.orgId))) throw new ForbiddenException('Not your webhook')
    await this.assertOrgAdmin(user, webhook.orgId)
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
