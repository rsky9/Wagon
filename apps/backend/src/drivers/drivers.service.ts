import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  private async transporterId(user: User) {
    const t = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    return t?.id
  }

  async list(user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) return { drivers: [] }
    const drivers = await this.prisma.driver.findMany({
      where: { transporterId },
      orderBy: { createdAt: 'desc' },
    })
    return { drivers }
  }

  /** Dispatch pool: drivers who are available (status=true) with their current
   *  assignment load, so the transporter can pick a driver to assign to a trip. */
  async available(user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) return { drivers: [] }
    const drivers = await this.prisma.driver.findMany({
      where: { transporterId, status: true },
      orderBy: { createdAt: 'asc' },
    })
    const activeTrips = await this.prisma.trip.findMany({
      where: { transporterId, status: { in: ['accepted', 'in_transit'] }, driverId: { not: null } },
      select: { driverId: true },
    })
    const busyCounts = new Map<string, number>()
    for (const t of activeTrips) {
      if (t.driverId) busyCounts.set(t.driverId, (busyCounts.get(t.driverId) ?? 0) + 1)
    }
    return {
      drivers: drivers.map((d) => ({
        id: d.id,
        name: d.name,
        mobile: d.mobile,
        licenseVerified: d.licenseVerified,
        payRate: d.payRate,
        activeTrips: busyCounts.get(d.id) ?? 0,
        free: (busyCounts.get(d.id) ?? 0) === 0,
      })),
    }
  }

  async create(input: CreateDriverInput, user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) throw new BadRequestException('Transporter profile not found')
    if (!input.name?.trim() || !input.mobile?.trim()) {
      throw new BadRequestException('name and mobile are required')
    }
    const driver = await this.prisma.driver.create({
      data: {
        transporterId,
        name: input.name.trim(),
        mobile: input.mobile.trim(),
        licenseKey: input.licenseKey,
      },
    })
    return { driver }
  }

  async update(id: string, input: Partial<CreateDriverInput>, user: User) {
    const transporterId = await this.transporterId(user)
    const driver = await this.prisma.driver.findFirst({ where: { id, transporterId } })
    if (!driver) throw new NotFoundException('Driver not found')
    const updated = await this.prisma.driver.update({
      where: { id },
      data: {
        name: input.name,
        mobile: input.mobile,
        licenseKey: input.licenseKey,
        status: input.status,
        payRate: input.payRate,
      },
    })
    return { driver: updated }
  }

  async remove(id: string, user: User) {
    const transporterId = await this.transporterId(user)
    const driver = await this.prisma.driver.findFirst({ where: { id, transporterId } })
    if (!driver) throw new NotFoundException('Driver not found')
    await this.prisma.driver.delete({ where: { id } })
    return { success: true }
  }

  /** Per-driver performance: trips, delivered, cancelled, on-time and earnings. */
  async performance(id: string, user: User) {
    const transporterId = await this.transporterId(user)
    const driver = await this.prisma.driver.findFirst({ where: { id, transporterId } })
    if (!driver) throw new NotFoundException('Driver not found')
    const trips = await this.prisma.trip.findMany({
      where: { driverId: driver.id },
      include: { load: true, booking: true },
      orderBy: { createdAt: 'desc' },
    })

    const delivered = trips.filter((t) => t.status === 'delivered')
    const cancelled = trips.filter((t) => t.status === 'cancelled')
    const inTransit = trips.filter((t) => t.status === 'in_transit')
    const onTime = delivered.filter((t) => t.startedAt && t.deliveredAt && t.deliveredAt.getTime() - t.startedAt.getTime() <= 72 * 3600000).length
    const earned = delivered.reduce((s, t) => s + this.driverPay(driver, t.booking?.rate ?? t.load.fareEstimate), 0)

    return {
      driver: { id: driver.id, name: driver.name, mobile: driver.mobile, payRate: driver.payRate, licenseVerified: driver.licenseVerified },
      summary: {
        trips: trips.length,
        delivered: delivered.length,
        cancelled: cancelled.length,
        inTransit: inTransit.length,
        onTime: onTime,
        onTimeRate: delivered.length ? Math.round((onTime / delivered.length) * 100) / 100 : 0,
        earned,
      },
    }
  }

  private driverPay(driver: { payRate: number | null }, fare: number) {
    if (driver.payRate != null && driver.payRate > 0) return driver.payRate
    return Math.round(fare * 0.25)
  }
}

export interface CreateDriverInput {
  name: string
  mobile: string
  licenseKey?: string
  status?: boolean
  payRate?: number | null
}
