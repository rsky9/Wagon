import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OutboxRelay } from '../outbox/outbox-relay.service'
import { OrgAccessService } from '../org-access/org-access.service'
import type { User } from '@prisma/client'

const VALID_KINDS = ['shipper', 'transporter', 'forwarder', 'warehouse', 'carrier', 'broker', 'other']
const VALID_ROLES = ['owner', 'admin', 'operator', 'member']
const VALID_MODES = ['road', 'rail', 'ocean', 'air', 'inland_water', 'multimodal']

/** Allowed Shipment status transitions (source -> allowed targets). */
const SHIPMENT_TRANSITIONS: Record<string, string[]> = {
  draft: ['planned', 'quoted', 'cancelled'],
  planned: ['quoted', 'booked', 'cancelled'],
  quoted: ['booked', 'cancelled'],
  booked: ['in_transit', 'cancelled'],
  in_transit: ['delivered', 'cancelled'],
  delivered: ['closed'],
  closed: [],
  cancelled: [],
}

@Injectable()
export class FoundationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAccess: OrgAccessService,
    @Inject(OutboxRelay) private readonly outbox: OutboxRelay,
  ) {}

  // ---------- Organizations ----------

  async createOrganization(name: string, kind: string, user: User, countryCode?: string) {
    if (!name?.trim()) throw new BadRequestException('Organization name required')
    if (!VALID_KINDS.includes(kind)) throw new BadRequestException('Invalid organization kind')
    const org = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({ data: { name: name.trim(), kind, countryCode: countryCode ?? 'IN' } })
      await tx.organizationMember.create({
        data: { organizationId: created.id, userId: user.id, role: 'owner' },
      })
      await this.outbox.emit(tx as never, {
        eventType: 'ORGANIZATION',
        eventCode: 'ORG_CREATED',
        entityType: 'organization',
        entityId: created.id,
        orgId: created.id,
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

  async organizationDetail(id: string, user: User) {
    const org = await this.prisma.organization.findUnique({ where: { id } })
    if (!org) throw new NotFoundException('Organization not found')
    if (!(await this.orgAccess.isMember(user, id))) throw new ForbiddenException('Not a member of this organization')
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: id },
      include: { user: { select: { id: true, name: true, mobile: true, verified: true } } },
    })
    return { organization: org, members }
  }

  async updateOrganization(id: string, input: { name?: string; gst?: string; countryCode?: string }, user: User) {
    const org = await this.prisma.organization.findUnique({ where: { id } })
    if (!org) throw new NotFoundException('Organization not found')
    if (!(await this.orgAccess.isMember(user, id, 'owner'))) throw new ForbiddenException('Only the owner can update the organization')
    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        name: input.name?.trim() || undefined,
        gst: input.gst ?? undefined,
        countryCode: input.countryCode ?? undefined,
      },
    })
    return { organization: updated }
  }

  async listMembers(id: string, user: User) {
    const org = await this.prisma.organization.findUnique({ where: { id } })
    if (!org) throw new NotFoundException('Organization not found')
    if (!(await this.orgAccess.isMember(user, id))) throw new ForbiddenException('Not a member of this organization')
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId: id },
      include: { user: { select: { id: true, name: true, mobile: true, verified: true } } },
    })
    return { members }
  }

  async addMember(organizationId: string, mobile: string, role: string | undefined, user: User) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { organizationId, userId: user.id },
    })
    if (!member || !['owner', 'admin'].includes(member.role)) {
      throw new ForbiddenException('Only owners/admins can add members')
    }
    const target = await this.prisma.user.findUnique({ where: { mobile } })
    if (!target) throw new NotFoundException('User not found')
    const newRole = role ?? 'member'
    if (!VALID_ROLES.includes(newRole)) throw new BadRequestException('Invalid member role')
    // Only the owner can create another owner; admins can add admin/operator/member.
    if (newRole === 'owner' && member.role !== 'owner') throw new ForbiddenException('Only the owner can grant owner role')
    const created = await this.prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId, userId: target.id } },
      update: { role: newRole },
      create: { organizationId, userId: target.id, role: newRole },
    })
    return { member: created }
  }

  async removeMember(organizationId: string, userId: string, user: User) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { organizationId, userId: user.id },
    })
    if (!member || !['owner', 'admin'].includes(member.role)) {
      throw new ForbiddenException('Only owners/admins can remove members')
    }
    const target = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    })
    if (!target) throw new NotFoundException('Member not found')
    // An admin cannot remove the owner; only the owner can.
    if (target.role === 'owner' && member.role !== 'owner') throw new ForbiddenException('Only the owner can remove the owner')
    if (member.role === 'owner' && member.userId === userId) throw new BadRequestException('Owner cannot remove self')
    await this.prisma.organizationMember.delete({ where: { organizationId_userId: { organizationId, userId } } })
    return { removed: true }
  }

  async setMemberRole(organizationId: string, userId: string, role: string, user: User) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { organizationId, userId: user.id },
    })
    if (!member || member.role !== 'owner') throw new ForbiddenException('Only the owner can change roles')
    if (!VALID_ROLES.includes(role)) throw new BadRequestException('Invalid member role')
    if (member.userId === userId && role !== 'owner') throw new BadRequestException('Owner must stay owner')
    const updated = await this.prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId, userId } },
      data: { role },
    })
    return { member: updated }
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
    originId?: string
    destinationId?: string
  }, user: User) {
    const ownerOrg = await this.orgAccess.primaryOrg(user)
    this.validateShipmentInput(input)
    const shipment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.shipment.create({
        data: {
          ref: input.ref?.trim() || `SHIP-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5)}`,
          ownerOrgId: ownerOrg.id,
          commodity: input.commodity,
          description: input.description,
          weightKg: input.weightKg,
          volumeM3: input.volumeM3,
          pieces: input.pieces,
          pickupWindow: input.pickupWindow ? new Date(input.pickupWindow) : null,
          deliveryWindow: input.deliveryWindow ? new Date(input.deliveryWindow) : null,
          value: input.value,
          mode: input.mode ?? 'road',
          originId: input.originId,
          destinationId: input.destinationId,
          status: 'draft',
        },
      })
      await this.outbox.emit(tx as never, {
        eventType: 'SHIPMENT',
        eventCode: 'SHIPMENT_CREATED',
        entityType: 'shipment',
        entityId: created.id,
        orgId: ownerOrg.id,
        shipmentId: created.id,
        actorId: user.id,
        payload: { ref: created.ref },
      })
      return created
    })
    return { shipment }
  }

  async updateShipment(id: string, input: Record<string, unknown>, user: User) {
    const shipment = await this.orgAccess.assertShipmentAccess(user, id)
    const data: Record<string, unknown> = {}
    for (const key of ['commodity', 'description', 'weightKg', 'volumeM3', 'pieces', 'value', 'mode']) {
      if (key in input && input[key] !== undefined) data[key] = input[key]
    }
    if ('pickupWindow' in input && input.pickupWindow !== undefined) data.pickupWindow = new Date(input.pickupWindow as string)
    if ('deliveryWindow' in input && input.deliveryWindow !== undefined) data.deliveryWindow = new Date(input.deliveryWindow as string)
    if ('mode' in data) this.validateMode(data.mode as string)
    const updated = await this.prisma.shipment.update({ where: { id }, data: data as never })
    return { shipment: updated }
  }

  async transitionShipment(id: string, status: string, user: User) {
    const shipment = await this.orgAccess.assertShipmentAccess(user, id)
    const allowed = SHIPMENT_TRANSITIONS[shipment.status]
    if (!allowed) throw new BadRequestException(`No transitions from ${shipment.status}`)
    if (!allowed.includes(status)) throw new BadRequestException(`Cannot go ${shipment.status} -> ${status}`)
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.shipment.update({ where: { id }, data: { status: status as never } })
      await this.outbox.emit(tx as never, {
        eventType: 'SHIPMENT',
        eventCode: `SHIPMENT_${status.toUpperCase().replace('-', '_')}`,
        entityType: 'shipment',
        entityId: id,
        orgId: shipment.ownerOrgId ?? null,
        shipmentId: id,
        actorId: user.id,
        payload: { from: shipment.status, to: status },
      })
      return changed
    })
    return { shipment: updated }
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
    const shipment = await this.orgAccess.assertShipmentAccess(user, shipmentId)
    this.validateMode(input.mode)
    const leg = await this.prisma.$transaction(async (tx) => {
      // Compute the next sequence inside the transaction to avoid the
      // @@unique([shipmentId, sequence]) race under concurrent adds.
      const seq = input.sequence ?? (await tx.shipmentLeg.count({ where: { shipmentId } })) + 1
      if (input.sequence != null) {
        const clash = await tx.shipmentLeg.findUnique({
          where: { shipmentId_sequence: { shipmentId, sequence: input.sequence } },
        })
        if (clash) throw new BadRequestException(`Sequence ${input.sequence} already exists on this shipment`)
      }
      const created = await tx.shipmentLeg.create({
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
      await this.outbox.emit(tx as never, {
        eventType: 'TRANSPORT',
        eventCode: 'LEG_PLANNED',
        entityType: 'leg',
        entityId: created.id,
        orgId: shipment.ownerOrgId ?? null,
        shipmentId,
        legId: created.id,
        actorId: user.id,
        payload: { mode: created.mode, sequence: created.sequence },
      })
      return created
    })
    return { leg }
  }

  async listShipments(user: User, query?: { status?: string; mode?: string; skip?: number; take?: number }) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const where: Record<string, unknown> = { ownerOrgId: { in: orgIds } }
    if (query?.status) where.status = query.status
    if (query?.mode) where.mode = query.mode
    const take = Math.min(query?.take ?? 50, 100)
    const skip = query?.skip ?? 0
    const [shipments, total] = await this.prisma.$transaction([
      this.prisma.shipment.findMany({
        where: where as never,
        include: { legs: { orderBy: { sequence: 'asc' } }, activePlan: true },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.shipment.count({ where: where as never }),
    ])
    return { shipments, total, page: Math.floor(skip / take) + 1, pageSize: take }
  }

  async shipmentDetail(id: string, user: User) {
    await this.orgAccess.assertShipmentAccess(user, id)
    const shipment = await this.prisma.shipment.findUnique({
      where: { id },
      include: {
        legs: { orderBy: { sequence: 'asc' }, include: { provider: true } },
        events: { orderBy: { occurredAt: 'desc' }, take: 50 },
        plans: { orderBy: { createdAt: 'desc' }, take: 20 },
        forwardOrder: true,
        claims: { orderBy: { createdAt: 'desc' } },
        settlements: { orderBy: { createdAt: 'desc' }, include: { payment: true } },
        warehouseOps: { orderBy: { createdAt: 'desc' } },
        consolidations: true,
      },
    })
    if (!shipment) throw new NotFoundException('Shipment not found')
    // Load↔shipment linkage: a load-projected shipment (ref = load.id) surfaces its source load.
    let sourceLoad: { id: string; pickupAddr: string; dropAddr: string; status: string; date: string } | null = null
    if (shipment.ref && shipment.ref.length > 8) {
      const load = await this.prisma.load.findUnique({
        where: { id: shipment.ref },
        select: { id: true, pickupAddr: true, dropAddr: true, status: true, date: true },
      })
      if (load) sourceLoad = { ...load, date: load.date.toISOString() }
    }
    return { shipment, sourceLoad }
  }

  // ---------- Events ----------

  async events(user: User, query?: { entityType?: string; entityId?: string; shipmentId?: string }) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const where: Record<string, unknown> = { orgId: { in: orgIds } }
    if (query?.entityType) where.entityType = query.entityType
    if (query?.entityId) where.entityId = query.entityId
    if (query?.shipmentId) where.shipmentId = query.shipmentId
    const events = await this.prisma.logisticsEvent.findMany({
      where: where as never,
      orderBy: { occurredAt: 'desc' },
      take: 100,
    })
    return { events }
  }

  // ---------- Validation helpers ----------

  private validateMode(mode?: string) {
    if (mode && !VALID_MODES.includes(mode)) throw new BadRequestException(`Invalid mode: ${mode}`)
  }

  private validateShipmentInput(input: Record<string, unknown>) {
    if ('weightKg' in input && input.weightKg !== undefined && Number(input.weightKg) <= 0) {
      throw new BadRequestException('weightKg must be positive')
    }
    if ('value' in input && input.value !== undefined && Number(input.value) < 0) {
      throw new BadRequestException('value cannot be negative')
    }
    if ('pieces' in input && input.pieces !== undefined && Number(input.pieces) < 0) {
      throw new BadRequestException('pieces cannot be negative')
    }
    for (const w of ['pickupWindow', 'deliveryWindow']) {
      if (w in input && input[w] !== undefined && Number.isNaN(new Date(input[w] as string).getTime())) {
        throw new BadRequestException(`Invalid ${w}`)
      }
    }
    this.validateMode(input.mode as string | undefined)
  }
}
