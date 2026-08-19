import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common'
import Redis from 'ioredis'
import { REDIS } from '../redis/redis.module'
import { PrismaService } from '../prisma/prisma.service'
import { OutboxRelay } from '../outbox/outbox-relay.service'
import { NotificationsService } from '../notifications/notifications.service'
import type { User } from '@prisma/client'

const NOTIFY_COOLDOWN_S = 30 * 60 // don't re-alert the same trip within 30 min

/**
 * Trip execution intelligence (AI §4.6 "exception detection + ETA intelligence").
 *
 * Deterministic, guardrailed: this agent never moves a trip's state. It computes
 * a health score + ETA from live location evidence and *suggests* recovery
 * actions. A human (transporter, supplier or ops) decides and executes.
 */

export type TripHealthFlagKind = 'stalled' | 'no_ping' | 'dwell_pickup' | 'dwell_drop' | 'slow' | 'off_route' | 'overdue'

export interface TripHealthFlag {
  kind: TripHealthFlagKind
  severity: 'low' | 'medium' | 'high'
  message: string
}

export interface TripHealthSuggestion {
  action: string
  reason: string
}

export interface TripHealthResult {
  score: number // 0..1
  band: 'healthy' | 'watch' | 'at_risk' | 'critical'
  progress: number // 0..1 toward drop
  distanceKm: number // travelled
  remainingKm: number
  etaMinutes: number | null
  avgSpeedKmh: number | null
  lastPingMinutesAgo: number | null
  flags: TripHealthFlag[]
  suggestions: TripHealthSuggestion[]
}

const EXPECTED_SPEED_KMH = 35
const MIN_SPEED_KMH = 15
const STALL_DISTANCE_KM = 0.5
const STALL_WINDOW_MIN = 12
const STALL_LOOKBACK_MIN = 30
const NO_PING_THRESHOLD_MIN = 20
const PICKUP_DWELL_MIN = 45
const DROP_DWELL_MIN = 30
const SLOW_FACTOR = 0.5

