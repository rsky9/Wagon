import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Roles } from '../auth/guards/roles.decorator'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { KycService } from './kyc.service'
import type { User } from '@prisma/client'

@Controller('kyc')
@UseGuards(JwtAuthGuard)
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Post('upload')
  requestUpload(
    @Body() body: { kind: string; mimeType: string; size: number },
    @CurrentUser() user: User,
  ) {
    return this.kyc.requestUpload(body.kind, body.mimeType, body.size, user)
  }

  @Post('pod/:tripId')
  @Roles('transporter')
  requestPodUpload(
    @Param('tripId') tripId: string,
    @Body() body: { mimeType: string; size: number },
    @CurrentUser() user: User,
  ) {
    return this.kyc.requestPodUpload(tripId, body.mimeType, body.size, user)
  }

  @Get('mine')
  mine(@CurrentUser() user: User) {
    return this.kyc.listForUser(user)
  }
}
