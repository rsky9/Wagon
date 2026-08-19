import { Controller, Get, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { AnalyticsService } from './analytics.service'
import type { User } from '@prisma/client'

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('ops')
  networkOps() {
    return this.analytics.networkOps()
  }

  @Get('org')
  orgSummary(@CurrentUser() user: User) {
    return this.analytics.orgSummary(user)
  }
}