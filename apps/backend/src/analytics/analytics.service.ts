import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OrgAccessService } from '../org-access/org-access.service'
import type { User } from '@prisma/client'

/**
 * Network operations control tower — thesis §9 KPI instrumentation.
 * Aggregates cross-domain operational data into a health snapshot:
 * trips/on-time, container & yard utilization, invoicing & settlement time,
 * open exceptions, EDI throughput, mode mix, and facility/dock load.
 * The admin view is global; the org view is scoped to the caller's orgs.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAccess: OrgAccessService,
  ) {}

  private sinceDays(days: number) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  }

  /** Network-wide operational snapshot (admin). */
  async networkOps() {
    const since7 = this.sinceDays(7)
    const [trips, loads, containers, appointments, invoices, settlements, exceptions, edi, legs] = await Promise.all([
      this.prisma.trip.findMany({ select: { status: true, createdAt: true, startedAt: true, deliveredAt: true } }),
      this.prisma.load.findMany({ select: { status: true, createdAt: true } }),
      this.prisma.container.findMany({ select: { status: true } }),
      this.prisma.scheduledAppointment.findMany({ select: { status: true, gateInAt: true, gateOutAt: true } }),
      this.prisma.invoice.findMany({ select: { status: true, createdAt: true, paidAt: true, netAmount: true, currency: true } }),
      this.prisma.settlement.findMany({ select: { status: true, createdAt: true, settledAt: true, amount: true } }),
      this.prisma.aiRecommendation.findMany({ where: { agent: 'exception', status: 'proposed' }, select: { id: true } }),
      this.prisma.ediMessage.findMany({ where: { createdAt: { gte: since7 } }, select: { id: true, direction: true } }),
      this.prisma.shipmentLeg.findMany({ select: { mode: true } }),
    ])

    // Trips: total, in-flight, delivered; on-time = delivered within load window (approx: deliveredAt <= createdAt + 72h fallback).
    const totalTrips = trips.length
    const inTransitTrips = trips.filter((t) => t.status === 'in_transit').length
    const deliveredTrips = trips.filter((t) => t.status === 'delivered').length
    const cancelledTrips = trips.filter((t) => t.status === 'cancelled').length
    const onTimeTrips = trips.filter((t) => t.deliveredAt && t.startedAt && t.deliveredAt.getTime() - t.startedAt.getTime() <= 72 * 3600000).length
    const onTimeRate = deliveredTrips ? Math.round((onTimeTrips / deliveredTrips) * 100) / 100 : 0

    // Loads by status.
    const loadStatus: Record<string, number> = {}
    for (const l of loads) loadStatus[l.status] = (loadStatus[l.status] ?? 0) + 1

    // Containers.
    const containerStatus: Record<string, number> = {}
    for (const c of containers) containerStatus[c.status] = (containerStatus[c.status] ?? 0) + 1
    const containersUtilized = containers.filter((c) => ['reserved', 'stuffed', 'gate_in', 'loaded', 'discharged'].includes(c.status)).length

    // Appointments (yard utilization).
    const appointmentsTotal = appointments.length
    const appointmentsCompleted = appointments.filter((a) => a.status === 'completed').length
    const appointmentsOpen = appointments.filter((a) => ['requested', 'confirmed', 'in_progress'].includes(a.status)).length
    const yardUtilization = appointmentsTotal ? Math.round((appointmentsOpen / appointmentsTotal) * 100) / 100 : 0

    // Invoicing.
    const invoicesTotal = invoices.length
    const invoicesPaid = invoices.filter((i) => i.status === 'paid').length
    const invoicesOutstanding = invoicesTotal - invoicesPaid
    const gmv = invoices.filter((i) => i.netAmount != null).reduce((s, i) => s + (i.netAmount ?? 0), 0)

    // Settlement cycle time (avg hrs to clear due settlements).
    const settled = settlements.filter((s) => s.settledAt)
    const avgSettlementHrs = settled.length
      ? Math.round((settled.reduce((s, x) => s + (x.settledAt!.getTime() - x.createdAt.getTime()), 0) / settled.length / 3600000) * 10) / 10
      : 0
    const settlementsDue = settlements.filter((s) => s.status === 'due').length

    // Mode mix.
    const modeMix: Record<string, number> = {}
    for (const l of legs) modeMix[l.mode] = (modeMix[l.mode] ?? 0) + 1

    return {
      period: { days: 7 },
      trips: { total: totalTrips, inTransit: inTransitTrips, delivered: deliveredTrips, cancelled: cancelledTrips, onTimeRate },
      loads: loadStatus,
      containers: { total: containers.length, status: containerStatus, utilization: Math.round((containersUtilized / Math.max(containers.length, 1)) * 100) / 100 },
      yard: { total: appointmentsTotal, completed: appointmentsCompleted, open: appointmentsOpen, utilization: yardUtilization },
      finance: { invoicesTotal, invoicesPaid, invoicesOutstanding, gmv, avgSettlementHrs, settlementsDue },
      exceptions: { open: exceptions.length },
      edi: { last7Days: edi.length, inbound: edi.filter((e) => e.direction === 'inbound').length, outbound: edi.filter((e) => e.direction === 'outbound').length },
      modeMix,
      loadsLast7Days: loads.filter((l) => l.createdAt >= since7).length,
      tripsLast7Days: trips.filter((t) => t.createdAt >= since7).length,
    }
  }

  /** Org-scoped operational summary for the caller's organizations. */
  async orgSummary(user: User) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    if (!orgIds.length) return { orgs: 0 }

    const since30 = this.sinceDays(30)
    const [shipments, containers, invoices, appointments, contracts] = await Promise.all([
      this.prisma.shipment.findMany({ where: { ownerOrgId: { in: orgIds } }, select: { id: true, status: true, createdAt: true } }),
      this.prisma.container.findMany({ where: { OR: [{ ownerOrgId: { in: orgIds } }, { operatorOrgId: { in: orgIds } }] }, select: { status: true } }),
      this.prisma.invoice.findMany({ where: { OR: [{ billFromOrgId: { in: orgIds } }, { billToOrgId: { in: orgIds } }] }, select: { status: true, netAmount: true, currency: true } }),
      this.prisma.scheduledAppointment.findMany({ where: { orgId: { in: orgIds } }, select: { status: true, gateInAt: true, gateOutAt: true } }),
      this.prisma.contract.findMany({ where: { OR: [{ partyAOrgId: { in: orgIds } }, { partyBOrgId: { in: orgIds } }] }, select: { status: true, createdAt: true } }),
    ])

    const shipmentStatus: Record<string, number> = {}
    for (const s of shipments) shipmentStatus[s.status] = (shipmentStatus[s.status] ?? 0) + 1

    const containersInUse = containers.filter((c) => ['reserved', 'stuffed', 'gate_in', 'loaded', 'discharged'].includes(c.status)).length

    const invoicesTotal = invoices.length
    const invoicesPaid = invoices.filter((i) => i.status === 'paid').length
    const outstandingValue = invoices.filter((i) => i.status !== 'paid' && i.netAmount != null).reduce((s, i) => s + (i.netAmount ?? 0), 0)

    const appointmentsOpen = appointments.filter((a) => ['requested', 'confirmed', 'in_progress'].includes(a.status)).length
    const contractsActive = contracts.filter((c) => c.status === 'active').length

    return {
      orgs: orgIds.length,
      shipments: { total: shipments.length, status: shipmentStatus, last30Days: shipments.filter((s) => s.createdAt >= since30).length },
      containers: { total: containers.length, inUse: containersInUse, utilization: Math.round((containersInUse / Math.max(containers.length, 1)) * 100) / 100 },
      finance: { invoicesTotal, invoicesPaid, invoicesOutstanding: invoicesTotal - invoicesPaid, outstandingValue, currency: 'mixed' },
      yard: { appointmentsTotal: appointments.length, appointmentsOpen },
      contracts: { total: contracts.length, active: contractsActive },
    }
  }
}