import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Roles } from '../auth/guards/roles.decorator'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { DriverService } from './driver.service'
import type { User } from '@prisma/client'

@Controller('driver')
@UseGuards(JwtAuthGuard)
@Roles('driver')
export class DriverController {
  constructor(private readonly driver: DriverService) {}

  @Get('home')
  home(@CurrentUser() user: User) {
    return this.driver.home(user)
  }

  @Get('trips')
  trips(@CurrentUser() user: User) {
    return this.driver.myTrips(user)
  }

  @Patch('availability')
  availability(@Body() body: { available: boolean }, @CurrentUser() user: User) {
    return this.driver.setAvailability(user, body.available)
  }

  @Get('earnings')
  earnings(@CurrentUser() user: User) {
    return this.driver.earnings(user)
  }

  @Post('trips/:tripId/pod')
  uploadPod(@Param('tripId') tripId: string, @Body() body: { podUrl: string }, @CurrentUser() user: User) {
    return this.driver.uploadPod(tripId, body.podUrl, user)
  }
}
