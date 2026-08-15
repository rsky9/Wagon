import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { timingSafeEqual } from 'node:crypto'
import Redis from 'ioredis'
import { REDIS } from '../redis/redis.module'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { ShipmentProjector } from '../shipments/shipment-projector.service'
import { MarketService } from '../market/market.service'
import type { User, TripStage } from '@prisma/client'

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
    private readonly shipments: ShipmentProjector,
    private readonly market: MarketService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async quote(loadId: string, amount: number, user: User) {
    if (!amount || amount <= 0) {
      throw new BadRequestException('amount must be positive')
    }
    const load = await this.prisma.load.findUnique({ where: { id: loadId } })
    if (!load) {
      throw new NotFoundException('Load not found')
    }
    if (load.status !== 'posted') {
      throw new BadRequestException('Load is no longer open for quotes')
    }
    const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    if (!transporter) {
      throw new BadRequestException('Transporter profile not found — complete onboarding first')
    }
    const transporterUser = await this.prisma.user.findUnique({ where: { id: user.id }, select: { transporterVerified: true } })
    if (!transporterUser?.transporterVerified) {
      throw new BadRequestException('Complete KYC verification to quote loads')
    }

    // Self-deal guard: a user with both capabilities must never haul their own load.
    const owner = await this.prisma.supplier.findUnique({ where: { id: load.supplierId }, select: { userId: true } })
    if (owner && owner.userId === user.id) {
      throw new BadRequestException('You cannot quote on your own load')
    }

    const existing = await this.prisma.quote.findFirst({
      where: { loadId, transporterId: transporter.id },
    })
    const quote =
      existing &&
      (await this.prisma.quote.update({
        where: { id: existing.id },
        data: { amount },
      }))
    if (!quote) {
      return {
        quote: await this.prisma.quote.create({
          data: { loadId, transporterId: transporter.id, amount },
        }),
      }
    }
    return { quote }
  }

  async accept(loadId: string, user: User) {
    const load = await this.prisma.load.findUnique({ where: { id: loadId } })
    if (!load) {
      throw new NotFoundException('Load not found')
    }
    if (load.status === 'accepted' || load.status === 'in_transit' || load.status === 'delivered') {
      throw new BadRequestException('Load already assigned')
    }
    const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    if (!transporter) {
      throw new BadRequestException('Transporter profile not found — complete onboarding first')
    }
    const transporterUser = await this.prisma.user.findUnique({ where: { id: user.id }, select: { transporterVerified: true } })
    if (!transporterUser?.transporterVerified) {
      throw new BadRequestException('Complete KYC verification to accept loads')
    }
    // A transporter can only accept with an active truck in their fleet.
    const activeTruck = await this.prisma.truck.findFirst({
      where: { transporterId: transporter.id, activeStatus: true },
    })
    if (!activeTruck) {
      throw new BadRequestException('Add an active truck to your fleet before accepting loads')
    }

    // Self-deal guard: a user with both capabilities must never haul their own load.
    const owner = await this.prisma.supplier.findUnique({ where: { id: load.supplierId }, select: { userId: true } })
    if (owner && owner.userId === user.id) {
      throw new BadRequestException('You cannot accept your own load')
    }

    const trip = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.trip.findUnique({ where: { loadId } })
      if (existing) throw new BadRequestException('Load already assigned to a trip')
      const created = await tx.trip.create({
        data: { loadId, transporterId: transporter.id },
      })
      await tx.load.update({ where: { id: loadId }, data: { status: 'accepted' } })
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
        type: 'order_accepted',
        title: 'Load accepted',
        body: `Transporter accepted your load #${loadId.slice(-6)}`,
        data: { tripId: trip.id, loadId },
        category: 'booking',
      })
    }

    // Phase 1 — canonical event: trip booked/started on the road leg.
    const shipmentId = await this.shipments.shipmentIdFor(loadId)
    await this.shipments.syncFromLoad(loadId, 'accepted', 'TRIP_STARTED', 'TRANSPORT', user.id)
    await this.shipments.emit({
      eventType: 'TRANSPORT',
      eventCode: 'TRIP_STARTED',
      entityType: 'trip',
      entityId: trip.id,
      orgId: shipmentId ? await this.shipments.shipmentOrgId(shipmentId) : null,
      shipmentId,
      actorId: user.id,
      payload: { loadId, tripId: trip.id },
    })

    return { trip }
  }

  async updateStatus(tripId: string, status: 'in_transit' | 'delivered', user: User) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } })
    if (!trip) {
      throw new NotFoundException('Trip not found')
    }
    if (trip.transporterId !== (await this.transporterId(user))) {
      throw new BadRequestException('Not your trip')
    }
    if (trip.status === 'cancelled') {
      throw new BadRequestException('Trip is cancelled — cannot update status')
    }

    const transitions: Record<string, string[]> = {
      accepted: ['in_transit'],
      in_transit: ['delivered'],
    }
    if (!transitions[trip.status]?.includes(status)) {
      throw new BadRequestException(`Invalid transition ${trip.status} -> ${status}`)
    }
    // Delivery requires the delivery OTP to be verified first.
    if (status === 'delivered' && !trip.deliveryOtpVerifiedAt) {
      throw new BadRequestException('Delivery OTP must be verified before marking delivered')
    }
    // Pickup requires the pickup OTP to be verified before going in-transit
    // (closes the bypass where the legacy status path skipped pickup checks).
    if (status === 'in_transit' && !trip.pickupOtpVerifiedAt) {
      throw new BadRequestException('Pickup OTP must be verified before starting transit')
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.trip.update({
        where: { id: tripId },
        data: {
          status,
          startedAt: status === 'in_transit' ? new Date() : trip.startedAt,
          deliveredAt: status === 'delivered' ? new Date() : null,
        },
      })
      await tx.load.update({
        where: { id: trip.loadId },
        data: { status: status === 'delivered' ? 'delivered' : 'in_transit' },
      })
      return t
    })

    const load = await this.prisma.load.findUnique({ where: { id: trip.loadId } })
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: load!.supplierId },
      include: { user: true },
    })
    if (supplier) {
      await this.notifications.create({
        userId: supplier.userId,
        type: status === 'in_transit' ? 'trip_started' : 'trip_delivered',
        title: status === 'in_transit' ? 'Trip in transit' : 'Load delivered',
        body: `Load #${trip.loadId.slice(-6)} is ${status === 'in_transit' ? 'in transit' : 'delivered'}`,
        data: { tripId: trip.id, loadId: trip.loadId },
        category: 'trips',
      })
    }

    // Phase 1 — canonical events for road lifecycle.
    const shipmentId = await this.shipments.shipmentIdFor(trip.loadId)
    const eventCode = status === 'in_transit' ? 'TRIP_IN_TRANSIT' : 'DELIVERED'
    await this.shipments.syncFromLoad(
      trip.loadId,
      status,
      eventCode,
      'TRANSPORT',
      user.id,
      status === 'delivered' && load ? load.dropAddr : undefined,
    )
    await this.shipments.emit({
      eventType: 'TRANSPORT',
      eventCode,
      entityType: 'trip',
      entityId: trip.id,
      orgId: shipmentId ? await this.shipments.shipmentOrgId(shipmentId) : null,
      shipmentId,
      actorId: user.id,
      location: status === 'delivered' && load ? load.dropAddr : undefined,
      payload: { tripId: trip.id, loadId: trip.loadId, status },
    })

    // Marketplace trust: auto-rate the transporter's org after delivery.
    if (status === 'delivered') {
      await this.market.autoRateFromTrip(trip as never, user).catch(() => {})
    }

    return { trip: updated }
  }

  // ---------- Trip execution state machine ----------
  private static readonly STAGE_ORDER: Record<string, string[]> = {
    accepted: ['enroute_pickup'],
    enroute_pickup: ['arrived_pickup'],
    arrived_pickup: ['loading'],
    loading: ['loaded'],
    loaded: ['enroute_drop'],
    enroute_drop: ['arrived_drop'],
    arrived_drop: ['unloading'],
    unloading: ['delivered'],
  }

  /** Advance the trip execution stage. Transporters AND assigned drivers drive this flow. */
  async advanceStage(tripId: string, user: User) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } })
    if (!trip) throw new NotFoundException('Trip not found')
    const isTransporter = trip.transporterId === (await this.transporterId(user))
    const isDriver = await this.isAssignedDriver(trip.driverId, user)
    if (!isTransporter && !isDriver) throw new BadRequestException('Not your trip')
    if (trip.status === 'cancelled') throw new BadRequestException('Trip is cancelled — cannot advance')
    if (trip.status === 'delivered' || trip.stage === 'delivered') throw new BadRequestException('Trip already completed')

    // Driver identity: a driver advancing execution must be a license-verified
    // member of the transporter's fleet (matched by their registered mobile).
    if (isDriver) {
      const driver = await this.prisma.driver.findFirst({
        where: { id: trip.driverId ?? '__none__', mobile: user.mobile },
      })
      if (!driver) throw new BadRequestException('Driver not registered in the fleet')
      if (!driver.licenseVerified) throw new BadRequestException('Driver license must be verified before executing trips')
    }

    const next = TripsService.STAGE_ORDER[trip.stage]?.[0]
    if (!next) throw new BadRequestException(`No next stage from ${trip.stage}`)

    // Guarded stages: pickup OTP required before loading, delivery OTP before delivered.
    if (next === 'loading' && !trip.pickupOtpVerifiedAt) throw new BadRequestException('Verify pickup OTP first')
    if (next === 'delivered' && !trip.deliveryOtpVerifiedAt) throw new BadRequestException('Verify delivery OTP first')

    const isDelivered = next === 'delivered'
    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.trip.update({
        where: { id: tripId },
        data: {
          stage: next as TripStage,
          status: isDelivered ? 'delivered' : next === 'loaded' ? 'in_transit' : trip.status,
          startedAt: next === 'loaded' ? (trip.startedAt ?? new Date()) : trip.startedAt,
          deliveredAt: isDelivered ? new Date() : null,
        },
      })
      if (isDelivered) {
        await tx.load.update({ where: { id: trip.loadId }, data: { status: 'delivered' } })
      }
      return t
    })

    const load = await this.prisma.load.findUnique({ where: { id: trip.loadId } })
    const supplier = await this.prisma.supplier.findUnique({ where: { id: load?.supplierId }, include: { user: true } })
    if (supplier) {
      await this.notifications.create({
        userId: supplier.userId,
        type: isDelivered ? 'trip_delivered' : 'trip_stage',
        title: isDelivered ? 'Load delivered' : this.stageLabel(next),
        body: isDelivered
          ? `Load #${trip.loadId.slice(-6)} was delivered — confirm delivery evidence to release payout.`
          : `Load #${trip.loadId.slice(-6)} ${this.stageLabel(next).toLowerCase()}`,
        data: { tripId: trip.id, loadId: trip.loadId, stage: next },
        category: 'trips',
      })
    }

    // Marketplace trust: auto-rate the transporter's org after delivery.
    if (isDelivered) {
      await this.market.autoRateFromTrip(trip as never, user).catch(() => {})
    }

    // Phase 1 — keep the canonical Shipment in sync when the trip stage crosses
    // 'loaded' (shipment in_transit) and 'delivered' (shipment delivered).
    if (next === 'loaded') {
      await this.shipments.syncFromLoad(trip.loadId, 'in_transit', 'TRIP_IN_TRANSIT', 'TRANSPORT', user.id)
    } else if (isDelivered) {
      await this.shipments.syncFromLoad(trip.loadId, 'delivered', 'DELIVERED', 'TRANSPORT', user.id, load?.dropAddr)
    }
    // Per-stage canonical event: STAGE_<STAGE> for every execution step.
    await this.shipments.emit({
      eventType: 'TRANSPORT',
      eventCode: `STAGE_${next.toUpperCase()}`,
      entityType: 'trip',
      entityId: trip.id,
      shipmentId: await this.shipments.shipmentIdFor(trip.loadId),
      actorId: user.id,
      location: load?.pickupAddr,
      payload: { tripId: trip.id, loadId: trip.loadId, stage: next },
    })

    return { trip: updated }
  }

  /** Generate a 4-digit pickup or delivery OTP shown to the supplier. */
  async generateOtp(tripId: string, kind: 'pickup' | 'delivery', user: User) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { load: true } })
    if (!trip) throw new NotFoundException('Trip not found')
    const isTransporter = trip.transporterId === (await this.transporterId(user))
    const isDriver = await this.isAssignedDriver(trip.driverId, user)
    if (!isTransporter && !isDriver) throw new BadRequestException('Not your trip')
    // Stage/status-gate: pickup OTP is for the pre-load phase, delivery OTP for
    // the in-transit/delivery phase. Supports both the stage machine and the
    // coarse status path.
    if (kind === 'pickup' && trip.status !== 'accepted' && trip.stage !== 'arrived_pickup' && trip.stage !== 'accepted') {
      throw new BadRequestException('Pickup OTP is only valid before the trip is in transit')
    }
    if (kind === 'delivery' && trip.status === 'accepted' && trip.stage === 'accepted') {
      throw new BadRequestException('Delivery OTP is only valid once the trip is in transit')
    }
    const code = String(Math.floor(1000 + Math.random() * 9000))
    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: kind === 'pickup'
        ? { pickupOtp: code, pickupOtpAt: new Date() }
        : { deliveryOtp: code, deliveryOtpAt: new Date() },
    })
    // Deliver the code to the supplier (push + mock log).
    const supplier = await this.prisma.supplier.findUnique({ where: { id: trip.load.supplierId }, include: { user: true } })
    if (supplier) {
      await this.notifications.create({
        userId: supplier.userId,
        type: kind === 'pickup' ? 'pickup_otp' : 'delivery_otp',
        title: kind === 'pickup' ? 'Pickup confirmation code' : 'Delivery confirmation code',
        body: `Load #${trip.loadId.slice(-6)} ${kind} code: ${code}. Share it with your transporter.`,
        data: { tripId, loadId: trip.loadId },
        category: 'execution',
      })
    }
    const isProd = this.config.get('NODE_ENV') === 'production'
    if (!isProd) console.log(`[mock-otp-${kind}] trip=${tripId} code=${code}`)
    return { kind, otpGenerated: true, devCode: isProd ? undefined : code, trip: updated }
  }

  /** Supplier verifies the pickup/delivery OTP before the trip proceeds. */
  async verifyOtp(tripId: string, kind: 'pickup' | 'delivery', code: string, user: User) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { load: true } })
    if (!trip) throw new NotFoundException('Trip not found')
    const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
    if (!supplier || supplier.id !== trip.load.supplierId) throw new BadRequestException('Only the supplier can verify OTP')

    const expected = kind === 'pickup' ? trip.pickupOtp : trip.deliveryOtp
    if (!expected) throw new BadRequestException(`No ${kind} OTP generated`)

    // Brute-force protection: max 5 attempts per OTP.
    const attemptsKey = `otp_attempts:${tripId}:${kind}`
    const attempts = Number((await this.redis.get(attemptsKey)) ?? '0')
    if (attempts >= 5) {
      throw new BadRequestException('Too many OTP attempts — request a new code')
    }
    const ok = this.constantTimeEqual(expected, code)
    if (!ok) {
      await this.redis.set(attemptsKey, String(attempts + 1), 'EX', 600)
      throw new BadRequestException('Invalid OTP')
    }
    await this.redis.del(attemptsKey)

    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: kind === 'pickup' ? { pickupOtp: null, pickupOtpVerifiedAt: new Date() } : { deliveryOtp: null, deliveryOtpVerifiedAt: new Date() },
    })
    return { trip: updated, verified: true }
  }

  private constantTimeEqual(a: string, b: string) {
    const ab = Buffer.from(a)
    const bb = Buffer.from(b)
    if (ab.length !== bb.length) return false
    return timingSafeEqual(ab, bb)
  }

  /** Transporter or supplier cancels an active trip; the load returns to the feed. */
  async cancelTrip(tripId: string, reason: string, user: User) {
    if (!reason?.trim()) throw new BadRequestException('Cancellation reason is required')
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { load: true },
    })
    if (!trip) throw new NotFoundException('Trip not found')
    if (trip.status !== 'accepted' && trip.status !== 'in_transit') {
      throw new BadRequestException('Only active trips (accepted/in_transit) can be cancelled')
    }

    const [transporter, supplier] = await Promise.all([
      this.prisma.transporter.findUnique({ where: { userId: user.id } }),
      this.prisma.supplier.findUnique({ where: { userId: user.id } }),
    ])
    const isTransporter = transporter?.id === trip.transporterId
    const isSupplier = supplier?.id === trip.load.supplierId
    if (!isTransporter && !isSupplier) {
      throw new BadRequestException('Only the assigned transporter or supplier can cancel this trip')
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.trip.update({
        where: { id: tripId },
        data: { status: 'cancelled' },
      })
      // Return the load to 'posted' so it can be re-bid, unless it's already delivered.
      if (trip.load.status !== 'delivered' && trip.load.status !== 'completed') {
        await tx.load.update({ where: { id: trip.loadId }, data: { status: 'posted' } })
      }
      // Reverse any captured escrow/advance/balance so the supplier gets their
      // money back (a refund Payment row per captured stage).
      const captures = await tx.payment.findMany({
        where: { tripId, type: { in: ['escrow', 'advance', 'balance'] }, status: 'succeeded' },
      })
      for (const c of captures) {
        const refundKey = `refund_${c.idempotencyKey}`
        const existingRefund = await tx.payment.findUnique({ where: { idempotencyKey: refundKey } })
        if (existingRefund) continue
        await tx.payment.create({
          data: {
            tripId,
            type: 'refund',
            amount: c.amount,
            method: c.method,
            providerRef: `refund-${c.providerRef ?? tripId}`,
            idempotencyKey: refundKey,
            status: 'succeeded',
          },
        })
      }
      return t
    })

    // Notify the counterparty.
    const counterparty = isTransporter
      ? await this.prisma.supplier.findUnique({ where: { id: trip.load.supplierId }, include: { user: true } })
      : await this.prisma.transporter.findUnique({ where: { id: trip.transporterId }, include: { user: true } })
    if (counterparty) {
      await this.notifications.create({
        userId: counterparty.userId,
        type: 'trip_cancelled',
        title: 'Trip cancelled',
        body: `Trip for load #${trip.loadId.slice(-6)} was cancelled: ${reason.trim()}`,
        data: { tripId, loadId: trip.loadId },
        category: 'trips',
      })
    }

    // Phase 1 — canonical event: cancelled trip syncs the shipment back to planned.
    await this.shipments.syncFromLoad(trip.loadId, 'posted', 'TRIP_CANCELLED', 'EXCEPTION', user.id)

    return { trip: updated }
  }

  private stageLabel(stage: string) {
    return stage.replace('_', ' ')
  }

  async forUser(user: User) {
    const isTransporter = (user.capabilities?.includes('transporter') as boolean) || user.role === 'transporter'
    const isSupplier = (user.capabilities?.includes('supplier') as boolean) || user.role === 'supplier'
    if (isTransporter && isSupplier) {
      const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
      const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
      const trips = await this.prisma.trip.findMany({
        where: {
          OR: [
            { transporterId: transporter?.id ?? '__none__' },
            { load: { supplierId: supplier?.id ?? '__none__' } },
          ],
        },
        include: { load: { include: { material: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return { trips }
    }
    if (isTransporter) {
      const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
      const trips = await this.prisma.trip.findMany({
        where: { transporterId: transporter?.id },
        include: { load: { include: { material: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return { trips }
    }
    if (isSupplier) {
      const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
      const trips = await this.prisma.trip.findMany({
        where: { load: { supplierId: supplier?.id } },
        include: { load: { include: { material: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return { trips }
    }
    return { trips: [] }
  }

  private async transporterId(user: User) {
    const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    return transporter?.id
  }

  /** True if the user is the driver assigned to a trip (drivers are matched by mobile). */
  private async isAssignedDriver(tripDriverId: string | null, user: User) {
    if (!tripDriverId) return false
    const driver = await this.prisma.driver.findUnique({ where: { id: tripDriverId } })
    return driver?.mobile === user.mobile
  }
}
