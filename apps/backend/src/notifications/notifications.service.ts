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
    if (data?.shipmentId) return `wagon://shipment/${data.shipmentId}`
    if (data?.ticketId) return `wagon://tickets`
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
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ])
    return { items, unread }
  }

  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    })
  }

  /** Unread count for the notifications badge. */
  async unreadCount(userId: string) {
    const unread = await this.prisma.notification.count({ where: { userId, isRead: false } })
    return { unread }
  }

  /** Mark every notification for the user as read. */
  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    })
    return { updated: result.count }
  }

  /** Paginated notification list with an unread count. */
  async list(userId: string, limit = 50, offset = 0) {
    const [items, unread, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(limit, 1), 200),
        skip: Math.max(offset, 0),
      }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
      this.prisma.notification.count({ where: { userId } }),
    ])
    return { items, unread, total, limit, offset }
  }

  /** Set a single notification read/unread. */
  async setRead(id: string, userId: string, read: boolean) {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: read },
    })
    return { updated: result.count }
  }

  /** Read the user's notification preferences (create default row on first read). */
  async getPreferences(userId: string) {
    const prefs = await this.prisma.notificationPreference.upsert({
      where: { userId },
      update: {},
      create: { userId },
    })
    return { preferences: prefs }
  }

  /** Update notification preferences (only the toggles passed are changed). */
  async updatePreferences(userId: string, patch: Record<string, boolean>) {
    const allowed: Array<keyof Omit<NotificationPreference, 'id' | 'userId' | 'updatedAt'>> = [
      'loadAlerts', 'booking', 'trip', 'payment', 'kyc', 'docExpiry', 'promo', 'market',
    ]
    const data: Record<string, boolean> = {}
    for (const key of allowed) {
      if (typeof patch[key] === 'boolean') data[key] = patch[key]
    }
    if (Object.keys(data).length === 0) {
      return this.getPreferences(userId)
    }
    const prefs = await this.prisma.notificationPreference.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    })
    return { preferences: prefs }
  }
}
