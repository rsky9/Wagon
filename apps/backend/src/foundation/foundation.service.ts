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
import { MarketService } from '../market/market.service'
import { PlanningService } from '../planning/planning.service'
import { AuditService } from '../audit/audit.service'
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
    private readonly market: MarketService,
    @Inject(OutboxRelay) private readonly outbox: OutboxRelay,
    @Inject(PlanningService) private readonly planning: PlanningService,
    private readonly audit: AuditService,
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
    await this.audit.log({ actorId: user.id, action: 'org.create', resource: org.id, after: { name: org.name, kind: org.kind } })
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
    await this.audit.log({ actorId: user.id, action: 'org.update', resource: id, after: { name: updated.name, gst: updated.gst } })
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
    await this.audit.log({ actorId: user.id, action: 'org.member.add', resource: organizationId, after: { userId: target.id, role: newRole } })
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
    await this.audit.log({ actorId: user.id, action: 'org.member.remove', resource: organizationId, after: { userId } })
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
    await this.audit.log({ actorId: user.id, action: 'org.member.role', resource: organizationId, after: { userId, role } })
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
    // Marketplace bridge: planned shipments publish transport demand.
    await this.market.publishShipmentRequest(shipment, user).catch(() => {})
    await this.audit.log({ actorId: user.id, action: 'shipment.create', resource: shipment.id, after: { ref: shipment.ref, status: shipment.status } })
    return { shipment }
  }

  async updateShipment(id: string, input: Record<string, unknown>, user: User) {
    await this.orgAccess.assertShipmentAccess(user, id)
    const data: Record<string, unknown> = {}
    for (const key of ['commodity', 'description', 'weightKg', 'volumeM3', 'pieces', 'value', 'mode']) {
      if (key in input && input[key] !== undefined) data[key] = input[key]
    }
    // Reuse create-time validation so negative weight/value or invalid dates can't
    // corrupt rows via the update path.
    if (data.weightKg != null && Number(data.weightKg) <= 0) throw new BadRequestException('weightKg must be positive')
    if (data.volumeM3 != null && Number(data.volumeM3) <= 0) throw new BadRequestException('volumeM3 must be positive')
    if (data.pieces != null && Number(data.pieces) <= 0) throw new BadRequestException('pieces must be positive')
    if (data.value != null && Number(data.value) < 0) throw new BadRequestException('value cannot be negative')
    if ('pickupWindow' in input && input.pickupWindow !== undefined) {
      const d = new Date(input.pickupWindow as string)
      if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid pickupWindow')
      data.pickupWindow = d
    }
    if ('deliveryWindow' in input && input.deliveryWindow !== undefined) {
      const d = new Date(input.deliveryWindow as string)
      if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid deliveryWindow')
      data.deliveryWindow = d
    }
    if ('mode' in data) this.validateMode(data.mode as string)
    const updated = await this.prisma.shipment.update({ where: { id }, data: data as never })
    await this.audit.log({ actorId: user.id, action: 'shipment.update', resource: id, after: { ref: updated.ref, ...data } as never })
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
    await this.audit.log({ actorId: user.id, action: 'shipment.transition', resource: id, after: { from: shipment.status, to: status } })
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
    await this.audit.log({ actorId: user.id, action: 'leg.create', resource: leg.id, after: { shipmentId, sequence: leg.sequence, mode: leg.mode } })
    return { leg }
  }

  /** Mark a leg departed, arrived or failed (execution lifecycle on the canonical leg). */
  async legTransition(legId: string, event: 'departed' | 'arrived' | 'failed', reason: string | undefined, user: User) {
    const leg = await this.prisma.shipmentLeg.findUnique({
      where: { id: legId },
      include: { shipment: true },
    })
    if (!leg) throw new NotFoundException('Leg not found')
    if (!leg.shipment.ownerOrgId || !(await this.orgAccess.isMember(user, leg.shipment.ownerOrgId))) {
      throw new ForbiddenException('No access to this leg')
    }
    if (event === 'failed' && !reason?.trim()) throw new BadRequestException('Failure reason required')
    if (leg.status === 'arrived' && event !== 'failed') throw new BadRequestException('Leg has already arrived')
    const ts = new Date()
    const data: Record<string, unknown> = {
      status: event === 'departed' ? 'in_transit' : event === 'arrived' ? 'arrived' : 'failed',
    }
    if (event === 'departed') data.departedAt = ts
    if (event === 'arrived') data.arrivedAt = ts
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.shipmentLeg.update({ where: { id: legId }, data: data as never })
      await this.outbox.emit(tx as never, {
        eventType: 'EXCEPTION',
        eventCode: event === 'failed' ? 'LEG_FAILED' : event === 'departed' ? 'LEG_DEPARTED' : 'LEG_ARRIVED',
        entityType: 'leg',
        entityId: legId,
        orgId: leg.shipment.ownerOrgId ?? null,
        shipmentId: leg.shipmentId,
        legId,
        actorId: user.id,
        location: event === 'failed' ? leg.pickupAddr ?? leg.dropAddr : event === 'departed' ? leg.pickupAddr : leg.dropAddr,
        payload: {
          mode: leg.mode,
          sequence: leg.sequence,
          at: ts.toISOString(),
          ...(event === 'failed' ? { reason } : {}),
        },
      })
      return changed
    })
    // Auto re-plan: a failed leg on the active plan should immediately surface an
    // alternative, sourced live from the marketplace when possible. Original
    // stays selected — the orderer decides.
    let rePlan: unknown = undefined
    if (event === 'failed') {
      rePlan = await (async () => {
        try {
          const sourced = await this.market.findReplacementForLane(
            { originRef: leg.pickupAddr, destinationRef: leg.dropAddr, mode: leg.mode },
            user,
          ).catch(() => ({ replacement: null }))
          return this.planning.autoRePlanOnLegFailure(
            leg.shipmentId,
            legId,
            reason ?? 'leg failed',
            user,
            sourced?.replacement ?? undefined,
          )
        } catch {
          return null
        }
      })()
    }
    await this.audit.log({ actorId: user.id, action: 'leg.transition', resource: legId, after: { event, status: updated.status } })
    return { leg: updated, rePlan }
  }

  /** Create a cargo unit on a shipment (or a leg). */
  async createCargoUnit(input: {
    shipmentId: string
    legId?: string
    kind?: string
    weightKg?: number
    volumeM3?: number
    pieces?: number
    equipment?: string
    ref?: string
  }, user: User) {
    await this.orgAccess.assertShipmentAccess(user, input.shipmentId)
    const unit = await this.prisma.cargoUnit.create({
      data: {
        ref: input.ref ?? `CU-${Date.now().toString(36).toUpperCase()}`,
        kind: input.kind ?? 'package',
        weightKg: input.weightKg,
        volumeM3: input.volumeM3,
        pieces: input.pieces,
        equipment: input.equipment,
        shipmentId: input.shipmentId,
        legId: input.legId,
        status: 'created',
      },
    })
    await this.audit.log({ actorId: user.id, action: 'cargo.create', resource: unit.id, after: { shipmentId: input.shipmentId, kind: unit.kind, ref: unit.ref } })
    return { unit }
  }

  /** Split a cargo unit into children (e.g. a container into pallets). */
  async splitCargoUnit(unitId: string, parts: { weightKg?: number; volumeM3?: number; pieces?: number }[], user: User) {
    const unit = await this.prisma.cargoUnit.findUnique({ where: { id: unitId }, include: { shipment: true } })
    if (!unit) throw new NotFoundException('Cargo unit not found')
    if (!unit.shipment?.ownerOrgId || !(await this.orgAccess.isMember(user, unit.shipment.ownerOrgId))) {
      throw new ForbiddenException('No access to this cargo unit')
    }
    if (!parts.length) throw new BadRequestException('Need at least one part')
    // Conservation + sanity: no zero/negative parts, no grandchildren, and the
    // parts must sum back to the parent's weight/pieces (epsilon for floats).
    if (unit.status === 'split' || unit.status === 'consolidated') {
      throw new BadRequestException(`Cannot split a ${unit.status} unit`)
    }
    const EPS = 1e-6
    const sumWeight = parts.reduce((s, p) => s + (p.weightKg ?? 0), 0)
    const sumPieces = parts.reduce((s, p) => s + (p.pieces ?? 0), 0)
    if (parts.some((p) => (p.weightKg != null && p.weightKg <= 0) || (p.volumeM3 != null && p.volumeM3 <= 0) || (p.pieces != null && p.pieces <= 0))) {
      throw new BadRequestException('Every part must be positive')
    }
    if (unit.weightKg != null && Math.abs(sumWeight - unit.weightKg) > EPS) {
      throw new BadRequestException(`Parts must sum to the parent weight ${unit.weightKg} kg (got ${Math.round(sumWeight * 100) / 100})`)
    }
    if (unit.pieces != null && Math.abs(sumPieces - unit.pieces) > EPS) {
      throw new BadRequestException(`Parts must sum to the parent piece count ${unit.pieces} (got ${Math.round(sumPieces)})`)
    }
    const children = await this.prisma.$transaction(async (tx) => {
      const created = []
      for (const part of parts) {
        created.push(await tx.cargoUnit.create({
          data: {
            ref: `CU-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
            kind: unit.kind,
            weightKg: part.weightKg ?? null,
            volumeM3: part.volumeM3 ?? null,
            pieces: part.pieces ?? null,
            shipmentId: unit.shipmentId,
            legId: unit.legId,
            parentId: unit.id,
            status: 'split',
          },
        }))
      }
      await tx.cargoUnit.update({ where: { id: unit.id }, data: { status: 'split' } })
      return created
    })
    await this.audit.log({ actorId: user.id, action: 'cargo.split', resource: unitId, after: { childCount: children.length } })
    return { children }
  }

  /** Merge a cargo unit into a parent (e.g. pallets onto a container). */
  async mergeCargoUnit(unitId: string, parentId: string, user: User) {
    const unit = await this.prisma.cargoUnit.findUnique({ where: { id: unitId }, include: { shipment: true } })
    const parent = await this.prisma.cargoUnit.findUnique({ where: { id: parentId } })
    if (!unit) throw new NotFoundException('Cargo unit not found')
    if (!parent) throw new NotFoundException('Parent cargo unit not found')
    if (unit.shipmentId !== parent.shipmentId) throw new BadRequestException('Units belong to different shipments')
    if (!unit.shipment?.ownerOrgId || !(await this.orgAccess.isMember(user, unit.shipment.ownerOrgId))) {
      throw new ForbiddenException('No access to this cargo unit')
    }
    const updated = await this.prisma.cargoUnit.update({
      where: { id: unitId },
      data: { parentId, status: 'consolidated' },
    })
    await this.prisma.cargoUnit.update({ where: { id: parentId }, data: { status: 'consolidated' } })
    await this.audit.log({ actorId: user.id, action: 'cargo.merge', resource: unitId, after: { parentId } })
    return { unit: updated }
  }

  /** Update a cargo unit's operational status/location. */
  async updateCargoUnit(unitId: string, data: { status?: string; locationRef?: string }, user: User) {
    const unit = await this.prisma.cargoUnit.findUnique({ where: { id: unitId }, include: { shipment: true } })
    if (!unit) throw new NotFoundException('Cargo unit not found')
    if (!unit.shipment?.ownerOrgId || !(await this.orgAccess.isMember(user, unit.shipment.ownerOrgId))) {
      throw new ForbiddenException('No access to this cargo unit')
    }
    const updated = await this.prisma.cargoUnit.update({ where: { id: unitId }, data: { ...data, status: data.status ?? unit.status } })
    await this.audit.log({ actorId: user.id, action: 'cargo.update', resource: unitId, after: data })
    return { unit: updated }
  }

  /**
   * Container lifecycle (DCSA-aligned): gate_in -> loaded (STUF) ->
   * in_transit (DEPA) -> discharged (STRP/DISC) -> returned (GTOT).
   * Only container-kind units; each transition emits a CONT_* event.
   */
  async transitionContainer(unitId: string, event: 'gated_in' | 'loaded' | 'discharged' | 'returned', user: User) {
    const unit = await this.prisma.cargoUnit.findUnique({
      where: { id: unitId },
      include: { shipment: { include: { ownerOrg: true } }, leg: true },
    })
    if (!unit) throw new NotFoundException('Cargo unit not found')
    if (unit.kind !== 'container' && unit.kind !== 'teu') throw new BadRequestException('Only container-kind units have a container lifecycle')
    if (!unit.shipment?.ownerOrgId || !(await this.orgAccess.isMember(user, unit.shipment.ownerOrgId))) {
      throw new ForbiddenException('No access to this cargo unit')
    }
    const CONTAINER_FLOW: Record<string, string[]> = {
      created: ['gate_in', 'loaded'],
      gate_in: ['loaded'],
      loaded: ['in_transit', 'discharged'],
      in_transit: ['discharged'],
      discharged: ['returned'],
      returned: [],
    }
    const targets = CONTAINER_FLOW[unit.status] ?? []
    const next: Record<string, string> = { gated_in: 'gate_in', loaded: 'loaded', discharged: 'discharged', returned: 'returned' }
    const target = next[event]
    if (!target || !targets.includes(target)) {
      throw new BadRequestException(`Cannot ${event} a container in status ${unit.status}`)
    }
    const ts = new Date()
    const data: Record<string, unknown> = { status: target, locationRef: unit.locationRef ?? unit.leg?.dropAddr ?? unit.shipment.destinationId ?? null }
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.cargoUnit.update({ where: { id: unitId }, data: data as never })
      const codes: Record<string, string> = { gate_in: 'GTIN', loaded: 'STUF', discharged: 'STRP', returned: 'GTOT' }
      await this.outbox.emit(tx as never, {
        eventType: 'EQUIPMENT',
        eventCode: codes[target] ?? 'CONT_UPDATE',
        entityType: 'shipment',
        entityId: unit.shipmentId ?? '',
        orgId: unit.shipment?.ownerOrgId ?? null,
        shipmentId: unit.shipmentId,
        legId: unit.legId,
        actorId: user.id,
        location: unit.leg?.dropAddr ?? undefined,
        payload: { cargoUnit: unit.ref, unitStatus: target, at: ts.toISOString(), equipment: unit.equipment },
      })
      return changed
    })
    await this.audit.log({ actorId: user.id, action: 'container.transition', resource: unitId, after: { event, status: updated.status } })
    return { unit: updated }
  }

  async listCargoUnits(shipmentId: string, user: User) {
    await this.orgAccess.assertShipmentAccess(user, shipmentId)
    const units = await this.prisma.cargoUnit.findMany({
      where: { shipmentId },
      include: { parent: true, children: true },
      orderBy: { createdAt: 'asc' },
    })
    return { units }
  }

  async listShipments(user: User, query?: { status?: string; mode?: string; q?: string; skip?: number; take?: number }) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const where: Record<string, unknown> = { ownerOrgId: { in: orgIds } }
    if (query?.status) where.status = query.status
    if (query?.mode) where.mode = query.mode
    if (query?.q?.trim()) {
      const q = query.q.trim()
      where.OR = [
        { commodity: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { ref: { contains: q, mode: 'insensitive' } },
      ]
    }
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
