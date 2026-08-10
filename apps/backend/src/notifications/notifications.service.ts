import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'

interface CreateNotificationInput {
  userId: string
  type: string
  title: string
  body: string
  data?: Record<string, unknown>
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async create(input: CreateNotificationInput) {
    const data = {
      ...(input.data ?? {}),
      route: this.deepLink(input.type, input.data),
    }
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        data: (data as object) ?? undefined,
      },
    })
    // Fire-and-forget push delivery.
    void this.push.send({ ...input, data }).catch(() => undefined)
    return notification
  }

  /** Deep link for FCM taps: notification -> load/trip screen. */
  private deepLink(type: string, data?: Record<string, unknown>) {
    if (data?.tripId) return `wagon://trip/${data.tripId}`
    if (data?.loadId) return `wagon://load/${data.loadId}`
    switch (type) {
      case 'lane_match':
      case 'order_accepted':
        return `wagon://loads`
      case 'trip_started':
      case 'trip_delivered':
        return `wagon://trips`
      default:
        return `wagon://notifications`
    }
  }

  async forUser(userId: string) {
    const items = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const unread = items.filter((n) => !n.isRead).length
    return { items, unread }
  }

  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    })
  }
}
