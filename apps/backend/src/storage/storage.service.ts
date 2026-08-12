import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OutboxRelay } from '../outbox/outbox-relay.service'
import type { User } from '@prisma/client'

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
    @Inject(OutboxRelay) private readonly outbox: OutboxRelay,
  ) {}

  // ---------- Facilities ----------

  async createFacility(input: {
    name: string
    kind?: string
    operatorId?: string
    address?: string
    city?: string
    latitude?: number
    longitude?: number
    capacitySlots?: number
  }, user: User) {
    if (!input.name?.trim()) throw new BadRequestException('Facility name required')
    const facility = await this.prisma.facility.create({
      data: {
        name: input.name.trim(),
        kind: input.kind ?? 'warehouse',
        operatorId: input.operatorId,
        address: input.address,
        city: input.city,
        latitude: input.latitude,
        longitude: input.longitude,
        capacitySlots: input.capacitySlots ?? 0,
      },
    })
    await this.outbox.emit(await this.tx(), {
      eventType: 'EQUIPMENT',
      eventCode: 'FACILITY_CREATED',
      entityType: 'organization',
      entityId: facility.id,
      actorId: user.id,
      payload: { name: facility.name, kind: facility.kind },
    })
    return { facility }
  }

  async facilities() {
    const facilities = await this.prisma.facility.findMany({ orderBy: { createdAt: 'desc' }, take: 100 })
    return { facilities }
  }

  // ---------- Warehouse operations ----------

  async startOperation(facilityId: string, input: { shipmentId?: string; appointmentAt?: string }, user: User) {
    const facility = await this.prisma.facility.findUnique({ where: { id: facilityId } })
    if (!facility) throw new NotFoundException('Facility not found')
    const op = await this.prisma.warehouseOperation.create({
      data: {
        facilityId,
        shipmentId: input.shipmentId,
        ref: `WH-${Date.now().toString(36).toUpperCase()}`,
        status: 'appointment',
        appointmentAt: input.appointmentAt ? new Date(input.appointmentAt) : new Date(),
      },
    })
    await this.outbox.emit(await this.tx(), {
      eventType: 'TRANSPORT',
      eventCode: 'APPOINTMENT_CONFIRMED',
      entityType: 'leg',
      entityId: op.id,
      shipmentId: input.shipmentId,
      actorId: user.id,
      location: facility.address,
      payload: { facility: facility.name },
    })
    return { operation: op }
  }

  /** Advance a warehouse operation along its status flow. */
  async advance(opId: string, user: User) {
    const op = await this.prisma.warehouseOperation.findUnique({ where: { id: opId } })
    if (!op) throw new NotFoundException('Operation not found')
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
    const updated = await this.prisma.warehouseOperation.update({
      where: { id: opId },
      data: data as never,
    })
    await this.outbox.emit(await this.tx(), {
      eventType: 'TRANSPORT',
      eventCode: next.toUpperCase().replace('_', ''),
      entityType: 'leg',
      entityId: op.id,
      shipmentId: op.shipmentId,
      actorId: user.id,
      payload: { warehouseRef: op.ref },
    })
    return { operation: updated }
  }

  async operations(facilityId?: string) {
    const ops = await this.prisma.warehouseOperation.findMany({
      where: facilityId ? { facilityId } : {},
      include: { facility: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    })
    return { operations: ops }
  }

  private async tx() {
    const prisma = this.prisma
    return {
      logisticsEvent: {
        create: (args: { data: Record<string, unknown> }) => prisma.logisticsEvent.create({ data: args.data as never }),
      },
      outboxMessage: {
        create: (args: { data: Record<string, unknown> }) => prisma.outboxMessage.create({ data: args.data as never }),
      },
    }
  }
}
