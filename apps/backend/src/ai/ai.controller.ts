import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { AiService, PlanConstraints, PlanOption } from './ai.service'
import type { User } from '@prisma/client'

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('plan')
  recommendPlan(
    @Body() body: { shipmentId: string; options: PlanOption[]; constraints?: PlanConstraints },
    @CurrentUser() user: User,
  ) {
    return this.ai.recommendPlan(body, user)
  }

  @Post('match/:loadId')
  matchTransporters(@Param('loadId') loadId: string, @CurrentUser() user: User) {
    return this.ai.matchTransporters(loadId, user)
  }

  @Get('recommendations')
  list(@Query('entityType') entityType: string, @Query('entityId') entityId: string) {
    return this.ai.list(entityType, entityId)
  }
}
