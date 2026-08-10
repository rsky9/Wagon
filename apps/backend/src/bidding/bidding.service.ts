import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { RatingsService } from '../ratings/ratings.service'
import type { User } from '@prisma/client'

export interface SubmitBidInput {
  loadId: string
  amount: number
  truckId?: string
  driverId?: string
  advanceAmount?: number
  balanceAmount?: number
  pickupBy?: string
  etaHours?: number
  validityHours?: number
}

@Injectable()
export class BiddingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly ratings: RatingsService,
  ) {}

  private async supplierFor(user: User) {
    return this.prisma.supplier.findUnique({ where: { userId: user.id } })
  }

  private async transporterFor(user: User) {
    return this.prisma.transporter.findUnique({ where: { userId: user.id } })
  }

  private async loadFor(loadId: string) {
    const load = await this.prisma.load.findUnique({ where: { id: loadId } })
    if (!load) throw new NotFoundException('Load not found')
    return load
  }

  /** Transporter submits a structured bid on an open load. */
  async submitBid(input: SubmitBidInput, user: User) {
    const load = await this.loadFor(input.loadId)
    if (load.status !== 'posted') throw new BadRequestException('Load is not open for bidding')
    // Enforce bidding deadline if set.
    if (load.biddingDeadline && new Date(load.biddingDeadline) < new Date()) {
      throw new BadRequestException('Bidding window has closed')
    }
    await this.expireStale()
    if (load.commercialModel === 'invite') {
      if (!load.shortlistedTransporters.includes('*')) {
        const transporter = await this.transporterFor(user)
        if (!transporter || !load.shortlistedTransporters.includes(transporter.id)) {
          throw new BadRequestException('Invite-only load — you are not shortlisted')
        }
      }
    }
    if (!input.amount || input.amount <= 0) throw new BadRequestException('Bid amount must be positive')
    const transporter = await this.transporterFor(user)
    if (!transporter) throw new BadRequestException('Complete transporter onboarding first')

    // Self-deal guard: a user with both capabilities must never haul their own load.
    const owner = await this.prisma.supplier.findUnique({
      where: { id: load.supplierId },
      select: { userId: true },
    })
    if (owner && owner.userId === user.id) {
      throw new BadRequestException('You cannot bid on your own load')
    }

    const existing = await this.prisma.bid.findFirst({
      where: { loadId: input.loadId, transporterId: transporter.id, status: { notIn: ['withdrawn'] } },
    })
    const bid = existing
      ? await this.prisma.bid.update({
          where: { id: existing.id },
          data: {
            amount: input.amount,
            truckId: input.truckId,
            driverId: input.driverId,
            advanceAmount: input.advanceAmount,
            balanceAmount: input.balanceAmount,
            pickupBy: input.pickupBy,
            etaHours: input.etaHours,
            validityHours: input.validityHours ?? 24,
            status: 'pending',
          },
        })
      : await this.prisma.bid.create({
          data: {
            loadId: input.loadId,
            transporterId: transporter.id,
            amount: input.amount,
            truckId: input.truckId,
            driverId: input.driverId,
            advanceAmount: input.advanceAmount,
            balanceAmount: input.balanceAmount,
            pickupBy: input.pickupBy,
            etaHours: input.etaHours,
            validityHours: input.validityHours ?? 24,
          },
        })

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: load.supplierId },
      include: { user: true },
    })
    if (supplier) {
      await this.notifications.create({
        userId: supplier.userId,
        type: 'bid_received',
        title: 'New bid',
        body: `Transporter bid ₹${input.amount.toLocaleString('en-IN')} on ${load.pickupAddr} → ${load.dropAddr}`,
        data: { loadId: load.id },
      })
    }
    return { bid }
  }

  /** Withdraw a bid before acceptance. */
  async withdrawBid(bidId: string, user: User) {
    const transporter = await this.transporterFor(user)
    if (!transporter) throw new BadRequestException('Not a transporter')
    const bid = await this.prisma.bid.findUnique({ where: { id: bidId } })
    if (!bid || bid.transporterId !== transporter.id) throw new NotFoundException('Bid not found')
    if (bid.status !== 'pending') throw new BadRequestException('Only pending bids can be withdrawn')
    return { bid: await this.prisma.bid.update({ where: { id: bidId }, data: { status: 'withdrawn' } }) }
  }

  /** Supplier decision room: aggregated view of bids for a load. */
  async decisionRoom(loadId: string, user: User) {
    const load = await this.loadFor(loadId)
    const supplier = await this.supplierFor(user)
    if (!supplier || load.supplierId !== supplier.id) throw new BadRequestException('Only the load owner can open the decision room')

    const bids = await this.prisma.bid.findMany({
      where: { loadId, status: { notIn: ['withdrawn'] } },
      include: { load: true },
      orderBy: { amount: 'asc' },
    })

    const bestPrice = bids.length ? Math.min(...bids.map((b) => b.amount)) : null
    const shortlisted = bids.filter((b) => b.status === 'shortlisted')
    const negotiating = bids.filter((b) => b.status === 'negotiating')

    const enriched = await Promise.all(
      bids.map(async (b) => {
        const transporter = await this.prisma.transporter.findUnique({
          where: { id: b.transporterId },
          include: { user: { select: { name: true, rating: true } } },
        })
        const tripsCount = await this.prisma.trip.count({ where: { transporterId: b.transporterId } })
        const completedTrips = await this.prisma.trip.count({ where: { transporterId: b.transporterId, status: 'delivered' } })
        return {
          ...b,
          transporterName: transporter?.user.name ?? 'Transporter',
          rating: transporter?.user.rating ?? 0,
          tripsCount,
          completedTrips,
          cancelRate: tripsCount ? Math.max(0, tripsCount - completedTrips) / tripsCount : 0,
          score: Math.round(
            40 * (bestPrice ? bestPrice / b.amount : 1) + 30 * Math.min(1, (transporter?.user.rating ?? 0) / 5) + 30 * Math.min(1, completedTrips / 10),
          ),
        }
      }),
    )

    return {
      load: { id: load.id, route: `${load.pickupAddr} → ${load.dropAddr}`, commercialModel: load.commercialModel, status: load.status },
      bids: enriched,
      summary: {
        totalBids: bids.length,
        shortlisted: shortlisted.length,
        negotiating: negotiating.length,
        bestPrice,
      },
    }
  }

  /** Supplier shortlists a bid; transporter gets notified. */
  async shortlist(bidId: string, user: User) {
    const supplier = await this.supplierFor(user)
    const bid = await this.prisma.bid.findUnique({ where: { id: bidId } })
    if (!bid) throw new NotFoundException('Bid not found')
    const load = await this.prisma.load.findUnique({ where: { id: bid.loadId } })
    if (!supplier || load?.supplierId !== supplier.id) throw new BadRequestException('Only the load owner can shortlist')
    const updated = await this.prisma.bid.update({ where: { id: bidId }, data: { status: 'shortlisted' } })

    const transporter = await this.prisma.transporter.findUnique({
      where: { id: bid.transporterId },
      include: { user: true },
    })
    if (transporter) {
      await this.notifications.create({
        userId: transporter.userId,
        type: 'shortlisted',
        title: 'You are shortlisted',
        body: `Supplier shortlisted your bid of ₹${bid.amount.toLocaleString('en-IN')}`,
        data: { loadId: load.id },
      })
    }
    return { bid: updated }
  }

  /** Reject a bid. */
  async rejectBid(bidId: string, user: User) {
    const supplier = await this.supplierFor(user)
    const bid = await this.prisma.bid.findUnique({ where: { id: bidId } })
    if (!bid) throw new NotFoundException('Bid not found')
    const load = await this.prisma.load.findUnique({ where: { id: bid.loadId } })
    if (!supplier || load?.supplierId !== supplier.id) throw new BadRequestException('Only the load owner can reject')
    return { bid: await this.prisma.bid.update({ where: { id: bidId }, data: { status: 'rejected' } }) }
  }

  /** Supplier counters a bid (start or continue negotiation). */
  async counterOffer(bidId: string, amount: number, conditions: string | undefined, user: User) {
    const supplier = await this.supplierFor(user)
    const bid = await this.prisma.bid.findUnique({ where: { id: bidId } })
    if (!bid) throw new NotFoundException('Bid not found')
    const load = await this.prisma.load.findUnique({ where: { id: bid.loadId } })
    if (!supplier || load?.supplierId !== supplier.id) throw new BadRequestException('Only the load owner can counter')
    if (!amount || amount <= 0) throw new BadRequestException('Counter amount must be positive')

    await this.prisma.bid.update({ where: { id: bidId }, data: { status: 'negotiating' } })
    const offer = await this.prisma.negotiationOffer.create({
      data: { loadId: bid.loadId, bidId, fromRole: 'supplier', amount, conditions: conditions?.trim() || null },
    })

    const transporter = await this.prisma.transporter.findUnique({
      where: { id: bid.transporterId },
      include: { user: true },
    })
    if (transporter) {
      await this.notifications.create({
        userId: transporter.userId,
        type: 'counteroffer',
        title: 'Counteroffer received',
        body: `Supplier countered at ₹${amount.toLocaleString('en-IN')}`,
        data: { loadId: load.id },
      })
    }
    return { offer }
  }

  /** The party opposite the offerer accepts, rejects, or re-counters. */
  async respondToCounter(offerId: string, action: 'accept' | 'reject' | 'counter', amount: number | undefined, user: User, conditions?: string) {
    const offer = await this.prisma.negotiationOffer.findUnique({ where: { id: offerId } })
    if (!offer) throw new NotFoundException('Offer not found')
    if (offer.status !== 'offered') throw new BadRequestException('Offer already resolved')

    const load = await this.prisma.load.findUnique({ where: { id: offer.loadId } })
    if (!load) throw new NotFoundException('Load not found')

    // The responder is the opposite role of whoever made the offer.
    if (offer.fromRole === 'supplier') {
      const transporter = await this.transporterFor(user)
      if (!transporter || offer.bidId === '') throw new BadRequestException('Not a transporter')
      const bid = await this.prisma.bid.findUnique({ where: { id: offer.bidId } })
      if (!bid || bid.transporterId !== transporter.id) throw new BadRequestException('Not your bid')
    } else {
      const supplier = await this.supplierFor(user)
      if (!supplier || load.supplierId !== supplier.id) throw new BadRequestException('Not the load owner')
    }

    if (action === 'counter') {
      if (!amount || amount <= 0) throw new BadRequestException('Counter amount must be positive')
      const updated = await this.prisma.negotiationOffer.update({ where: { id: offerId }, data: { status: 'rejected' } })
      const next = await this.prisma.negotiationOffer.create({
        data: { loadId: offer.loadId, bidId: offer.bidId, fromRole: offer.fromRole === 'supplier' ? 'transporter' : 'supplier', amount, conditions: conditions?.trim() || offer.conditions },
      })
      return { offer: updated, counter: next }
    }

    const status = action === 'accept' ? 'accepted' : 'rejected'
    const updated = await this.prisma.negotiationOffer.update({ where: { id: offerId }, data: { status } })

    if (action === 'accept') {
      const bid = await this.prisma.bid.update({ where: { id: offer.bidId }, data: { amount: offer.amount, status: 'accepted' } })
      const load = await this.prisma.load.findUnique({ where: { id: offer.loadId } })
      if (load) {
        const transporter = await this.prisma.transporter.findUnique({
          where: { id: bid.transporterId },
          include: { user: true },
        })
        if (transporter) {
          await this.notifications.create({
            userId: transporter.userId,
            type: 'bid_accepted',
            title: 'Bid accepted',
            body: `Offer of ₹${offer.amount.toLocaleString('en-IN')} accepted`,
            data: { loadId: load.id },
          })
        }
      }
      return { offer: updated, bid }
    }
    return { offer: updated }
  }

  /** Supplier proposes booking → creates snapshot in pending state, notifies transporter. */
  async confirmBooking(loadId: string, bidId: string, user: User) {
    const load = await this.loadFor(loadId)
    const supplier = await this.supplierFor(user)
    if (!supplier || load.supplierId !== supplier.id) throw new BadRequestException('Only the load owner can confirm')
    const bid = await this.prisma.bid.findUnique({ where: { id: bidId } })
    if (!bid || bid.loadId !== loadId) throw new NotFoundException('Bid not found')
    if (bid.status !== 'accepted' && bid.status !== 'shortlisted') {
      throw new BadRequestException('Bid must be accepted before booking')
    }

    // Truck double-booking guard: reject if the same truck already has an active trip.
    if (bid.truckId) {
      const truckBusy = await this.prisma.trip.findFirst({
        where: { status: { in: ['accepted', 'in_transit'] } },
      }).then(async (anyActive) => {
        if (!anyActive) return false
        const bidsOnActive = await this.prisma.bid.findMany({
          where: { truckId: bid.truckId, status: { in: ['accepted', 'pending'] } },
        })
        return bidsOnActive.length > 0
      })
      if (truckBusy) {
        throw new BadRequestException('Selected truck is already committed to another trip')
      }
    }

    // Represent the pending booking via the bid state: 'booking_pending'.
    await this.prisma.bid.update({ where: { id: bidId }, data: { status: 'booking_pending' } })

    const transporter = await this.prisma.transporter.findUnique({
      where: { id: bid.transporterId },
      include: { user: true },
    })
    if (transporter) {
      await this.notifications.create({
        userId: transporter.userId,
        type: 'booking_confirmed',
        title: 'Booking confirmation requested',
        body: `Confirm terms to book ${load.pickupAddr} → ${load.dropAddr} at ₹${bid.amount.toLocaleString('en-IN')}`,
        data: { loadId, bidId },
      })
    }
    return { status: 'awaiting_transporter_confirmation', bidId }
  }

  /** Transporter confirms the proposed booking → creates the trip + immutable snapshot. */
  async transporterConfirm(loadId: string, bidId: string, user: User) {
    const load = await this.loadFor(loadId)
    const transporter = await this.transporterFor(user)
    if (!transporter) throw new BadRequestException('Not a transporter')
    const bid = await this.prisma.bid.findUnique({ where: { id: bidId } })
    if (!bid || bid.loadId !== loadId) throw new NotFoundException('Bid not found')
    if (bid.transporterId !== transporter.id) throw new BadRequestException('Not your bid')
    if (bid.status !== 'booking_pending') {
      throw new BadRequestException('No pending booking to confirm')
    }

    const trip = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trip.create({
        data: {
          loadId,
          transporterId: bid.transporterId,
          driverId: bid.driverId ?? null,
        },
      })
      await tx.load.update({ where: { id: loadId }, data: { status: 'accepted' } })
      await tx.bid.update({ where: { id: bidId }, data: { status: 'accepted' } })
      await tx.bookingSnapshot.create({
        data: {
          tripId: created.id,
          rate: bid.amount,
          advanceAmount: bid.advanceAmount,
          balanceAmount: bid.balanceAmount,
          paymentTerms: load.paymentTerms,
          conditions: load.extraCharges,
          truckId: bid.truckId,
          driverId: bid.driverId,
          supplierConfirmed: true,
          transporterConfirmed: true,
          confirmedAt: new Date(),
        },
      })
      await tx.quote.deleteMany({ where: { loadId } })
      return created
    })

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: load.supplierId },
      include: { user: true },
    })
    if (supplier) {
      await this.notifications.create({
        userId: supplier.userId,
        type: 'booking_confirmed',
        title: 'Booking locked in',
        body: `Transporter confirmed — trip created for ${load.pickupAddr} → ${load.dropAddr}`,
        data: { tripId: trip.id, loadId },
      })
    }
    return { trip, snapshot: { rate: bid.amount } }
  }

  /** Negotiation timeline: full offer history for a load's winning/nominated bid. */
  async negotiationTimeline(loadId: string, user: User) {
    const load = await this.loadFor(loadId)
    const supplier = await this.supplierFor(user)
    const transporter = await this.transporterFor(user)
    const isSupplier = !!supplier && load.supplierId === supplier.id
    const bid = await this.prisma.bid.findFirst({
      where: { loadId, transporterId: transporter?.id },
      orderBy: { updatedAt: 'desc' },
    })
    const isTransporter = !!transporter && !!bid && bid.transporterId === transporter.id
    if (!isSupplier && !isTransporter) throw new BadRequestException('Only participants can view the timeline')

    const offers = await this.prisma.negotiationOffer.findMany({
      where: { loadId },
      orderBy: { createdAt: 'asc' },
    })
    const bids = await this.prisma.bid.findMany({
      where: { loadId, status: { notIn: ['withdrawn'] } },
      orderBy: { amount: 'asc' },
    })
    return { load: { id: load.id, route: `${load.pickupAddr} → ${load.dropAddr}` }, offers, bids }
  }

  /** Transporter rates the supplier after delivery. */
  async rateSupplier(tripId: string, score: number, review: string | undefined, user: User) {
    if (!score || score < 1 || score > 5) throw new BadRequestException('Score must be 1-5')
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { load: true } })
    if (!trip) throw new NotFoundException('Trip not found')
    const transporter = await this.transporterFor(user)
    if (!transporter || trip.transporterId !== transporter.id) throw new BadRequestException('Not your trip')
    if (trip.status !== 'delivered') throw new BadRequestException('Rate after delivery')
    if (trip.supplierRating) throw new BadRequestException('Already rated')
    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: { supplierRating: score, supplierReview: review?.trim() || null, supplierRatedAt: new Date() },
    })
    await this.ratings.recomputeSupplierRating(trip.load.supplierId)
    return { trip: updated }
  }

  /** Transporter: pending booking confirmations (bids awaiting their confirmation). */
  async myPendingBookings(user: User) {
    const transporter = await this.transporterFor(user)
    if (!transporter) return { pending: [] }
    const pending = await this.prisma.bid.findMany({
      where: { transporterId: transporter.id, status: 'booking_pending' },
      include: { load: { include: { material: true } } },
      orderBy: { updatedAt: 'desc' },
    })
    return { pending }
  }

  /** Expire bids/offers whose validity window has passed. */
  private async expireStale() {
    const now = new Date()
    await this.prisma.bid.updateMany({
      where: { status: 'pending', createdAt: { lt: new Date(now.getTime() - 24 * 3600 * 1000 * 7) } },
      data: { status: 'expired' },
    })
    // Expire per-bid validity: approximate using a generous window (7d) since validityHours is per-bid.
    const stale = await this.prisma.bid.findMany({ where: { status: 'pending' } })
    for (const b of stale) {
      const hours = b.validityHours ?? 24
      if (now.getTime() - b.createdAt.getTime() > hours * 3600 * 1000) {
        await this.prisma.bid.update({ where: { id: b.id }, data: { status: 'expired' } })
      }
    }
    const offers = await this.prisma.negotiationOffer.findMany({ where: { status: 'offered' } })
    for (const o of offers) {
      if (now.getTime() - o.createdAt.getTime() > (o.validityHours ?? 24) * 3600 * 1000) {
        await this.prisma.negotiationOffer.update({ where: { id: o.id }, data: { status: 'expired' } })
      }
    }
  }

  /** Transporter: my submitted bids with withdraw + status. */
  async myBids(user: User) {
    const transporter = await this.transporterFor(user)
    if (!transporter) return { bids: [] }
    const bids = await this.prisma.bid.findMany({
      where: { transporterId: transporter.id },
      include: { load: { include: { material: true } } },
      orderBy: { updatedAt: 'desc' },
    })
    return { bids }
  }

  /** Read the booking snapshot for a trip. */
  async bookingForTrip(tripId: string, user: User) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } })
    if (!trip) throw new NotFoundException('Trip not found')
    const snapshot = await this.prisma.bookingSnapshot.findUnique({ where: { tripId } })
    if (!snapshot) throw new NotFoundException('No booking snapshot')
    return { snapshot }
  }
}
