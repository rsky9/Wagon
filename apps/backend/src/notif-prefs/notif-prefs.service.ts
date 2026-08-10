import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

@Injectable()
export class NotifPrefsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: User) {
    const prefs = await this.prisma.notificationPreference.findUnique({ where: { userId: user.id } })
    return {
      prefs: prefs ?? {
        loadAlerts: true,
        booking: true,
        trip: true,
        payment: true,
        kyc: true,
        docExpiry: true,
        promo: false,
      },
    }
  }

  async update(user: User, input: Partial<PrefsInput>) {
    const prefs = await this.prisma.notificationPreference.upsert({
      where: { userId: user.id },
      update: input,
      create: { userId: user.id, ...input },
    })
    return { prefs }
  }
}

export interface PrefsInput {
  loadAlerts?: boolean
  booking?: boolean
  trip?: boolean
  payment?: boolean
  kyc?: boolean
  docExpiry?: boolean
  promo?: boolean
}
