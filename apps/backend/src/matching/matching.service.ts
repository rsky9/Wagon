import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { truckToPickupKm } from '../reference/geo'

/**
 * Per-truck load matching. Unlike a flat "any truck fits" check, this engine
 * scores each truck in the fleet against a load on type + capacity + location
 * + goods affinity, then returns the BEST truck's score and WHY it matches.
 *
 * Scoring (0-100):
 *  - 30  type match          (this truck's type == load's truckType)
 *  - 30  capacity fit        (this truck's max model capacity >= load weight)
 *  - 25  location proximity  (truck home base vs load pickup, distance-banded)
 *  - 15  goods affinity      (transporter has hauled this material before)
 */
@Injectable()
export class LoadMatchingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Fleet summary a transporter's personalized surfaces consume. */
  async fleetContext(userId: string) {
    const transporter = await this.prisma.transporter.findUnique({ where: { userId } })
    if (!transporter) return { fleet: [], goodsAffinity: new Set<string>(), reliability: 0 }
    const fleet = await this.prisma.truck.findMany({
      where: { transporterId: transporter.id },
      include: { model: true, driver: true },
    })
    // Goods affinity: materials this transporter has actually hauled (via trips).
    const trips = await this.prisma.trip.findMany({
      where: { transporterId: transporter.id, status: { in: ['delivered', 'in_transit'] } },
      select: { status: true, load: { select: { materialId: true } } },
    })
    const goodsAffinity = new Set(trips.map((t) => t.load.materialId).filter(Boolean) as string[])
    const completed = trips.filter((t) => t.status === 'delivered').length
    return { fleet, goodsAffinity, reliability: Math.min(1, completed / 5) }
  }

  /**
   * Score one load against a fleet. Returns the best single truck's score,
   * the truck that fits best, and the human-readable reasons.
   * Field names are prefixed (matchedTruck*) so the result can be spread onto
   * a load without clashing with the load's own truckType.
   */
  scoreLoad(
    load: {
      id?: string
      truckType: string
      weight: number
      materialId?: string
      pickupAddr?: string
      pickupLat?: number | null
      pickupLng?: number | null
    },
    ctx: {
      fleet: Array<{ id: string; truckNo: string; type: string; origin?: string | null; lat?: number | null; lng?: number | null; model?: { capacities: number[] } | null }>
      goodsAffinity: Set<string>
      reliability: number
    },
  ): { matchScore: number; matchedTruckId?: string | null; matchedTruckNo?: string | null; matchedTruckType?: string | null; matchedDistanceKm?: number | null; reasons: string[] } {
    if (!ctx.fleet.length) {
      return { matchScore: 40, matchedTruckId: null, matchedTruckNo: null, matchedTruckType: null, matchedDistanceKm: null, reasons: ['Add a truck to see personalized matches'] }
    }

    let bestScore = 0
    let best: { matchedTruckId?: string | null; matchedTruckNo?: string | null; matchedTruckType?: string | null; matchedDistanceKm?: number | null; reasons: string[] } | null = null

    for (const truck of ctx.fleet) {
      const reasons: string[] = []
      let score = 0
      const typeMatches = truck.type === load.truckType
      const caps = truck.model?.capacities ?? []
      const maxT = caps.length ? Math.max(...caps) : 0
      const capacityFits = maxT >= load.weight

      if (typeMatches) { score += 30; reasons.push(`${truck.truckNo} (${truck.type}) fits this truck type`) }
      if (capacityFits) { score += 30; reasons.push(`Fits up to ${maxT}t`) }
      if (typeMatches && !capacityFits) reasons.push(`${truck.truckNo} too small for ${load.weight}t`)

      // Location: truck home base vs load pickup (distance-banded).
      const km = truckToPickupKm(truck, load)
      if (km != null) {
        if (km <= 50) { score += 25; reasons.push(`Near your ${truck.truckNo} (${Math.round(km)} km away)`) }
        else if (km <= 150) { score += 18; reasons.push(`${Math.round(km)} km from your ${truck.truckNo}`) }
        else if (km <= 300) { score += 8; reasons.push(`${Math.round(km)} km from your ${truck.truckNo}`) }
      } else if (truck.origin) {
        // No coords: if the truck's home city appears in the pickup, give partial credit.
        const pickupCity = (load.pickupAddr ?? '').toLowerCase()
        if (pickupCity.includes(truck.origin.toLowerCase())) { score += 25; reasons.push(`Pickup matches your ${truck.truckNo} home (${truck.origin})`) }
      }

      // Goods affinity: has hauled this material before.
      if (load.materialId && ctx.goodsAffinity.has(load.materialId)) {
        score += 15
        reasons.push('You have hauled this cargo before')
      }

      if (score > bestScore) {
        bestScore = score
        best = { matchedTruckId: truck.id, matchedTruckNo: truck.truckNo, matchedTruckType: truck.type, matchedDistanceKm: km, reasons }
      }
    }

    return {
      matchScore: Math.min(100, Math.round(bestScore)),
      matchedTruckId: best?.matchedTruckId ?? null,
      matchedTruckNo: best?.matchedTruckNo ?? null,
      matchedTruckType: best?.matchedTruckType ?? null,
      matchedDistanceKm: best?.matchedDistanceKm ?? null,
      reasons: best?.reasons ?? [],
    }
  }

  /** Convenience: fetch context then score a list of loads. */
  async scoreLoads(userId: string, loads: Array<{ id?: string; truckType: string; weight: number; materialId?: string; pickupAddr?: string; pickupLat?: number | null; pickupLng?: number | null }>) {
    const ctx = await this.fleetContext(userId)
    return loads.map((l) => ({ ...l, ...this.scoreLoad(l, ctx) }))
  }
}
