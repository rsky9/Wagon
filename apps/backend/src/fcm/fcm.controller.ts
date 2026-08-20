import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { FcmService } from './fcm.service'
import type { User } from '@prisma/client'

@Controller('fcm')
@UseGuards(JwtAuthGuard)
export class FcmController {
  constructor(private readonly fcm: FcmService) {}

  @Post('register')
  register(
    @Body() body: { token: string; deviceId?: string; platform?: string },
    @CurrentUser() user: User,
  ) {
    return this.fcm.register(user, body.token, body.deviceId, body.platform)
  }

  @Post('unregister')
  unregister(
    @Body() body: { token: string },
    @CurrentUser() user: User,
  ) {
    return this.fcm.unregister(user, body.token)
  }
}