export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Pure, side-effect-free health computation — unit-testable in isolation. */
export function computeTripHealth(input: {
  startedAt: Date | null
  origin: { lat: number; lng: number } | null
  destination: { lat: number; lng: number } | null
  pickupAddr?: string | null
  dropAddr?: string | null
  geofenceRadiusKm: number
  locations: Array<{ lat: number; lng: number; speedKmh: number | null; recordedAt: Date }>
  now?: Date
}): TripHealthResult {
  const now = input.now ?? new Date()
  const { origin, destination, locations } = input
  const totalKm = origin && destination ? distanceKm(origin.lat, origin.lng, destination.lat, destination.lng) : 0

  // Cumulative path length from the origin (more honest than max-radius).
  let travelledKm = 0
  let prev: { lat: number; lng: number } | null = null
  for (const loc of [...locations].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())) {
    if (prev) travelledKm += distanceKm(prev.lat, prev.lng, loc.lat, loc.lng)
    prev = loc
  }

  const sorted = [...locations].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
  const last = sorted[sorted.length - 1] ?? null
  const progress = totalKm > 0 ? Math.min(1, travelledKm / totalKm) : last ? 0.5 : 0
  const remainingKm = Math.max(0, totalKm - travelledKm)

  const flags: TripHealthFlag[] = []
  const suggestions: TripHealthSuggestion[] = []

  // 1. No recent ping.
  let lastPingMinutesAgo: number | null = null
  if (last) {
    lastPingMinutesAgo = Math.round((now.getTime() - last.recordedAt.getTime()) / 60000)
    if (lastPingMinutesAgo >= NO_PING_THRESHOLD_MIN) {
      flags.push({
        kind: 'no_ping',
        severity: lastPingMinutesAgo >= 45 ? 'high' : 'medium',
        message: `No location update in ${lastPingMinutesAgo} min`,
      })
      suggestions.push({
        action: 'Call the driver / check app connectivity',
        reason: 'Location feed has been silent; the trip may be moving blind.',
      })
    }
  } else if (input.startedAt) {
    flags.push({
      kind: 'no_ping',
      severity: 'medium',
      message: 'Trip started but no location data yet',
    })
    suggestions.push({
      action: 'Confirm the driver has started sharing location',
      reason: 'No GPS evidence received since trip start.',
    })
  }

  // 2. Stall: the latest point is inside the stall radius of an earlier point
  //    >= STALL_WINDOW_MIN older, within the lookback window.
  if (last && sorted.length >= 2 && input.startedAt) {
    const lookbackStart = new Date(now.getTime() - STALL_LOOKBACK_MIN * 60000)
    const windowed = sorted.filter((l) => l.recordedAt.getTime() >= lookbackStart.getTime())
    if (windowed.length >= 2) {
      const first = windowed[0]!
      const spanMin = (last.recordedAt.getTime() - first.recordedAt.getTime()) / 60000
      const moved = distanceKm(first.lat, first.lng, last.lat, last.lng)
      if (spanMin >= STALL_WINDOW_MIN && moved < STALL_DISTANCE_KM) {
        flags.push({
          kind: 'stalled',
          severity: 'high',
          message: `Truck stalled: moved only ${moved.toFixed(1)} km in ${Math.round(spanMin)} min`,
        })
        suggestions.push({
          action: 'Contact the driver — possible breakdown, traffic or rest stop',
          reason: 'Location has barely moved over the last 12+ minutes.',
        })
      }
    }
  }

  // 3. Dwell at pickup or drop.
  if (origin && last) {
    const distOrigin = distanceKm(last.lat, last.lng, origin.lat, origin.lng)
    const tripAgeMin = input.startedAt ? Math.round((now.getTime() - input.startedAt.getTime()) / 60000) : 0
    if (distOrigin <= input.geofenceRadiusKm && tripAgeMin >= PICKUP_DWELL_MIN) {
      flags.push({
        kind: 'dwell_pickup',
        severity: 'medium',
        message: `Still at pickup after ${tripAgeMin} min`,
      })
      suggestions.push({
        action: 'Confirm loading is done and driver has departed',
        reason: `Truck is within ${input.geofenceRadiusKm} km of the pickup point.`,
      })
    }
  }
  if (destination && last) {
    const distDest = distanceKm(last.lat, last.lng, destination.lat, destination.lng)
    if (distDest <= input.geofenceRadiusKm && lastPingMinutesAgo != null && lastPingMinutesAgo >= DROP_DWELL_MIN) {
      flags.push({
        kind: 'dwell_drop',
        severity: 'medium',
        message: `At destination — awaiting delivery confirmation`,
      })
      suggestions.push({
        action: 'Consignee to confirm delivery receipt',
        reason: 'Truck has been at the destination without a confirmed delivery.',
      })
    }
  }

  // 4. Slow progress relative to the expected truck speed.
  let avgSpeedKmh: number | null = null
  if (last && input.startedAt) {
    const elapsedH = Math.max((last.recordedAt.getTime() - input.startedAt.getTime()) / 3_600_000, 0.1)
    avgSpeedKmh = travelledKm / elapsedH
    if (avgSpeedKmh < EXPECTED_SPEED_KMH * SLOW_FACTOR && elapsedH > 1) {
      flags.push({
        kind: 'slow',
        severity: 'medium',
        message: `Slow progress: avg ${avgSpeedKmh.toFixed(0)} km/h vs ${EXPECTED_SPEED_KMH} expected`,
      })
      suggestions.push({
        action: 'Review route / check for congestion or detour',
        reason: 'Sustained speed is far below the lane average.',
      })
    }
  }

  // 5. Overdue: trip should have arrived by now at expected speed.
  if (totalKm > 0 && last && input.startedAt) {
    const elapsedH = Math.max((now.getTime() - input.startedAt.getTime()) / 3_600_000, 0.1)
    const expectedH = totalKm / EXPECTED_SPEED_KMH
    if (elapsedH > expectedH * 1.5 && progress < 0.9) {
      flags.push({
        kind: 'overdue',
        severity: 'high',
        message: `Overdue: ${elapsedH.toFixed(0)}h elapsed vs ~${expectedH.toFixed(0)}h expected`,
      })
      suggestions.push({
        action: 'Escalate to ops / re-plan or re-route',
        reason: 'The trip is well past its expected duration without arrival.',
      })
    }
  }

  // Health score: start at 1, subtract by severity, floor at 0.
  let score = 1
  for (const f of flags) score -= f.severity === 'high' ? 0.35 : f.severity === 'medium' ? 0.2 : 0.1
  score = Math.max(0, Math.min(1, score))
  const band = score >= 0.75 ? 'healthy' : score >= 0.55 ? 'watch' : score >= 0.35 ? 'at_risk' : 'critical'

  // ETA: remaining distance at the sustained speed (fall back to expected).
  const etaMinutes =
    remainingKm > 0 && totalKm > 0
      ? Math.round((remainingKm / Math.max(avgSpeedKmh ?? EXPECTED_SPEED_KMH, MIN_SPEED_KMH)) * 60)
      : null

  return {
    score,
    band,
    progress,
    distanceKm: Math.round(travelledKm * 10) / 10,
    remainingKm: Math.round(remainingKm * 10) / 10,
    etaMinutes,
    avgSpeedKmh: avgSpeedKmh == null ? null : Math.round(avgSpeedKmh * 10) / 10,
    lastPingMinutesAgo,
    flags,
    suggestions,
  }
}

