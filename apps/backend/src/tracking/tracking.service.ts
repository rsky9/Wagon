import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { REDIS } from '../redis/redis.module'
import { PrismaService } from '../prisma/prisma.service'
import { TrackingGateway } from './tracking.gateway'
import { OutboxRelay } from '../outbox/outbox-relay.service'
import type { User } from '@prisma/client'

@Injectable()
export class TrackingService {
  private static readonly MIN_INTERVAL_MS = 2000

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => TrackingGateway)) private readonly gateway: TrackingGateway,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly outbox: OutboxRelay,
  ) {}

  /** Transporter shares a live location point for an in-transit trip. */
  async ingest(tripId: string, lat: number, lng: number, speedKmh: number | undefined, user: User, simulated = false) {
    if (!isFinite(lat) || !isFinite(lng)) {
      throw new BadRequestException('Invalid coordinates')
    }
    // Rate-limit DB writes per trip (GPS pings can arrive every few hundred ms).
    const key = `tracking:${tripId}`
    const last = await this.redis.get(key)
    const now = Date.now()
    if (last && now - Number(last) < TrackingService.MIN_INTERVAL_MS) {
      throw new BadRequestException('Location updates too frequent — slow down')
    }
    await this.redis.set(key, String(now), 'EX', 60)
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } })
    if (!trip) {
      throw new NotFoundException('Trip not found')
    }
    const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    const isTransporter = transporter && transporter.id === trip.transporterId
    // The assigned driver may also share their live position while in transit
    // (the truck IS the driver). Matched by mobile — same as trip execution.
    const isAssignedDriver = trip.driverId
      ? (await this.prisma.driver.findUnique({ where: { id: trip.driverId } }))?.mobile === user.mobile
      : false
    if (!isTransporter && !isAssignedDriver) {
      throw new BadRequestException('Only the assigned transporter or driver can share location')
    }
    if (trip.status !== 'in_transit') {
      throw new BadRequestException('Location sharing requires in-transit trip')
    }

    const record = await this.prisma.tripLocation.create({
      data: { tripId, lat, lng, speedKmh: speedKmh ?? null, simulated },
    })

    // Geofence evaluation: distance from pickup/drop.
    const load = await this.prisma.load.findUnique({ where: { id: trip.loadId } })
    const geofence = load?.geofenceRadius ?? 1 // km default
    let zone: 'none' | 'pickup' | 'drop' = 'none'
    let distDrop = 0
    if (load) {
      const distPickup = this.distanceKm(lat, lng, load.pickupLat, load.pickupLng)
      distDrop = this.distanceKm(lat, lng, load.dropLat, load.dropLng)
      if (distPickup <= geofence) zone = 'pickup'
      else if (distDrop <= geofence) zone = 'drop'
    }

    // Arrival events on zone transitions (idempotent per zone per trip).
    const arrivedKey = `arrived:${tripId}:${zone}`
    if (zone !== 'none' && !(await this.redis.get(arrivedKey))) {
      await this.redis.set(arrivedKey, '1', 'EX', 86400)
      const eventCode = zone === 'pickup' ? 'ARRIVED_AT_PICKUP' : 'ARRIVED_AT_DROP'
      // Emit through the transactional outbox (webhook fan-out + canonical
      // shipment link) instead of a bare logistics row.
      await this.outbox.emit(
        {
          logisticsEvent: { create: (args: { data: Record<string, unknown> }) => this.prisma.logisticsEvent.create({ data: args.data as never }) },
          outboxMessage: { create: (args: { data: Record<string, unknown> }) => this.prisma.outboxMessage.create({ data: args.data as never }) },
        },
        {
          eventType: 'EXECUTION',
          eventCode,
          classifier: 'ACT',
          entityType: 'trip',
          entityId: tripId,
          shipmentId: load ? await this.shipmentIdFor(trip.loadId) : null,
          occurredAt: new Date(),
          source: 'gps',
          actorId: user.id,
          location: zone === 'pickup' ? load?.pickupAddr ?? null : load?.dropAddr ?? null,
          payload: { tripId, loadId: trip.loadId, lat, lng },
        },
      )
      // Notify the counterparty of arrival.
      const supplier = await this.prisma.supplier.findUnique({ where: { id: load?.supplierId ?? '' } })
      if (supplier) {
        await this.prisma.notification.create({
          data: {
            userId: supplier.userId,
            type: zone === 'pickup' ? 'arrived_pickup' : 'arrived_drop',
            title: zone === 'pickup' ? 'Truck arrived at pickup' : 'Truck arrived at destination',
            body: `${trip.loadId.slice(-6)} — truck reached ${zone === 'pickup' ? load?.pickupAddr : load?.dropAddr}`,
            data: { tripId, loadId: trip.loadId },
          },
        })
      }
    }

    // ETA from live speed (if any) + remaining distance to drop. Prefer a
    // route-aware OSRM distance (cached per location bucket); fall back to
    // straight-line haversine when the router is unreachable.
    let etaMinutes: number | null = null
    let remainingKm: number | null = null
    let etaSource: 'osrm' | 'haversine' = 'haversine'
    if (load?.dropLat != null && load.dropLng != null && distDrop > 0) {
      remainingKm = await this.routeDistanceKm({ lat, lng }, { lat: load.dropLat, lng: load.dropLng })
      if (remainingKm == null) {
        remainingKm = Math.round(distDrop * 10) / 10
      } else {
        etaSource = 'osrm'
      }
      const speed = speedKmh && speedKmh > 5 ? speedKmh : 25
      etaMinutes = Math.round((remainingKm / speed) * 60)
    }

    this.gateway.broadcast(tripId, {
      lat,
      lng,
      speedKmh: speedKmh ?? null,
      recordedAt: record.recordedAt,
      zone,
      etaMinutes,
      remainingKm,
      etaSource,
    })

    return { location: record, zone, etaMinutes, remainingKm, etaSource }
  }

  /** Route-aware remaining distance via OSRM (Redis-cached per location bucket). */
  private async routeDistanceKm(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): Promise<number | null> {
    const key = `osrm:${from.lat.toFixed(2)},${from.lng.toFixed(2)}:${to.lat.toFixed(2)},${to.lng.toFixed(2)}`
    const cached = await this.redis.get(key)
    if (cached) return Number(cached)
    const base = this.config.get<string>('OSRM_URL') || 'https://router.project-osrm.org'
    const url = `${base}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&alternatives=false`
    try {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 4000)
      t.unref()
      const res = await fetch(url, { signal: controller.signal })
      const json = (await res.json()) as { code: string; routes?: Array<{ distance: number }> }
      if (json.code === 'Ok' && json.routes?.[0]) {
        const km = Math.round((json.routes[0].distance / 1000) * 10) / 10
        if (km > 0) {
          await this.redis.set(key, String(km), 'EX', 3600)
          return km
        }
      }
    } catch {
      // Router unreachable/timeout — caller falls back to haversine.
    }
    return null
  }

  private async shipmentIdFor(loadId: string): Promise<string | null> {
    const s = await this.prisma.shipment.findFirst({ where: { ref: loadId } })
    return s?.id ?? null
  }

  private distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371
    const dLat = ((lat2 - lat1) * Math.PI) / 180
    const dLng = ((lng2 - lng1) * Math.PI) / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(a))
  }

  async latest(tripId: string) {
    return this.prisma.tripLocation.findFirst({
      where: { tripId },
      orderBy: { recordedAt: 'desc' },
    })
  }

  async history(tripId: string, user: User) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { load: true } })
    if (!trip) {
      throw new NotFoundException('Trip not found')
    }
    const participant = await this.isParticipant(trip, user)
    if (!participant) {
      throw new BadRequestException('Not a participant of this trip')
    }
    const locations = await this.prisma.tripLocation.findMany({
      where: { tripId },
      orderBy: { recordedAt: 'asc' },
      take: 500,
    })
    return { locations, load: trip.load }
  }

  /** Socket-level participation check (authenticated by userId, no full User object needed). */
  async isParticipantForSocket(tripId: string, userId: string): Promise<boolean> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { load: { select: { supplierId: true } } },
    })
    if (!trip) return false
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) return false
    return this.isParticipant(
      { transporterId: trip.transporterId, load: { supplierId: trip.load.supplierId } },
      user,
    )
  }

  private async isParticipant(
    trip: { transporterId: string; load: { supplierId: string } },
    user: User,
  ) {
    const isTransporter = (user.capabilities?.includes('transporter') as boolean) || user.role === 'transporter'
    const isSupplier = (user.capabilities?.includes('supplier') as boolean) || user.role === 'supplier'
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
