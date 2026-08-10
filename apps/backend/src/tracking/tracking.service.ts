import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TrackingGateway } from './tracking.gateway'
import type { User } from '@prisma/client'

@Injectable()
export class TrackingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TrackingGateway)) private readonly gateway: TrackingGateway,
  ) {}

  /** Transporter shares a live location point for an in-transit trip. */
  async ingest(tripId: string, lat: number, lng: number, speedKmh: number | undefined, user: User) {
    if (!isFinite(lat) || !isFinite(lng)) {
      throw new BadRequestException('Invalid coordinates')
    }
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
      data: { tripId, lat, lng, speedKmh: speedKmh ?? null },
    })

    // Geofence evaluation: distance from pickup/drop.
    const load = await this.prisma.load.findUnique({ where: { id: trip.loadId } })
    const geofence = load?.geofenceRadius ?? 1 // km default
    let zone: 'none' | 'pickup' | 'drop' = 'none'
    if (load) {
      const distPickup = this.distanceKm(lat, lng, load.pickupLat, load.pickupLng)
      const distDrop = this.distanceKm(lat, lng, load.dropLat, load.dropLng)
      if (distPickup <= geofence) zone = 'pickup'
      else if (distDrop <= geofence) zone = 'drop'
    }

    this.gateway.broadcast(tripId, {
      lat,
      lng,
      speedKmh: speedKmh ?? null,
      recordedAt: record.recordedAt,
      zone,
    })

    return { location: record, zone }
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
