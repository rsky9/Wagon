import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

@Controller('fcm')
@UseGuards(JwtAuthGuard)
export class FcmController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('register')
  register(
    @Body() body: { token: string; deviceId?: string; platform?: string },
    @CurrentUser() user: User,
  ) {
    if (!body.token) {
      return { error: 'token required' }
    }
    return this.prisma.fcmToken.upsert({
      where: { userId_token: { userId: user.id, token: body.token } },
      update: { deviceId: body.deviceId, platform: body.platform ?? 'android' },
      create: {
        userId: user.id,
        token: body.token,
        deviceId: body.deviceId,
        platform: body.platform ?? 'android',
      },
    })
  }
}
