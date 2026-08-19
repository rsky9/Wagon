import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

@Injectable()
export class DriverService {
  constructor(private readonly prisma: PrismaService) {}

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
}
