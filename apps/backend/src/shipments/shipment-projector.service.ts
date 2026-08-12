import { Injectable, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OutboxRelay } from '../outbox/outbox-relay.service'
import type { Load, Trip } from '@prisma/client'

/**
 * Phase 1 — road projection: keeps the canonical Shipment/ShipmentLeg in sync
 * with the existing Load/Trip flow across the FULL lifecycle (creation, booking,
 * in-transit, delivered, cancelled, paused) and emits canonical LogisticsEvents.
 * Load is the road specialization; Shipment is the universal core.
 */
@Injectable()
export class ShipmentProjector {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OutboxRelay) private readonly outbox: OutboxRelay,
  ) {}

  /** Full LoadStatus -> ShipmentStatus mapping (no more collapse-to-draft). */
  shipmentStatus(loadStatus: string): string {
    switch (loadStatus) {
      case 'posted':
      case 'interested':
        return 'planned'
      case 'accepted':
        return 'booked'
      case 'in_transit':
        return 'in_transit'
      case 'delivered':
      case 'completed':
        return 'delivered'
      case 'cancelled':
        return 'cancelled'
      case 'paused':
        return 'planned'
      default:
        return 'draft'
    }
  }

  /** Create/upsert a canonical Shipment + single road leg from a Load (atomic). */
  async fromLoad(load: Load) {
    const org = await this.orgForLoad(load)
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.shipment.findFirst({ where: { ref: load.id } })
      const status = this.shipmentStatus(load.status) as never
      const data = {
        commodity: load.materialId ? String(load.materialId) : null,
        description: load.description,
        weightKg: load.weight ? load.weight * 1000 : null,
        pieces: load.noOfTrucks ?? 1,
        pickupWindow: load.pickupDate ?? null,
        deliveryWindow: load.dropDate ?? null,
        value: load.fareEstimate ?? null,
        mode: 'road',
        status,
        ownerOrgId: org,
      }

      if (existing) {
        const updated = await tx.shipment.update({ where: { id: existing.id }, data: data as never })
        // Mirror route changes onto the road leg.
        const leg = await tx.shipmentLeg.findFirst({ where: { shipmentId: existing.id, sequence: 1 } })
        if (leg) {
          await tx.shipmentLeg.update({
            where: { id: leg.id },
            data: { pickupAddr: load.pickupAddr, dropAddr: load.dropAddr, distanceKm: load.distanceKm, equipment: load.truckType },
          })
        }
        return updated
      }

      const shipment = await tx.shipment.create({
        data: { ref: load.id, ...data } as never,
      })
      await tx.shipmentLeg.create({
        data: {
          shipmentId: shipment.id,
          sequence: 1,
          mode: 'road',
          pickupAddr: load.pickupAddr,
          dropAddr: load.dropAddr,
          distanceKm: load.distanceKm,
          equipment: load.truckType,
          status: this.shipmentStatus(load.status) === 'booked' ? 'booked' : 'planned',
        },
      })
      await this.outbox.emit(tx as never, {
        eventType: 'SHIPMENT',
        eventCode: 'LOAD_PROJECTED',
        entityType: 'shipment',
        entityId: shipment.id,
        orgId: org,
        shipmentId: shipment.id,
        payload: { ref: load.id },
      })
      return shipment
    })
  }

  /** Sync the canonical Shipment status from a load/trip lifecycle change (atomic). */
  async syncFromLoad(loadId: string, loadStatus: string, eventCode: string, eventType = 'TRANSPORT', actorId?: string, location?: string) {
    const shipment = await this.prisma.shipment.findFirst({ where: { ref: loadId } })
    if (!shipment) return null
    const status = this.shipmentStatus(loadStatus)
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.shipment.update({ where: { id: shipment.id }, data: { status: status as never } })
      await tx.shipmentLeg.updateMany({ where: { shipmentId: shipment.id, sequence: 1 }, data: { status: status as never } })
      await this.outbox.emit(tx as never, {
        eventType,
        eventCode,
        entityType: 'shipment',
        entityId: shipment.id,
        orgId: shipment.ownerOrgId ?? null,
        shipmentId: shipment.id,
        actorId,
        location,
        payload: { ref: loadId, status },
      })
      return updated
    })
  }

  /** Emit a canonical event (atomic event+outbox write via real transaction). */
  async emit(input: {
    eventType: string
    eventCode: string
    entityType: 'load' | 'trip' | 'shipment' | 'leg'
    entityId: string
    orgId?: string | null
    shipmentId?: string | null
    legId?: string | null
    actorId?: string | null
    location?: string | null
    payload?: Record<string, unknown>
  }) {
    await this.prisma.$transaction(async (tx) => {
      await this.outbox.emit(tx as never, {
        eventType: input.eventType,
        eventCode: input.eventCode,
        entityType: input.entityType,
        entityId: input.entityId,
        orgId: input.orgId,
        shipmentId: input.shipmentId,
        legId: input.legId,
        actorId: input.actorId,
        location: input.location,
        payload: input.payload,
      })
    })
  }

  /** Resolve the canonical shipmentId for a load or trip id. */
  async shipmentIdFor(ref: string) {
    const s = await this.prisma.shipment.findFirst({ where: { ref } })
    return s?.id ?? null
  }

  /** Owner org id for a canonical shipment. */
  async shipmentOrgId(shipmentId: string) {
    const s = await this.prisma.shipment.findUnique({ where: { id: shipmentId }, select: { ownerOrgId: true } })
    return s?.ownerOrgId ?? null
  }

  /** Owner org for a load (via supplier's org membership), defaulting to none. */
  private async orgForLoad(load: Load) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: load.supplierId }, include: { user: true } })
    if (!supplier) return null
    const member = await this.prisma.organizationMember.findFirst({ where: { userId: supplier.userId }, include: { organization: true } })
    return member?.organizationId ?? null
  }
}
