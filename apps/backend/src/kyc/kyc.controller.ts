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

  /** The doc kinds this user's role must verify (identity, financial, operational). */
  @Get('requirements')
  requirements(@CurrentUser() user: User) {
    return this.kyc.requirements(user)
  }

  /** Whether the user's required docs are all approved. */
  @Get('status')
  status(@CurrentUser() user: User) {
    return this.kyc.requirementsMet(user)
  }

  @Post('upload')
  requestUpload(
    @Body() body: { kind: string; mimeType: string; size: number },
    @CurrentUser() user: User,
  ) {
    return this.kyc.requestUpload(body.kind, body.mimeType, body.size, user)
  }

  /** Run provider verification (Setu/face/Vahan) for an uploaded document. */
  @Post('verify')
  verify(
    @Body() body: { kind: string; [k: string]: string },
    @CurrentUser() user: User,
  ) {
    return this.kyc.verify(body.kind, body, user)
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
