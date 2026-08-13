import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PushService } from '../push/push.service'
import type { NotificationPreference } from '@prisma/client'

interface CreateNotificationInput {
  userId: string
  type: string
  title: string
  body: string
  data?: Record<string, unknown>
  /** Category used to look up the user's NotificationPreference toggle. */
  category?: string
}

// Maps notification categories to the boolean toggle fields on
// NotificationPreference. Categories not listed here (e.g. 'system', 'general')
// are never suppressed.
const CATEGORY_TO_PREF: Record<string, keyof Omit<NotificationPreference, 'id' | 'userId' | 'updatedAt'> | undefined> = {
  loads: 'loadAlerts',
  booking: 'booking',
  trips: 'trip',
  payments: 'payment',
  kyc: 'kyc',
  docs: 'docExpiry',
  promo: 'promo',
  chat: 'trip',
  market: 'market',
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async create(input: CreateNotificationInput) {
    const prefKey = CATEGORY_TO_PREF[input.category ?? 'general']
    if (prefKey) {
      const prefs = await this.prisma.notificationPreference.findUnique({
        where: { userId: input.userId },
      })
      // No pref row → default to enabled. Only skip when explicitly disabled.
      if (prefs && prefs[prefKey] === false) {
        return null
      }
    }
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
