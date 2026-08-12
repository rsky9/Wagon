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

const VALID_KINDS = ['warehouse', 'cold', 'bonded', 'cfs', 'icd', 'yard', 'cross_dock', 'transload']

const STATUS_FLOW: Record<string, string[]> = {
  appointment: ['gate_in'],
  gate_in: ['receive'],
  receive: ['put_away'],
  put_away: ['stored'],
  stored: ['pick'],
  pick: ['stage'],
  stage: ['load'],
  load: ['gate_out'],
  gate_out: ['done'],
}

@Injectable()
export class StorageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAccess: OrgAccessService,
    @Inject(OutboxRelay) private readonly outbox: OutboxRelay,
  ) {}

  /** The operator org = the warehouse org the caller belongs to. */
  private async operatorOrg(user: User) {
    return this.orgAccess.requireOrgOfKind(user, ['warehouse', 'cfs', 'icd', 'cross_dock', 'yard'])
  }

  // ---------- Facilities ----------

  async createFacility(input: {
    name: string
    kind?: string
    address?: string
    city?: string
    latitude?: number
    longitude?: number
    capacitySlots?: number
  }, user: User) {
    if (!input.name?.trim()) throw new BadRequestException('Facility name required')
    if (input.kind && !VALID_KINDS.includes(input.kind)) throw new BadRequestException('Invalid facility kind')
    const operator = await this.operatorOrg(user)
    const facility = await this.prisma.$transaction(async (tx) => {
      const created = await tx.facility.create({
        data: {
          name: input.name.trim(),
          kind: input.kind ?? 'warehouse',
          operatorId: operator.id,
          address: input.address,
          city: input.city,
          latitude: input.latitude,
          longitude: input.longitude,
          capacitySlots: input.capacitySlots ?? 0,
        },
      })
      await this.outbox.emit(tx as never, {
        eventType: 'EQUIPMENT',
        eventCode: 'FACILITY_CREATED',
        entityType: 'organization',
        entityId: created.id,
        orgId: operator.id,
        actorId: user.id,
        payload: { name: created.name, kind: created.kind },
      })
      return created
    })
    return { facility }
  }

  async facilities(user: User) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const facilities = await this.prisma.facility.findMany({
      where: { OR: [{ operatorId: { in: orgIds } }, { operatorId: null }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { facilities }
  }

  async facilityDetail(id: string, user: User) {
    const facility = await this.prisma.facility.findUnique({
      where: { id },
      include: { operator: true, appointments: { orderBy: { updatedAt: 'desc' }, take: 20 } },
    })
    if (!facility) throw new NotFoundException('Facility not found')
    if (facility.operatorId && !(await this.orgAccess.isMember(user, facility.operatorId))) {
      throw new ForbiddenException('Not the operator of this facility')
    }
    return { facility }
  }

  // ---------- Warehouse operations ----------

  async startOperation(facilityId: string, input: { shipmentId?: string; appointmentAt?: string }, user: User) {
    const facility = await this.prisma.facility.findUnique({ where: { id: facilityId } })
    if (!facility) throw new NotFoundException('Facility not found')
    const operator = await this.operatorOrg(user)
    if (facility.operatorId && facility.operatorId !== operator.id) {
      throw new ForbiddenException('Not the operator of this facility')
    }
    if (input.shipmentId) {
      const shipment = await this.prisma.shipment.findUnique({ where: { id: input.shipmentId } })
      if (!shipment) throw new NotFoundException('Shipment not found')
    }
    if (input.appointmentAt && Number.isNaN(new Date(input.appointmentAt).getTime())) {
      throw new BadRequestException('Invalid appointmentAt')
    }
    const op = await this.prisma.$transaction(async (tx) => {
      const created = await tx.warehouseOperation.create({
        data: {
          facilityId,
          shipmentId: input.shipmentId,
          operatorId: operator.id,
          ref: `WH-${Date.now().toString(36).toUpperCase()}`,
          status: 'appointment',
          appointmentAt: input.appointmentAt ? new Date(input.appointmentAt) : new Date(),
        },
      })
      await this.outbox.emit(tx as never, {
        eventType: 'TRANSPORT',
        eventCode: 'APPOINTMENT_CONFIRMED',
        entityType: 'leg',
        entityId: created.id,
        orgId: operator.id,
        shipmentId: input.shipmentId,
        actorId: user.id,
        location: facility.address,
        payload: { facility: facility.name, warehouseRef: created.ref },
      })
      return created
    })
    return { operation: op }
  }

  /** Advance a warehouse operation along its status flow (operator-only). */
  async advance(opId: string, user: User) {
    const op = await this.prisma.warehouseOperation.findUnique({
      where: { id: opId },
      include: { facility: true },
    })
    if (!op) throw new NotFoundException('Operation not found')
    const operator = await this.operatorOrg(user)
    if (op.operatorId && op.operatorId !== operator.id) {
      throw new ForbiddenException('Not the operator of this operation')
    }
    const next = (STATUS_FLOW[op.status] ?? [])[0]
    if (!next) throw new BadRequestException('Operation already complete')
    const ts = new Date()
    const data: Record<string, unknown> = { status: next }
    if (next === 'gate_in') data.gateInAt = ts
    if (next === 'receive') data.receivedAt = ts
    if (next === 'put_away') data.storedAt = ts
    if (next === 'pick') data.pickedAt = ts
    if (next === 'stage') data.stagedAt = ts
    if (next === 'load') data.loadedAt = ts
    if (next === 'gate_out') data.gateOutAt = ts
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.warehouseOperation.update({ where: { id: opId }, data: data as never })
      await this.outbox.emit(tx as never, {
        eventType: 'TRANSPORT',
        eventCode: next.toUpperCase().replace('_', ''),
        entityType: 'leg',
        entityId: op.id,
        orgId: operator.id,
        shipmentId: op.shipmentId,
        actorId: user.id,
        payload: { warehouseRef: op.ref },
      })
      return changed
    })
    return { operation: updated }
  }

  /** Cancel a warehouse operation before it starts (operator-only). */
  async cancel(opId: string, reason: string, user: User) {
    if (!reason?.trim()) throw new BadRequestException('Cancellation reason required')
    const op = await this.prisma.warehouseOperation.findUnique({ where: { id: opId } })
    if (!op) throw new NotFoundException('Operation not found')
    const operator = await this.operatorOrg(user)
    if (op.operatorId && op.operatorId !== operator.id) throw new ForbiddenException('Not the operator of this operation')
    if (op.status === 'done') throw new BadRequestException('Completed operations cannot be cancelled')
    if (op.status === 'cancelled') throw new BadRequestException('Already cancelled')
    const updated = await this.prisma.warehouseOperation.update({
      where: { id: opId },
      data: { status: 'cancelled' },
    })
    return { operation: updated, reason }
  }

  async operationDetail(id: string, user: User) {
    const op = await this.prisma.warehouseOperation.findUnique({
      where: { id },
      include: { facility: true, shipment: true, operator: true },
    })
    if (!op) throw new NotFoundException('Operation not found')
    if (op.operatorId) await this.orgAccess.assertMember(user, op.operatorId)
    return { operation: op }
  }

  async operations(user: User, facilityId?: string) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const ops = await this.prisma.warehouseOperation.findMany({
      where: { ...(facilityId ? { facilityId } : {}), operatorId: { in: orgIds } },
      include: { facility: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    })
    return { operations: ops }
  }
}
