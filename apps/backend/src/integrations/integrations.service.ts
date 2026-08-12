import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The user's organization (first member org) — connector/webhook ownership. */
  private async orgOf(user: User) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { userId: user.id },
      include: { organization: true },
    })
    if (!member) throw new BadRequestException('User belongs to no organization')
    return member.organization
  }

  // ---------- Connectors ----------

  async createConnector(input: { kind: string; name: string; baseUrl?: string; apiKeyRef?: string; config?: unknown }, user: User) {
    const org = await this.orgOf(user)
    if (!['tms', 'erp', 'carrier_api', 'tracking', 'customs'].includes(input.kind)) throw new BadRequestException('Invalid connector kind')
    const connector = await this.prisma.integrationConnector.create({
      data: {
        orgId: org.id,
        kind: input.kind,
        name: input.name,
        baseUrl: input.baseUrl,
        apiKeyRef: input.apiKeyRef,
        config: input.config as never,
        status: 'active',
      },
    })
    return { connector }
  }

  async listConnectors(user: User) {
    const org = await this.orgOf(user)
    const connectors = await this.prisma.integrationConnector.findMany({ where: { orgId: org.id }, orderBy: { createdAt: 'desc' } })
    return { connectors }
  }

  /** Poke a connector: mark lastSyncAt (a real sync would poll the carrier API). */
  async syncConnector(id: string, user: User) {
    const org = await this.orgOf(user)
    const connector = await this.prisma.integrationConnector.findFirst({ where: { id, orgId: org.id } })
    if (!connector) throw new NotFoundException('Connector not found')
    const updated = await this.prisma.integrationConnector.update({ where: { id }, data: { lastSyncAt: new Date() } })
    return { connector: updated, syncedAt: updated.lastSyncAt }
  }

  // ---------- Webhooks ----------

  async createWebhook(input: { name: string; url: string; eventTypes: string[] }, user: User) {
    if (!/^https?:\/\//.test(input.url)) throw new BadRequestException('Webhook URL must be http(s)')
    if (!input.eventTypes?.length) throw new BadRequestException('Need at least one event type')
    const org = await this.orgOf(user)
    const secret = randomBytes(32).toString('hex')
    const webhook = await this.prisma.webhookSubscription.create({
      data: { orgId: org.id, name: input.name, url: input.url, secret, eventTypes: input.eventTypes as never, status: 'active' },
    })
    return { webhook: { ...webhook, secret } }
  }

  async listWebhooks(user: User) {
    const org = await this.orgOf(user)
    const webhooks = await this.prisma.webhookSubscription.findMany({ where: { orgId: org.id }, orderBy: { createdAt: 'desc' } })
    return { webhooks }
  }

  async deliveries(id: string, user: User) {
    const org = await this.orgOf(user)
    const webhook = await this.prisma.webhookSubscription.findFirst({ where: { id, orgId: org.id } })
    if (!webhook) throw new NotFoundException('Webhook not found')
    const deliveries = await this.prisma.webhookDelivery.findMany({ where: { subscriptionId: id }, orderBy: { createdAt: 'desc' }, take: 50 })
    return { webhook, deliveries }
  }
}
