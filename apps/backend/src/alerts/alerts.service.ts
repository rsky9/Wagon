import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import type { User } from '@prisma/client'

@Injectable()
export class AlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(fromLane: string, truckType: string | undefined, user: User) {
    if (!fromLane || fromLane.trim().length === 0) {
      throw new BadRequestException('fromLane is required')
    }
    const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    if (!transporter) {
      throw new BadRequestException('Transporter profile not found')
    }
    const alert = await this.prisma.laneAlert.create({
      data: {
        transporterId: transporter.id,
        fromLane: fromLane.trim(),
        truckType: truckType ?? null,
      },
    })
    return { alert }
  }

  async mine(user: User) {
    const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    if (!transporter) {
      return { alerts: [] }
    }
    const alerts = await this.prisma.laneAlert.findMany({
      where: { transporterId: transporter.id, isActive: true },
      orderBy: { createdAt: 'desc' },
    })
    return { alerts }
  }

  async toggle(id: string, user: User) {
    const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    if (!transporter) {
      throw new BadRequestException('Transporter profile not found')
    }
    const alert = await this.prisma.laneAlert.findFirst({
      where: { id, transporterId: transporter.id },
    })
    if (!alert) {
      throw new BadRequestException('Alert not found')
    }
    return this.prisma.laneAlert.update({
      where: { id },
      data: { isActive: !alert.isActive },
    })
  }

  /** Called after a new load is posted — notify transporters with matching lane alerts. */
  async notifyForLoad(load: { pickupAddr: string; truckType: string }) {
    const alerts = await this.prisma.laneAlert.findMany({
      where: { isActive: true },
      include: { transporter: true },
    })

    const pickupLower = load.pickupAddr.toLowerCase()
    const matching = alerts.filter((a) => {
      if (a.truckType && a.truckType !== load.truckType) return false
      return pickupLower.includes(a.fromLane.toLowerCase()) || a.fromLane.toLowerCase().includes(pickupLower.split(',')[0]?.trim() ?? '')
    })

    for (const alert of matching) {
      await this.notifications.create({
        userId: alert.transporter.userId,
        type: 'lane_match',
        title: 'New load on your lane',
        body: `A ${load.truckType} load from ${load.pickupAddr} matches your saved lane`,
        data: { fromLane: alert.fromLane },
        category: 'loads',
      })
    }
  }
}