interface TripWithLoad {
  id: string
  startedAt: Date | null
  status: string
  transporterId: string
  load: {
    supplierId: string
    pickupLat: number | null
    pickupLng: number | null
    dropLat: number | null
    dropLng: number | null
    pickupAddr: string | null
    dropAddr: string | null
    geofenceRadius: number | null
  }
}

@Injectable()
export class TripHealthService {
  private readonly logger = new Logger(TripHealthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(OutboxRelay) private readonly outbox: OutboxRelay,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Compute health for a trip from its latest evidence. */
  async evaluate(tripId: string): Promise<TripHealthResult | null> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { load: true },
    })
    if (!trip) return null
    return this.evaluateTrip(trip as unknown as TripWithLoad)
  }

  private async evaluateTrip(trip: TripWithLoad): Promise<TripHealthResult> {
    const locations = await this.prisma.tripLocation.findMany({
      where: { tripId: trip.id, simulated: false },
      orderBy: { recordedAt: 'asc' },
      take: 500,
    })
    return computeTripHealth({
      startedAt: trip.startedAt,
      origin:
        trip.load.pickupLat != null && trip.load.pickupLng != null
          ? { lat: trip.load.pickupLat, lng: trip.load.pickupLng }
          : null,
      destination:
        trip.load.dropLat != null && trip.load.dropLng != null
          ? { lat: trip.load.dropLat, lng: trip.load.dropLng }
          : null,
      pickupAddr: trip.load.pickupAddr,
      dropAddr: trip.load.dropAddr,
      geofenceRadiusKm: trip.load.geofenceRadius ?? 1,
      locations: locations.map((l) => ({ lat: l.lat, lng: l.lng, speedKmh: l.speedKmh, recordedAt: l.recordedAt })),
    })
  }

  /** Persist a guardrailed trip-health recommendation + emit the outbox event. */
  private async persist(entity: { type: string; id: string; orgId?: string | null }, data: Record<string, unknown>, actorId: string) {
    const created = await this.prisma.$transaction(async (tx) => {
      const rec = await tx.aiRecommendation.create({ data: data as never })
      await this.outbox.emit(tx as never, {
        eventType: 'AI',
        eventCode: 'TRIP_HEALTH_FLAGGED',
        entityType: entity.type,
        entityId: entity.id,
        orgId: entity.orgId ?? null,
        actorId,
        payload: { agent: data.agent, recommendationId: rec.id, summary: data.summary, score: data.score },
      })
      return rec
    })
    return created
  }

  /** Notify the transporter + supplier of a health flag (via preferences-aware channel). */
  private async notify(tripId: string, health: TripHealthResult) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { load: true, transporter: { include: { user: true } } },
    })
    if (!trip) return
    const supplier = await this.prisma.supplier.findUnique({ where: { id: trip.load.supplierId }, include: { user: true } })
    const title = `Trip ${health.band.replace('_', ' ')} — ${health.flags[0]?.kind.replace('_', ' ') ?? 'needs attention'}`
    const body = `${health.flags[0]?.message ?? 'Health check'} — ETA ~${health.etaMinutes ?? '--'} min`
    const data = { tripId, loadId: trip.loadId, healthBand: health.band, score: health.score }
    const targets: Array<string | undefined> = [trip.transporter.user?.id, supplier?.user?.id]
    for (const userId of new Set(targets.filter((id): id is string => Boolean(id)))) {
      await this.notifications.create({ userId, type: 'trip_health', title, body, data, category: 'trips' })
    }
  }

  /** One-shot assessment (user-invoked) — returns the health + recommendation. */
  async assess(tripId: string, user: User) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { load: true } })
    if (!trip) throw new NotFoundException('Trip not found')
    const health = await this.evaluateTrip(trip as unknown as TripWithLoad)
    const recommendation = await this.persist(
      { type: 'trip', id: tripId },
      {
        agent: 'trip-health',
        entityType: 'trip',
        entityId: tripId,
        summary: `Trip health ${health.band} (score ${health.score.toFixed(2)}) — ${health.flags.length} flag(s)`,
        score: health.score,
        output: health as never,
        rationale: {
          evidence: 'live GPS locations, speed, dwell, expected lane speed',
          etas: `ETA ${health.etaMinutes ?? '--'} min at ${health.avgSpeedKmh ?? '--'} km/h avg`,
        } as never,
        guardrails: { informational: true, neverAutoExecutes: true, humanActs: true, suggestsRecovery: true } as never,
        createdBy: user.id,
      },
      user.id,
    )
    return { recommendation, health }
  }

  /** Sweep all in-transit trips; flag + notify any that crossed the risk band. */
  async sweep(): Promise<number> {
    const trips = await this.prisma.trip.findMany({
      where: { status: 'in_transit', startedAt: { not: null } },
      include: { load: true },
      take: 200,
    })
    let flagged = 0
    for (const trip of trips) {
      try {
        const health = await this.evaluateTrip(trip as unknown as TripWithLoad)
        if (health.band === 'healthy' || health.band === 'watch') continue
        // One alert per risk episode (Redis TTL cooldown) — no spam every sweep.
        const key = `trip_health_alert:${trip.id}`
        if (await this.redis.get(key)) continue
        await this.redis.set(key, '1', 'EX', NOTIFY_COOLDOWN_S)
        await this.persist(
          { type: 'trip', id: trip.id },
          {
            agent: 'trip-health',
            entityType: 'trip',
            entityId: trip.id,
            summary: `Trip health ${health.band} (score ${health.score.toFixed(2)}) — ${health.flags.length} flag(s)`,
            score: health.score,
            output: health as never,
            rationale: {
              evidence: 'scheduled sweep of live GPS evidence',
              flags: health.flags.map((f) => f.kind),
            } as never,
            guardrails: { informational: true, neverAutoExecutes: true, humanActs: true, suggestsRecovery: true } as never,
            createdBy: 'system',
          },
          'system',
        )
        await this.notify(trip.id, health)
        flagged++
        this.logger.warn(`[trip-health] ${trip.id} → ${health.band} (${health.flags.map((f) => f.kind).join(', ')})`)
      } catch (e) {
        this.logger.warn(`[trip-health] sweep error on ${trip.id}: ${e instanceof Error ? e.message : e}`)
      }
    }
    return flagged
  }
}