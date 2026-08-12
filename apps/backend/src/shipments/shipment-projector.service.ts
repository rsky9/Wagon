import { Injectable, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OutboxRelay } from '../outbox/outbox-relay.service'
import type { Load, Trip } from '@prisma/client'

/**
 * Phase 1 — road projection: keeps the canonical Shipment/ShipmentLeg in sync
 * with the existing Load/Trip flow and emits canonical LogisticsEvents.
 * Load is the road specialization; Shipment is the universal core.
 */
@Injectable()
export class ShipmentProjector {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OutboxRelay) private readonly outbox: OutboxRelay,
  ) {}

  /** Create/upsert a canonical Shipment + single road leg from a Load. */
  async fromLoad(load: Load) {
    const existing = await this.prisma.shipment.findFirst({ where: { ref: load.id } })
    const data = {
      commodity: load.materialId ? String(load.materialId) : undefined,
      description: load.description,
      weightKg: load.weight ? load.weight * 1000 : null,
      pieces: load.noOfTrucks ?? 1,
      pickupWindow: load.pickupDate ?? null,
      deliveryWindow: load.dropDate ?? null,
      value: load.fareEstimate ?? null,
      mode: 'road',
      status: this.shipmentStatus(load.status),
    }

    if (existing) {
      return this.prisma.shipment.update({ where: { id: existing.id }, data })
    }

    const shipment = await this.prisma.shipment.create({
      data: { ref: load.id, ...data },
    })
    await this.prisma.shipmentLeg.create({
      data: {
        shipmentId: shipment.id,
        sequence: 1,
        mode: 'road',
        pickupAddr: load.pickupAddr,
        dropAddr: load.dropAddr,
        distanceKm: load.distanceKm,
        equipment: load.truckType,
      },
    })
    return shipment
  }

  /** Emit a canonical event for an entity. */
  async emit(input: {
    eventType: string
    eventCode: string
    entityType: 'load' | 'trip' | 'shipment' | 'leg'
    entityId: string
    shipmentId?: string | null
    legId?: string | null
    actorId?: string | null
    location?: string | null
    payload?: Record<string, unknown>
  }) {
    await this.outbox.emit(this.tx(), {
      eventType: input.eventType,
      eventCode: input.eventCode,
      entityType: input.entityType,
      entityId: input.entityId,
      shipmentId: input.shipmentId,
      legId: input.legId,
      actorId: input.actorId,
      location: input.location,
      payload: input.payload,
    })
  }

  /** Resolve the canonical shipmentId for a load or trip id. */
  async shipmentIdFor(ref: string) {
    const s = await this.prisma.shipment.findFirst({ where: { ref } })
    return s?.id ?? null
  }

  private shipmentStatus(loadStatus: string): 'planned' | 'booked' | 'draft' {
    if (loadStatus === 'posted') return 'planned'
    if (loadStatus === 'accepted') return 'booked'
    return 'draft'
  }

  private tx() {
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
