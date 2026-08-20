import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OrgAccessService } from '../org-access/org-access.service'
import { AuditService } from '../audit/audit.service'
import type { User } from '@prisma/client'

/**
 * DCSA-aligned visibility feed. Event codes map to the DCSA Track & Trace
 * taxonomy (ARRI/DEPA/LOAD/DISC/GTIN/GTOT/STUF/STRP + custom extensions).
 * Each timeline entry carries the classifier (PLN/ACT/EST), source, evidence
 * and occurred-at, so a viewer sees the real, signed event stream.
 */

const CODE_TO_LABEL: Record<string, { label: string; dcsa?: string }> = {
  LOAD_CREATED: { label: 'Load posted', dcsa: 'LOAD' },
  TRIP_STARTED: { label: 'Trip started', dcsa: 'DEPA' },
  POD_CAPTURED: { label: 'Proof of delivery captured', dcsa: 'ARRI' },
  POD_CONFIRMED: { label: 'Delivery confirmed', dcsa: 'ARRI' },
  PLAN_PROPOSED: { label: 'Plan proposed' },
  PLAN_SELECTED: { label: 'Plan selected' },
  PLAN_DECLINED: { label: 'Plan declined' },
  PLAN_DECOMPOSED: { label: 'Plan decomposed' },
  REPLANNED: { label: 'Re-planned after failure' },
  LEG_PLANNED: { label: 'Leg planned' },
  SHIPMENT_CREATED: { label: 'Shipment created' },
  BOOKING_REQUESTED: { label: 'Booking requested' },
  BOOKING_CONFIRMED: { label: 'Booking confirmed', dcsa: 'GTIN' },
  BOOKING_CANCELLED: { label: 'Booking cancelled' },
  CARRIER_SERVICE_BOOKED: { label: 'Carrier service booked', dcsa: 'GTOT' },
  CONSOLIDATION_CREATED: { label: 'Consolidation created' },
  CONSOLIDATION_READY: { label: 'Consolidation ready' },
  CONSOLIDATION_BOOKED: { label: 'Consolidation booked' },
  CLAIM_FILED: { label: 'Claim filed' },
  CLAIM_ASSESSED: { label: 'Claim assessed' },
  CLAIM_DECISION: { label: 'Claim decided' },
  POLICY_ISSUED: { label: 'Policy issued' },
  SETTLEMENT_CREATED: { label: 'Settlement created' },
  PAYOUT_RELEASED: { label: 'Payout released' },
  APPOINTMENT_CONFIRMED: { label: 'Appointment confirmed' },
  DOCUMENT_ADDED: { label: 'Document added' },
  CUSTOMS_HOLD: { label: 'Customs hold', dcsa: 'CUS' },
  RISK_ASSESSED: { label: 'Risk assessed' },
  AI_RECOMMENDED: { label: 'AI recommendation' },
  TRIP_HEALTH_FLAGGED: { label: 'Trip health flagged' },
  ORG_CREATED: { label: 'Organization created' },
}

