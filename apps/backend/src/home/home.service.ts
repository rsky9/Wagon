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
        result.supplier = {
          activeLoads: active.length,
          awaitingResponses: awaiting.length,
          inTransit: inTransit.length,
          completed,
          latestLoads: active.slice(0, 3),
          inTransitTrips: inTransit.slice(0, 3),
          canPostLoad: active.length < 20,
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

        result.transporter = {
          availableTrucks: availableTrucks.length,
          fleetSize: fleet.length,
          matchingLoads: scored.filter((l) => l.matchScore >= 60).length,
          recommended: scored.slice(0, 3),
          returnLoads,
          truckNowAvailable: availableTrucks.length > 0 && scored.length > 0,
          lastTripDrop: lastTrip?.load?.dropAddr ?? null,
        }
      }
    }

    return result
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
