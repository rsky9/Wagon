import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { TrustService } from './trust.service'
import { ReportDto } from './trust.dto'
import type { User } from '@prisma/client'

@Controller('trust')
@UseGuards(JwtAuthGuard)
export class TrustController {
  constructor(private readonly trust: TrustService) {}

  @Post('report')
  report(@Body() body: ReportDto, @CurrentUser() user: User) {
    return this.trust.report(body, user)
  }

  @Post('block')
  block(@Body() body: { blockedId: string }, @CurrentUser() user: User) {
    return this.trust.block(body, user)
  }

  @Get('blocks')
  myBlocks(@CurrentUser() user: User) {
    return this.trust.myBlocks(user)
  }

  @Post('masked-number')
  masked(@Body() body: { targetUserId: string }, @CurrentUser() user: User) {
    return this.trust.maskedNumber(body.targetUserId, user)
  }
}
