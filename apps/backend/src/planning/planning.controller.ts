import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { PlanningService, PlanInput } from './planning.service'
import type { User } from '@prisma/client'

@Controller('planning')
@UseGuards(JwtAuthGuard)
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}

  @Post('plans')
  propose(@Body() body: PlanInput, @CurrentUser() user: User) {
    return this.planning.propose(body, user)
  }

  @Post('plans/:id/select')
  select(@Param('id') id: string, @CurrentUser() user: User) {
    return this.planning.select(id, user)
  }

  @Post('plans/:id/replan')
  rePlan(
    @Param('id') id: string,
    @Body() body: { failedLegIndex: number; replacement: Record<string, unknown> },
    @CurrentUser() user: User,
  ) {
    return this.planning.rePlan(id, body.failedLegIndex, body.replacement as never, user)
  }

  @Get('shipments/:shipmentId/plans')
  list(@Param('shipmentId') shipmentId: string) {
    return this.planning.list(shipmentId)
  }
}
