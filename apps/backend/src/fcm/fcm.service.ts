import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { User } from '@prisma/client'

@Injectable()
export class FcmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async register(user: User, token: string, deviceId?: string, platform?: string) {
    if (!token?.trim()) throw new BadRequestException('token required')
    const record = await this.prisma.fcmToken.upsert({
      where: { userId_token: { userId: user.id, token: token.trim() } },
      update: { deviceId, platform: platform ?? 'android' },
      create: {
        userId: user.id,
        token: token.trim(),
        deviceId,
        platform: platform ?? 'android',
      },
    })
    await this.audit.log({ actorId: user.id, action: 'fcm.register', resource: record.id, after: { platform: record.platform } })
    return record
  }

  async unregister(user: User, token: string) {
    if (!token?.trim()) throw new BadRequestException('token required')
    await this.prisma.fcmToken.deleteMany({
      where: { userId: user.id, token: token.trim() },
    })
    await this.audit.log({ actorId: user.id, action: 'fcm.unregister', resource: token.trim() })
    return { ok: true }
  }

  async userTokens(userId: string) {
    return this.prisma.fcmToken.findMany({
      where: { userId },
    })
  }
}
