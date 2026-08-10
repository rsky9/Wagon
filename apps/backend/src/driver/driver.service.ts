import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

@Injectable()
export class DriverService {
  constructor(private readonly prisma: PrismaService) {}

  private async driverFor(user: User) {
    const driver = await this.prisma.driver.findFirst({
      where: { mobile: user.mobile, status: true },
    })
    return driver
  }

  /** Driver home: today's trips + assigned active trip. */
  async home(user: User) {
    const driver = await this.driverFor(user)
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
    const driver = await this.driverFor(user)
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
    const driver = await this.driverFor(user)
    if (!driver) throw new BadRequestException('Driver profile not found')
    const updated = await this.prisma.driver.update({
      where: { id: driver.id },
      data: { status: available },
    })
    return { available: updated.status }
  }

  /** Driver earnings summary from delivered trips. */
  async earnings(user: User) {
    const driver = await this.driverFor(user)
    if (!driver) return { trips: 0, earned: 0 }
    const trips = await this.prisma.trip.findMany({
      where: { driverId: driver.id, status: 'delivered' },
      include: { load: true },
    })
    const earned = trips.reduce((s, t) => s + t.load.fareEstimate, 0)
    return { trips: trips.length, earned }
  }
}
