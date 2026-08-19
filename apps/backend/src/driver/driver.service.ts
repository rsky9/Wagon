import { Injectable, BadRequestException, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PAYMENT_PROVIDER } from '../payments/payment-provider.service'
import type { PaymentProvider } from '../payments/payment-provider.service'
import type { User } from '@prisma/client'

@Injectable()
export class DriverService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /**
   * Driver self-onboarding: claim a seat under a transporter by entering their
   * mobile number. Creates a Driver row (linked by the driver's own mobile so
   * trip assignment + login keep matching) and grants the driver capability.
   */
  async join(transporterMobile: string, user: User) {
    const mobile = transporterMobile?.trim()
    if (!/^\d{10}$/.test(mobile ?? '')) {
      throw new BadRequestException('Enter a valid 10-digit transporter mobile')
    }
    const transporter = await this.prisma.transporter.findFirst({
      where: { user: { mobile } },
      include: { user: true },
    })
    if (!transporter) {
      throw new BadRequestException('No transporter found with that mobile number')
    }
    // Guard: if a Driver row for this driver already exists, it must belong to
    // the same transporter, otherwise a driver can't hop fleets silently.
    const existing = await this.prisma.driver.findFirst({ where: { mobile: user.mobile } })
    if (existing && existing.transporterId !== transporter.id) {
      throw new BadRequestException('You are already registered with another transporter')
    }
    const driver = await this.prisma.driver.upsert({
      where: { id: existing?.id ?? '__new__' },
      create: { transporterId: transporter.id, name: user.name ?? 'Driver', mobile: user.mobile },
      update: { transporterId: transporter.id },
    })
    // Ensure the user holds the driver capability so the driver surface unlocks.
    const caps = new Set<string>(user.capabilities as string[] | undefined ?? [])
    if (!caps.has('driver')) {
      caps.add('driver')
      await this.prisma.user.update({ where: { id: user.id }, data: { capabilities: [...caps] as never } })
    }
    return { driver }
  }

  /** Lookup without the availability filter — self-service (availability toggle)
   *  must work even when the driver has marked themself unavailable, otherwise
   *  an unavailable driver is permanently locked out. */
  private async driverByMobile(user: User) {
    return this.prisma.driver.findFirst({ where: { mobile: user.mobile } })
  }

  /** Driver home: today's trips + assigned active trip. */
  async home(user: User) {
    const driver = await this.driverByMobile(user)
    if (!driver) {
      throw new BadRequestException('Driver profile not found. Ask your transporter to add you.')
    }
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const todayTrips = await this.prisma.trip.findMany({
      where: { driverId: driver.id, createdAt: { gte: start } },
      include: { load: { include: { material: true } } },
      orderBy: { createdAt: 'desc' },
    })
    const active = await this.prisma.trip.findFirst({
      where: { driverId: driver.id, status: { in: ['accepted', 'in_transit'] } },
      include: { load: { include: { material: true } } },
      orderBy: { updatedAt: 'desc' },
    })
    return { todayTrips, activeTrip: active, available: driver.status }
  }

  /** All trips assigned to this driver. */
  async myTrips(user: User) {
    const driver = await this.driverByMobile(user)
    if (!driver) return { trips: [] }
    const trips = await this.prisma.trip.findMany({
      where: { driverId: driver.id },
      include: { load: { include: { material: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return { trips }
  }

  /** Toggle driver availability. */
  async setAvailability(user: User, available: boolean) {
    const driver = await this.driverByMobile(user)
    if (!driver) throw new BadRequestException('Driver profile not found')
    const updated = await this.prisma.driver.update({
      where: { id: driver.id },
      data: { status: available },
    })
    return { available: updated.status }
  }

  /** Driver earnings from delivered trips. Uses the driver's pay rate when set,
   *  else a default share (e.g. 25%) of the trip fare — NOT the full freight. */
  async earnings(user: User) {
    const driver = await this.driverByMobile(user)
    if (!driver) return { trips: 0, earned: 0 }
    const trips = await this.prisma.trip.findMany({
      where: { driverId: driver.id, status: 'delivered' },
      include: { load: true, booking: true },
    })
    // Use the agreed booking rate when present (negotiated trips), not the estimate.
    const earned = trips.reduce((s, t) => s + this.driverPay(driver, t.booking?.rate ?? t.load.fareEstimate), 0)
    return { trips: trips.length, earned, payRate: driver.payRate ?? null }
  }

  /** Per-trip earnings ledger: every delivered trip with fare, driver pay, date. */
  async ledger(user: User) {
    const driver = await this.driverByMobile(user)
    if (!driver) return { trips: [], payRate: null }
    const trips = await this.prisma.trip.findMany({
      where: { driverId: driver.id, status: 'delivered' },
      include: { load: { select: { pickupAddr: true, dropAddr: true, fareEstimate: true } }, booking: true },
      orderBy: { deliveredAt: 'desc' },
    })
    return {
      payRate: driver.payRate ?? null,
      trips: trips.map((t) => ({
        tripId: t.id,
        pickup: t.load.pickupAddr,
        drop: t.load.dropAddr,
        fare: t.booking?.rate ?? t.load.fareEstimate,
        earned: this.driverPay(driver, t.booking?.rate ?? t.load.fareEstimate),
        deliveredAt: t.deliveredAt,
      })),
    }
  }

  private driverPay(driver: { payRate: number | null }, fare: number) {
    if (driver.payRate != null && driver.payRate > 0) return driver.payRate
    return Math.round(fare * 0.25) // default 25% share when no pay rate is set
  }

  /** Driver uploads POD for a delivered trip they were assigned to. */
  async uploadPod(tripId: string, podUrl: string, user: User) {
    const driver = await this.driverByMobile(user)
    if (!driver) throw new BadRequestException('Driver profile not found')
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } })
    if (!trip) throw new BadRequestException('Trip not found')
    if (trip.driverId !== driver.id) throw new BadRequestException('Not your trip')
    const existing = await this.prisma.proofOfDelivery.findUnique({ where: { tripId } })
    if (existing && existing.status !== 'pending') {
      return { trip, podUploaded: false }
    }
    const pod = await this.prisma.proofOfDelivery.upsert({
      where: { tripId },
      update: { photoKey: podUrl },
      create: { tripId, photoKey: podUrl },
    })
    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: { podUrl: `s3://${podUrl}` },
    })
    return { trip: updated, pod, podUploaded: true }
  }

  /** Driver captures their own bank destination so real payouts can be released. */
  async setBank(input: { bankAccount: string; ifsc: string }, user: User) {
    const account = input.bankAccount?.trim()
    const ifsc = input.ifsc?.trim().toUpperCase()
    if (!/^\d{9,18}$/.test(account ?? '')) {
      throw new BadRequestException('Enter a valid bank account number')
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc ?? '')) {
      throw new BadRequestException('Enter a valid IFSC code')
    }
    const driver = await this.driverByMobile(user)
    if (!driver) throw new BadRequestException('Driver profile not found')
    const updated = await this.prisma.driver.update({
      where: { id: driver.id },
      data: { bankAccount: account, ifsc },
    })
    return { bankAdded: Boolean(updated.bankAccount && updated.ifsc) }
  }

  /** Driver payout status: bank captured, balance, per-trip payouts and outstanding due. */
  async payoutStatus(user: User) {
    const driver = await this.driverByMobile(user)
    if (!driver) return { bankAdded: false, due: 0, paid: 0, trips: [] }
    const delivered = await this.prisma.trip.findMany({
      where: { driverId: driver.id, status: 'delivered' },
      include: { load: { select: { pickupAddr: true, dropAddr: true, fareEstimate: true } }, booking: true },
    })
    const payouts = await this.prisma.payment.findMany({
      where: { tripId: { in: delivered.map((t) => t.id) }, type: 'driver_payout', status: 'succeeded' },
      select: { tripId: true, amount: true },
    })
    const paidByTrip = new Map(payouts.map((p) => [p.tripId, p.amount]))
    let due = 0
    let paid = 0
    const trips = delivered.map((t) => {
      const fare = t.booking?.rate ?? t.load.fareEstimate ?? 0
      const earned = this.driverPay(driver, fare)
      const alreadyPaid = paidByTrip.get(t.id)
      if (alreadyPaid != null) paid += alreadyPaid
      else due += earned
      return {
        tripId: t.id,
        pickup: t.load.pickupAddr,
        drop: t.load.dropAddr,
        earned,
        paid: alreadyPaid ?? 0,
        deliveredAt: t.deliveredAt,
      }
    })
    return { bankAdded: Boolean(driver.bankAccount && driver.ifsc), due, paid, trips }
  }

  /** Release the driver's payout for a delivered trip (idempotent, guarded). */
  async releasePayout(tripId: string, user: User) {
    const driver = await this.driverByMobile(user)
    if (!driver) throw new BadRequestException('Driver profile not found')
    if (!(driver.bankAccount && driver.ifsc)) {
      throw new BadRequestException('Add your bank account (Bank → Driver) before payouts can be released')
    }
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { load: true, booking: true },
    })
    if (!trip) throw new BadRequestException('Trip not found')
    if (trip.driverId !== driver.id) throw new BadRequestException('Not your trip')
    if (trip.status !== 'delivered') throw new BadRequestException('Payout requires the trip to be delivered')
    const pod = await this.prisma.proofOfDelivery.findUnique({ where: { tripId } })
    if (!pod || pod.status !== 'confirmed' && pod.status !== 'verified') {
      throw new BadRequestException('Delivery proof must be confirmed before payout')
    }
    const amount = this.driverPay(driver, trip.booking?.rate ?? trip.load.fareEstimate ?? 0)
    if (amount <= 0) throw new BadRequestException('No earnings to pay out on this trip')

    const idempotencyKey = `driver_payout_${tripId}`
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } })
    if (existing && existing.status === 'succeeded') return { payment: existing, alreadyPaid: true }
    if (existing && existing.status === 'failed') await this.prisma.payment.delete({ where: { id: existing.id } })

    const result = await this.provider.payout({
      amount,
      currency: 'INR',
      reference: idempotencyKey,
      destination: { account: driver.bankAccount ?? undefined, ifsc: driver.ifsc ?? undefined },
    })
    const payment = await this.prisma.payment.create({
      data: {
        tripId,
        type: 'driver_payout',
        amount,
        method: 'mock',
        providerRef: result.providerRef,
        idempotencyKey,
        status: result.status === 'succeeded' ? 'succeeded' : 'failed',
      },
    })
    return { payment, alreadyPaid: false }
  }
}