@Injectable()
export class VisibilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAccess: OrgAccessService,
    private readonly audit: AuditService,
  ) {}

  private labelFor(code: string): { label: string; dcsa?: string } {
    return CODE_TO_LABEL[code] ?? { label: code.replace(/_/g, ' ').toLowerCase() }
  }

  private mapEvent(e: {
    id: string
    eventCode: string
    classifier: string
    source: string
    actorName?: string | null
    location?: string | null
    occurredAt: Date
    evidence?: string | null
    payload?: unknown
  }) {
    const meta = this.labelFor(e.eventCode)
    return {
      id: e.id,
      eventCode: e.eventCode,
      label: meta.label,
      dcsa: meta.dcsa,
      classifier: e.classifier,
      source: e.source,
      actor: e.actorName,
      location: e.location,
      occurredAt: e.occurredAt,
      evidence: e.evidence,
      payload: e.payload,
    }
  }

  /** Unified event timeline for a shipment (operational + logistics events). */
  async shipmentTimeline(shipmentId: string, user: User) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        ownerOrg: { select: { id: true, name: true } },
        legs: { orderBy: { sequence: 'asc' }, include: { events: { orderBy: { occurredAt: 'asc' } } } },
      },
    })
    if (!shipment) throw new NotFoundException('Shipment not found')
    await this.orgAccess.assertShipmentAccess(user, shipmentId)

    const shipmentEvents = await this.prisma.logisticsEvent.findMany({
      where: { shipmentId, entityType: { not: 'leg' } },
      orderBy: { occurredAt: 'asc' },
    })

    const events = [
      ...shipmentEvents.map((e) => this.mapEvent(e)),
      ...shipment.legs.flatMap((leg) =>
        leg.events.map((e) => ({ ...this.mapEvent(e), leg: { id: leg.id, mode: leg.mode, sequence: leg.sequence, pickupAddr: leg.pickupAddr, dropAddr: leg.dropAddr } })),
      ),
    ].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())

    return {
      shipment: { id: shipment.id, ref: shipment.ref, commodity: shipment.commodity, status: shipment.status, mode: shipment.mode },
      timeline: events,
      legCount: shipment.legs.length,
    }
  }

  /** Timeline for a container (equipment twin): custody + status events. */
  async containerTimeline(containerId: string, user: User) {
    const container = await this.prisma.container.findUnique({
      where: { id: containerId },
      include: {
        ownerOrg: { select: { id: true, name: true } },
        operatorOrg: { select: { id: true, name: true } },
      },
    })
    if (!container) throw new NotFoundException('Container not found')
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    if (!isAdmin) {
      const orgIds = await this.orgAccess.memberOrgIds(user)
      if (!orgIds.includes(container.ownerOrgId ?? '') && !orgIds.includes(container.operatorOrgId ?? '')) {
        throw new NotFoundException('Container not found')
      }
    }

    const events = await this.prisma.logisticsEvent.findMany({
      where: { entityType: 'container', entityId: containerId },
      orderBy: { occurredAt: 'asc' },
    })

    const handovers = await this.prisma.handover.findMany({
      where: { entityType: 'container', entityId: containerId },
      orderBy: { performedAt: 'asc' },
    })
    const handoverEvents = handovers.map((h) => ({
      id: h.id,
      eventCode: 'HANDOVER',
      label: 'Custody handover',
      classifier: 'ACT' as const,
      source: 'api',
      actor: h.performedBy,
      location: h.locationRef,
      occurredAt: h.performedAt,
      evidence: h.evidenceKey,
      payload: { fromOrgId: h.fromOrgId, toOrgId: h.toOrgId, condition: h.condition, quantity: h.quantity },
    }))

    return {
      container: { id: container.id, number: container.number, type: container.type, status: container.status, sealNo: container.sealNo, emptyReturnRequired: container.emptyReturnRequired },
      timeline: [...handoverEvents, ...events.map((e) => this.mapEvent(e))].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()),
    }
  }

  /** Timeline for a trip: driver location trace + operational events. */
  async tripTimeline(tripId: string, user: User) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { load: { select: { id: true, pickupAddr: true, dropAddr: true, supplierId: true } }, locations: { orderBy: { recordedAt: 'asc' } } },
    })
    if (!trip) throw new NotFoundException('Trip not found')
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    if (!isAdmin && !(await this.isTripParticipant(trip as never, user))) {
      throw new NotFoundException('Trip not found')
    }

    const events = await this.prisma.logisticsEvent.findMany({
      where: { OR: [{ entityType: 'trip', entityId: tripId }, { entityType: 'load', entityId: trip.loadId }] },
      orderBy: { occurredAt: 'asc' },
    })

    const trace = trip.locations.map((l) => ({
      id: l.id,
      kind: 'location' as const,
      label: 'Position update',
      occurredAt: l.recordedAt,
      payload: { lat: l.lat, lng: l.lng, speedKmh: l.speedKmh, simulated: l.simulated },
    }))

    return {
      trip: { id: trip.id, loadId: trip.loadId, status: trip.status, pickupAddr: trip.load?.pickupAddr, dropAddr: trip.load?.dropAddr },
      timeline: [
        ...trace,
        ...events.map((e) => ({ ...this.mapEvent(e), kind: 'event' as const })),
      ].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()),
      latestLocation: trace[trace.length - 1] ?? null,
    }
  }

  private async isTripParticipant(trip: { transporterId: string; load: { supplierId: string } }, user: User) {
    const caps = (user.capabilities as string[] | undefined) ?? []
    const isTransporter = caps.includes('transporter') || user.role === 'transporter'
    const isSupplier = caps.includes('supplier') || user.role === 'supplier'
    if (isTransporter) {
      const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
      if (transporter?.id === trip.transporterId) return true
    }
    if (isSupplier) {
      const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
      if (supplier?.id === trip.load.supplierId) return true
    }
    return false
  }
}