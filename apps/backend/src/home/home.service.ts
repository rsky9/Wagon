import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { LoadMatchingService } from '../matching/matching.service'
import type { User } from '@prisma/client'

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: LoadMatchingService,
  ) {}

  /** Unified cockpit: answers "what is the most useful thing I can do right now?". */
  async summary(user: User) {
    const caps = (user.capabilities?.length ? user.capabilities : [user.role]) as string[]
    const result: Record<string, unknown> = { capabilities: caps }

    const isSupplier = caps.includes('supplier') || user.role === 'supplier'
    const isTransporter = caps.includes('transporter') || user.role === 'transporter'

    if (isSupplier) {
      const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
      if (supplier) {
        const [active, awaiting, inTransit, completed] = await Promise.all([
          this.prisma.load.findMany({
            where: { supplierId: supplier.id, status: { in: ['posted', 'interested', 'paused'] } },
            orderBy: { createdAt: 'desc' },
            take: 10,
          }),
          this.prisma.load.findMany({
            where: { supplierId: supplier.id, status: 'posted', quotes: { some: {} } },
            orderBy: { createdAt: 'desc' },
            take: 5,
          }),
          this.prisma.trip.findMany({
            where: { load: { supplierId: supplier.id }, status: { in: ['accepted', 'in_transit'] } },
            include: { load: true },
            orderBy: { updatedAt: 'desc' },
            take: 10,
          }),
          this.prisma.load.count({
            where: { supplierId: supplier.id, status: { in: ['completed', 'delivered'] } },
          }),
        ])
        // Money: total paid out (escrow OR advance+balance split) + wallet.
        const escrowPaid = await this.prisma.payment.aggregate({
          where: { type: { in: ['escrow', 'advance', 'balance'] }, status: 'succeeded', trip: { load: { supplierId: supplier.id } } },
          _sum: { amount: true },
        })
        result.supplier = {
          activeLoads: active.length,
          awaitingResponses: awaiting.length,
          inTransit: inTransit.length,
          completed,
          latestLoads: active.slice(0, 3),
          inTransitTrips: inTransit.slice(0, 3),
          canPostLoad: active.length < 20,
          money: { escrowPaid: escrowPaid._sum.amount ?? 0, wallet: user.cashbackBalance ?? 0 },
        }
      }
    }

    if (isTransporter) {
      const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
      if (transporter) {
        const ctx = await this.matching.fleetContext(user.id)
        const availableTrucks = ctx.fleet.filter((t) => t.activeStatus)

        const openLoads = await this.prisma.load.findMany({
          where: { status: 'posted' },
          include: { material: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
        const scored = openLoads
          .map((l) => ({ ...l, ...this.matching.scoreLoad(l, ctx) }))
          .sort((a, b) => b.matchScore - a.matchScore)

        // Return loads: loads starting near the drop of this transporter's most recent delivered trip.
        let returnLoads: Array<Record<string, unknown>> = []
        const lastTrip = await this.prisma.trip.findFirst({
          where: { transporterId: transporter.id, status: 'delivered' },
          include: { load: true },
          orderBy: { updatedAt: 'desc' },
        })
        const lastDrop = lastTrip?.load?.dropAddr
        if (lastDrop) {
          const drop = (lastDrop.split(',')[0] ?? lastDrop).trim()
          returnLoads = await this.prisma.load.findMany({
            where: { status: 'posted', pickupAddr: { contains: drop, mode: 'insensitive' } },
            orderBy: { createdAt: 'desc' },
            take: 5,
          })
        }

        // Money: pending payouts + collected earnings + wallet cash.
        const trips = await this.prisma.trip.findMany({
          where: { transporterId: transporter.id },
          include: { payments: true, booking: true, load: true },
          orderBy: { createdAt: 'desc' },
        })
        // Pending payout = the NET amount still owed on delivered trips with no
        // successful payout yet (mirrors releasePayout: the transporter is paid
        // the FULL net — the split-path advance is never separately disbursed).
        const payoutPending = trips.reduce((s, t) => {
          if (t.status !== 'delivered') return s
          if (t.payments.some((p) => p.type === 'payout' && p.status === 'succeeded')) return s
          const base = t.booking?.rate ?? t.load?.fareEstimate ?? 0
          const tds = Math.round(base * 0.02 * 100) / 100
          return s + Math.max(0, Math.round((base - tds) * 100) / 100)
        }, 0)
        const collected = trips.reduce(
          (s, t) => s + t.payments.filter((p) => p.type === 'payout' && p.status === 'succeeded').reduce((a, p) => a + p.amount, 0),
          0,
        )

        result.transporter = {
          availableTrucks: availableTrucks.length,
          fleetSize: ctx.fleet.length,
          matchingLoads: scored.filter((l) => l.matchScore >= 60).length,
          recommended: scored.slice(0, 3),
          returnLoads,
          truckNowAvailable: availableTrucks.length > 0 && scored.length > 0,
          lastTripDrop: lastTrip?.load?.dropAddr ?? null,
          money: { payoutPending, collected, wallet: user.cashbackBalance ?? 0 },
        }
      }
    }

    // ----- Role-aware blocks for the remaining user types -----
    // Driver: today's trips, active trip, availability, earnings.
    if (caps.includes('driver') || user.role === 'driver') {
      const driver = await this.prisma.driver.findFirst({ where: { mobile: user.mobile } })
      if (driver) {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const [trips, delivered, activeTrip] = await Promise.all([
          this.prisma.trip.findMany({
            where: { driverId: driver.id, createdAt: { gte: start } },
            include: { load: true },
            orderBy: { updatedAt: 'desc' },
            take: 10,
          }),
          this.prisma.trip.findMany({
            where: { driverId: driver.id, status: 'delivered' },
            include: { load: true, booking: true },
          }),
          this.prisma.trip.findFirst({
            where: { driverId: driver.id, status: { in: ['accepted', 'in_transit'] } },
            include: { load: true },
            orderBy: { updatedAt: 'desc' },
          }),
        ])
        const earned = delivered.reduce((s, t) => s + this.driverPay(driver, t.booking?.rate ?? t.load.fareEstimate), 0)
        result.driver = {
          available: driver.status,
          activeTrip,
          todayTrips: trips.slice(0, 5),
          earnings: { trips: delivered.length, earned },
          missingProfile: false,
        }
      } else {
        result.driver = { available: false, activeTrip: null, todayTrips: [], earnings: { trips: 0, earned: 0 }, missingProfile: true }
      }
    }

    // Enablement roles: forwarder / warehouse / carrier get their org's active work.
    const enablementCaps = caps.filter((c) => ['forwarder', 'warehouse', 'carrier'].includes(c))
    if (enablementCaps.length > 0) {
      const orgIds = await this.orgIds(user)
      if (orgIds.length > 0) {
        const [shipments, forwardOrders, facilities, policies, activePlans, openShipments] = await Promise.all([
          this.prisma.shipment.count({ where: { ownerOrgId: { in: orgIds } } }),
          this.prisma.forwardOrder.count({ where: { forwarderId: { in: orgIds } } }),
          this.prisma.facility.count({ where: { operatorId: { in: orgIds } } }),
          this.prisma.insurancePolicy.count({ where: { OR: [{ insurerId: { in: orgIds } }, { shipment: { ownerOrgId: { in: orgIds } } }] } }),
          this.prisma.plan.count({ where: { shipment: { ownerOrgId: { in: orgIds } }, status: { in: ['proposed', 'selected'] } } }),
          this.prisma.shipment.count({ where: { ownerOrgId: { in: orgIds }, status: { in: ['booked', 'in_transit'] } } }),
        ])
        result.enablement = {
          capabilities: enablementCaps,
          orgIds,
          counts: { shipments, forwardOrders, facilities, policies, activePlans, openShipments },
        }
      } else {
        result.enablement = { capabilities: enablementCaps, orgIds: [], counts: { shipments: 0, forwardOrders: 0, facilities: 0, policies: 0, activePlans: 0, openShipments: 0 } }
      }
    }

    // Admin: a compact platform KPI strip on the home cockpit.
    if (user.role === 'admin' || caps.includes('admin')) {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const [activeUsers, loadsWeek, openDisputes, liveListings, openRequests] = await Promise.all([
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.load.count({ where: { createdAt: { gte: since } } }),
        this.prisma.dispute.count({ where: { status: 'open' } }),
        this.prisma.marketListing.count({ where: { status: 'live' } }),
        this.prisma.marketRequest.count({ where: { status: { in: ['open', 'quoted'] } } }),
      ])
      result.admin = { activeUsers, loadsWeek, openDisputes, liveListings, openRequests }
    }

    // ----- Cross-cutting: what needs attention right now -----
    const [unreadCount, kycPending, activeExceptions, pendingBookings, expiringDocs] = await Promise.all([
      this.prisma.notification.count({ where: { userId: user.id, isRead: false } }),
      this.prisma.user.count({
        where: { id: user.id, kycStatus: { in: ['not_started', 'pending'] } },
      }),
      this.prisma.tripException.count({
        where: {
          status: 'open',
          trip: { OR: [{ transporterId: (await this.transporterId(user)) ?? '__none__' }, { load: { supplierId: (await this.supplierId(user)) ?? '__none__' } }] },
        },
      }),
      this.prisma.bid.count({
        where: { status: 'booking_pending', transporter: { userId: user.id } },
      }),
      this.prisma.truck.findMany({
        where: { transporterId: (await this.transporterId(user)) ?? '__none__' },
        select: { id: true, truckNo: true, insuranceUpto: true, permitUpto: true, fitnessUpto: true },
      }),
    ])

    const docAlerts = expiringDocs
      .flatMap((t) => {
        const soon = 30 * 24 * 60 * 60 * 1000
        const now = Date.now()
        const out: Array<{ truckNo: string; doc: string; daysLeft: number }> = []
        for (const [doc, date] of [['insurance', t.insuranceUpto], ['permit', t.permitUpto], ['fitness', t.fitnessUpto]] as const) {
          if (date && new Date(date).getTime() - now < soon && new Date(date).getTime() > now) {
            out.push({ truckNo: t.truckNo, doc, daysLeft: Math.ceil((new Date(date).getTime() - now) / (24 * 60 * 60 * 1000)) })
          }
        }
        return out
      })
      .slice(0, 3)

    result.alerts = {
      unreadNotifications: unreadCount,
      kycPending: kycPending > 0,
      activeExceptions,
      pendingBookings,
      expiringDocs: docAlerts,
    }

    return result
  }

  private async transporterId(user: User) {
    return (await this.prisma.transporter.findUnique({ where: { userId: user.id } }))?.id
  }

  private async supplierId(user: User) {
    return (await this.prisma.supplier.findUnique({ where: { userId: user.id } }))?.id
  }

  private async orgIds(user: User) {
    const memberships = await this.prisma.organizationMember.findMany({ where: { userId: user.id }, select: { organizationId: true } })
    return memberships.map((m) => m.organizationId)
  }

  private driverPay(driver: { payRate: number | null }, fare: number) {
    if (driver.payRate != null && driver.payRate > 0) return driver.payRate
    return Math.round(fare * 0.25) // default 25% share when no pay rate is set
  }
}
