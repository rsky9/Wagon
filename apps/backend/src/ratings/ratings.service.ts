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

    const transporter = await this.prisma.transporter.findUnique({ where: { id: trip.transporterId } })

    // Write a Review row (source of truth for the counterparty's profile) + keep the Trip column in sync.
    await this.prisma.review.upsert({
      where: { tripId_reviewerId: { tripId, reviewerId: user.id } },
      update: { score, review: review?.trim() || null, role: 'transporter', revieweeId: transporter?.userId ?? '' },
      create: {
        tripId,
        reviewerId: user.id,
        revieweeId: transporter?.userId ?? '',
        role: 'transporter',
        score,
        review: review?.trim() || null,
      },
    })
    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: { rating: score, review: review?.trim() || undefined },
    })
    await this.recomputeTransporterRating(trip.transporterId)
    return { trip: updated }
  }

  /** All delivered trips with ratings/reviews for a transporter. */
  async reviewsForTransporter(userId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { revieweeId: userId, role: 'transporter' },
      include: { trip: { include: { load: { select: { pickupAddr: true, dropAddr: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return {
      reviews: reviews.map((r) => ({
        tripId: r.tripId,
        rating: r.score,
        review: r.review,
        route: `${r.trip.load.pickupAddr} → ${r.trip.load.dropAddr}`,
        deliveredAt: r.trip.deliveredAt,
      })),
    }
  }

  async transporterRating(userId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { revieweeId: userId, role: 'transporter' },
    })
    if (reviews.length === 0) {
      return { rating: null, count: 0 }
    }
    const avg = reviews.reduce((s, r) => s + r.score, 0) / reviews.length
    return { rating: Math.round(avg * 10) / 10, count: reviews.length }
  }

  /** All reviews received by a user (both roles), newest first. */
  async reviewsReceived(userId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { revieweeId: userId },
      include: { trip: { include: { load: { select: { pickupAddr: true, dropAddr: true } } } }, reviewer: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const mapped = reviews.map((r) => ({
      tripId: r.tripId,
      role: r.role,
      rating: r.score,
      review: r.review,
      reviewerName: r.reviewer.name,
      route: `${r.trip.load.pickupAddr} → ${r.trip.load.dropAddr}`,
      createdAt: r.createdAt,
    }))
    // Merge enablement org ratings received by the user's organizations so
    // forwarder/warehouse/carrier owners see their marketplace reputation too.
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organization: { select: { id: true, name: true, kind: true } } },
    })
    const orgIds = memberships.map((m) => m.organization.id)
    const orgRatings = orgIds.length
      ? await this.prisma.orgRating.findMany({
          where: { subjectOrgId: { in: orgIds } },
          include: { giverOrg: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 50,
        })
      : []
    const orgReviews = orgRatings.map((r) => ({
      tripId: r.referenceId ?? undefined,
      role: r.axis,
      rating: r.score,
      review: r.review,
      reviewerName: r.giverOrg?.name ?? 'Org partner',
      route: `${memberships.find((m) => m.organization.id === r.subjectOrgId)?.organization.name ?? 'Org'} (${r.axis})`,
      createdAt: r.createdAt,
      orgRating: true,
    }))
    return {
      reviews: [...mapped, ...orgReviews].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    }
  }

  /** Supplier-side reputation: average of transporter ratings received on shipped loads. */
  async supplierRating(userId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { revieweeId: userId, role: 'supplier' },
    })
    if (reviews.length === 0) {
      return { rating: null, count: 0 }
    }
    const avg = reviews.reduce((s, r) => s + r.score, 0) / reviews.length
    return { rating: Math.round(avg * 10) / 10, count: reviews.length }
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
