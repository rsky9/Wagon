import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { VisibilityService } from './visibility.service'
import type { User } from '@prisma/client'

@Controller('visibility')
@UseGuards(JwtAuthGuard)
export class VisibilityController {
  constructor(private readonly visibility: VisibilityService) {}

  @Get('shipments/:shipmentId')
  shipmentTimeline(@Param('shipmentId') shipmentId: string, @CurrentUser() user: User) {
    return this.visibility.shipmentTimeline(shipmentId, user)
  }

  @Get('containers/:containerId')
  containerTimeline(@Param('containerId') containerId: string, @CurrentUser() user: User) {
    return this.visibility.containerTimeline(containerId, user)
  }

  @Get('trips/:tripId')
  tripTimeline(@Param('tripId') tripId: string, @CurrentUser() user: User) {
    return this.visibility.tripTimeline(tripId, user)
  }
}