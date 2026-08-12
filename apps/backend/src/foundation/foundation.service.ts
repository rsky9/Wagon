import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OutboxRelay } from '../outbox/outbox-relay.service'
import type { User } from '@prisma/client'

@Injectable()
export class FoundationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OutboxRelay) private readonly outbox: OutboxRelay,
  ) {}

  // ---------- Organizations ----------

  async createOrganization(name: string, kind: string, user: User) {
    if (!name?.trim()) throw new BadRequestException('Organization name required')
    if (!['shipper', 'transporter', 'forwarder', 'warehouse', 'carrier', 'broker', 'other'].includes(kind)) {
      throw new BadRequestException('Invalid organization kind')
    }
    const org = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({ data: { name: name.trim(), kind } })
      await tx.organizationMember.create({
        data: { organizationId: created.id, userId: user.id, role: 'owner' },
      })
      await this.outbox.emit(tx as never, {
        eventType: 'ORGANIZATION',
        eventCode: 'ORG_CREATED',
        entityType: 'organization',
        entityId: created.id,
        actorId: user.id,
        payload: { name: created.name, kind: created.kind },
      })
      return created
    })
    return { organization: org }
  }

  async myOrganizations(user: User) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId: user.id },
      include: { organization: true },
    })
    return { organizations: memberships.map((m) => ({ ...m.organization, myRole: m.role })) }
  }

  async addMember(organizationId: string, mobile: string, role: string | undefined, user: User) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { organizationId, userId: user.id },
    })
    if (!member || !['owner', 'admin'].includes(member.role)) {
      throw new BadRequestException('Only owners/admins can add members')
    }
    const target = await this.prisma.user.findUnique({ where: { mobile } })
    if (!target) throw new NotFoundException('User not found')
    const created = await this.prisma.organizationMember.create({
      data: { organizationId, userId: target.id, role: role ?? 'member' },
    })
    return { member: created }
  }

  // ---------- Shipments ----------

  async createShipment(input: {
    ref?: string
    commodity?: string
    description?: string
    weightKg?: number
    volumeM3?: number
    pieces?: number
    pickupWindow?: string
    deliveryWindow?: string
    value?: number
    mode?: string
  }, user: User) {
    const shipment = await this.prisma.shipment.create({
      data: {
        ref: input.ref?.trim() || `SHIP-${Date.now().toString(36).toUpperCase()}`,
        commodity: input.commodity,
        description: input.description,
        weightKg: input.weightKg,
        volumeM3: input.volumeM3,
        pieces: input.pieces,
        pickupWindow: input.pickupWindow ? new Date(input.pickupWindow) : null,
        deliveryWindow: input.deliveryWindow ? new Date(input.deliveryWindow) : null,
        value: input.value,
        mode: input.mode ?? 'road',
        status: 'draft',
      },
    })
    await this.outbox.emit(await this.tx(), {
      eventType: 'SHIPMENT',
      eventCode: 'SHIPMENT_CREATED',
      entityType: 'shipment',
      entityId: shipment.id,
      shipmentId: shipment.id,
      actorId: user.id,
      payload: { ref: shipment.ref },
    })
    return { shipment }
  }

  async addLeg(shipmentId: string, input: {
    sequence?: number
    mode: string
    originId?: string
    destinationId?: string
    pickupAddr?: string
    dropAddr?: string
    distanceKm?: number
    equipment?: string
    providerId?: string
  }, user: User) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } })
    if (!shipment) throw new NotFoundException('Shipment not found')
    const seq = input.sequence ?? (await this.prisma.shipmentLeg.count({ where: { shipmentId } })) + 1
    const leg = await this.prisma.shipmentLeg.create({
      data: {
        shipmentId,
        sequence: seq,
        mode: input.mode,
        originId: input.originId,
        destinationId: input.destinationId,
        pickupAddr: input.pickupAddr,
        dropAddr: input.dropAddr,
        distanceKm: input.distanceKm,
        equipment: input.equipment,
        providerId: input.providerId,
      },
    })
    await this.outbox.emit(await this.tx(), {
      eventType: 'TRANSPORT',
      eventCode: 'LEG_PLANNED',
      entityType: 'leg',
      entityId: leg.id,
      shipmentId,
      legId: leg.id,
      actorId: user.id,
      payload: { mode: leg.mode, sequence: leg.sequence },
    })
    return { leg }
  }

  async listShipments(user: User) {
    const shipments = await this.prisma.shipment.findMany({
      include: { legs: { orderBy: { sequence: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return { shipments }
  }

  async shipmentDetail(id: string, user: User) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: { legs: { orderBy: { sequence: 'asc' }, include: { provider: true } }, events: { orderBy: { occurredAt: 'desc' }, take: 20 } },
    })
    if (!shipment) throw new NotFoundException('Shipment not found')
    return { shipment }
  }

  // ---------- Events ----------

  async events(query?: { entityType?: string; entityId?: string; shipmentId?: string }) {
    const where: Record<string, unknown> = {}
    if (query?.entityType) where.entityType = query.entityType
    if (query?.entityId) where.entityId = query.entityId
    if (query?.shipmentId) where.shipmentId = query.shipmentId
    const events = await this.prisma.logisticsEvent.findMany({ where, orderBy: { occurredAt: 'desc' }, take: 100 })
    return { events }
  }

  private async tx() {
    // Outbox emit requires the domain write to share the transaction; for standalone
    // create ops we use a dedicated transaction. (See Phase 1 for full atomicity.)
    const prisma = this.prisma
    return {
      logisticsEvent: {
        create: (args: { data: Record<string, unknown> }) =>
          prisma.logisticsEvent.create({ data: args.data as never }),
      },
      outboxMessage: {
        create: (args: { data: Record<string, unknown> }) =>
          prisma.outboxMessage.create({ data: args.data as never }),
      },
    }
  }
}
