import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common'
import Redis from 'ioredis'
import { REDIS } from '../redis/redis.module'
import { PrismaService } from '../prisma/prisma.service'
import { TrackingGateway } from './tracking.gateway'
import type { User } from '@prisma/client'

@Injectable()
export class TrackingService {
  private static readonly MIN_INTERVAL_MS = 2000

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TrackingGateway)) private readonly gateway: TrackingGateway,
    @Inject(REDIS) private readonly redis: Redis,
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
    if (!transporter || transporter.id !== trip.transporterId) {
      throw new BadRequestException('Only the assigned transporter can share location')
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
      await this.prisma.logisticsEvent.create({
        data: {
          eventType: 'EXECUTION',
          eventCode,
          classifier: 'ACT',
          entityType: 'trip',
          entityId: tripId,
          shipmentId: null,
          occurredAt: new Date(),
          source: 'gps',
          actorId: user.id,
          location: zone === 'pickup' ? load?.pickupAddr ?? null : load?.dropAddr ?? null,
          payload: { tripId, loadId: trip.loadId, lat, lng },
        },
      })
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

    // ETA from live speed (if any) + remaining distance to drop.
    let etaMinutes: number | null = null
    if (speedKmh && speedKmh > 5 && distDrop > 0) {
      etaMinutes = Math.round((distDrop / speedKmh) * 60)
    }

    this.gateway.broadcast(tripId, {
      lat,
      lng,
      speedKmh: speedKmh ?? null,
      recordedAt: record.recordedAt,
      zone,
      etaMinutes,
    })

    return { location: record, zone, etaMinutes }
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
