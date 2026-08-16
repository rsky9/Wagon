import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Roles } from '../auth/guards/roles.decorator'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { TrackingService } from './tracking.service'
import type { User } from '@prisma/client'

@Controller('tracking')
@UseGuards(JwtAuthGuard)
export class TrackingController {
  constructor(private readonly tracking: TrackingService) {}

  @Post(':tripId/location')
  @Roles('transporter')
  ingest(
    @Param('tripId') tripId: string,
    @Body() body: { lat: number; lng: number; speedKmh?: number; simulated?: boolean },
    @CurrentUser() user: User,
  ) {
    return this.tracking.ingest(tripId, body.lat, body.lng, body.speedKmh, user, body.simulated === true)
  }

  @Get(':tripId')
  history(@Param('tripId') tripId: string, @CurrentUser() user: User) {
    return this.tracking.history(tripId, user)
  }
}
