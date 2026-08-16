import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

interface FleetTruck {
  id: string
  type: string
  status?: string
  model?: { capacities: number[] } | null
}

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

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
        // Money: escrow paid out + wallet.
        const escrowPaid = await this.prisma.payment.aggregate({
          where: { type: 'escrow', status: 'succeeded', trip: { load: { supplierId: supplier.id } } },
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
        const fleet = await this.prisma.truck.findMany({
          where: { transporterId: transporter.id },
          include: { model: true },
        })
        const availableTrucks = fleet.filter((t) => t.activeStatus)

        const openLoads = await this.prisma.load.findMany({
          where: { status: 'posted' },
          include: { material: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
        const scored = openLoads
          .map((l) => ({ ...l, matchScore: this.matchScore(l, fleet) }))
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
        // successful payout yet (mirrors releasePayout: net minus advance already
        // released in a split path). Never the gross booking rate.
        const payoutPending = trips.reduce((s, t) => {
          if (t.status !== 'delivered') return s
          if (t.payments.some((p) => p.type === 'payout' && p.status === 'succeeded')) return s
          const base = t.booking?.rate ?? t.load?.fareEstimate ?? 0
          const tds = Math.round(base * 0.02 * 100) / 100
          const net = Math.round((base - tds) * 100) / 100
          const advance = t.payments
            .filter((p) => p.type === 'advance' && p.status === 'succeeded')
            .reduce((a, p) => a + p.amount, 0)
          return s + Math.max(0, Math.round((net - advance) * 100) / 100)
        }, 0)
        const collected = trips.reduce(
          (s, t) => s + t.payments.filter((p) => p.type === 'payout' && p.status === 'succeeded').reduce((a, p) => a + p.amount, 0),
          0,
        )

        result.transporter = {
          availableTrucks: availableTrucks.length,
          fleetSize: fleet.length,
          matchingLoads: scored.filter((l) => l.matchScore >= 60).length,
          recommended: scored.slice(0, 3),
          returnLoads,
          truckNowAvailable: availableTrucks.length > 0 && scored.length > 0,
          lastTripDrop: lastTrip?.load?.dropAddr ?? null,
          money: { payoutPending, collected, wallet: user.cashbackBalance ?? 0 },
        }
      }
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

  private matchScore(load: { truckType: string; weight: number }, fleet: FleetTruck[]) {
    if (fleet.length === 0) return 40
    const typeMatches = fleet.some((t) => t.type === load.truckType)
    const capacityOk = fleet.some((t) => {
      const caps = t.model?.capacities ?? []
      const maxT = caps.length ? Math.max(...caps) : 0
      return maxT >= load.weight
    })
    let score = 0
    if (typeMatches) score += 35
    if (capacityOk) score += 35
    score += 15
    score += 15
    return Math.min(100, score)
  }
}
