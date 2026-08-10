import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

@Injectable()
export class RatingsService {
  constructor(private readonly prisma: PrismaService) {}

  async rateTransporter(tripId: string, score: number, review: string | undefined, user: User) {
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new BadRequestException('Rating must be an integer 1-5')
    }
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { load: true } })
    if (!trip) {
      throw new NotFoundException('Trip not found')
    }
    const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
    if (!supplier || supplier.id !== trip.load.supplierId) {
      throw new BadRequestException('Only the load supplier can rate this trip')
    }
    if (trip.status !== 'delivered') {
      throw new BadRequestException('Rate after delivery')
    }
    if (trip.rating) {
      throw new BadRequestException('Already rated')
    }

    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: { rating: score, review: review?.trim() || undefined },
    })
    await this.recomputeTransporterRating(trip.transporterId)
    return { trip: updated }
  }

  /** All delivered trips with ratings/reviews for a transporter. */
  async reviewsForTransporter(userId: string) {
    const transporter = await this.prisma.transporter.findUnique({ where: { userId } })
    if (!transporter) throw new NotFoundException('Transporter not found')
    const trips = await this.prisma.trip.findMany({
      where: { transporterId: transporter.id, rating: { not: null } },
      include: { load: { select: { pickupAddr: true, dropAddr: true } } },
      orderBy: { deliveredAt: 'desc' },
      take: 50,
    })
    return {
      reviews: trips.map((t) => ({
        tripId: t.id,
        rating: t.rating,
        review: t.review,
        route: `${t.load.pickupAddr} → ${t.load.dropAddr}`,
        deliveredAt: t.deliveredAt,
      })),
    }
  }

  async transporterRating(userId: string) {
    const transporter = await this.prisma.transporter.findUnique({ where: { userId } })
    if (!transporter) {
      throw new NotFoundException('Transporter not found')
    }
    const trips = await this.prisma.trip.findMany({
      where: { transporterId: transporter.id, rating: { not: null } },
    })
    if (trips.length === 0) {
      return { rating: null, count: 0 }
    }
    const avg = trips.reduce((s, t) => s + (t.rating ?? 0), 0) / trips.length
    return { rating: Math.round(avg * 10) / 10, count: trips.length }
  }

  /** Supplier-side reputation: average of transporter ratings received on shipped loads. */
  async supplierRating(userId: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { userId } })
    if (!supplier) {
      throw new NotFoundException('Supplier not found')
    }
    const trips = await this.prisma.trip.findMany({
      where: { load: { supplierId: supplier.id }, supplierRating: { not: null } },
    })
    if (trips.length === 0) {
      return { rating: null, count: 0 }
    }
    const avg = trips.reduce((s, t) => s + (t.supplierRating ?? 0), 0) / trips.length
    return { rating: Math.round(avg * 10) / 10, count: trips.length }
  }

  private async recomputeTransporterRating(transporterId: string) {
    const trips = await this.prisma.trip.findMany({
      where: { transporterId, rating: { not: null } },
    })
    if (trips.length === 0) return
    const avg = trips.reduce((s, t) => s + (t.rating ?? 0), 0) / trips.length
    const transporter = await this.prisma.transporter.findUnique({ where: { id: transporterId } })
    if (transporter) {
      await this.prisma.user.update({
        where: { id: transporter.userId },
        data: { rating: Math.round(avg * 10) / 10 },
      })
    }
  }

  /** Recompute a user's supplier-side reputation after a new transporter rating. */
  async recomputeSupplierRating(supplierId: string) {
    const trips = await this.prisma.trip.findMany({
      where: { load: { supplierId }, supplierRating: { not: null } },
    })
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } })
    if (!supplier) return
    const avg = trips.length ? trips.reduce((s, t) => s + (t.supplierRating ?? 0), 0) / trips.length : null
    await this.prisma.user.update({
      where: { id: supplier.userId },
      data: { supplierRating: avg === null ? null : Math.round(avg * 10) / 10 },
    })
  }
}
