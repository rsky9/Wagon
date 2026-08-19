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

  @Post('join')
  join(@Body() body: { transporterMobile: string }, @CurrentUser() user: User) {
    return this.driver.join(body.transporterMobile, user)
  }

  @Get('ledger')
  ledger(@CurrentUser() user: User) {
    return this.driver.ledger(user)
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

  @Patch('bank')
  setBank(@Body() body: { bankAccount: string; ifsc: string }, @CurrentUser() user: User) {
    return this.driver.setBank(body, user)
  }

  @Get('payouts')
  payoutStatus(@CurrentUser() user: User) {
    return this.driver.payoutStatus(user)
  }

  @Post('trips/:tripId/payout')
  releasePayout(@Param('tripId') tripId: string, @CurrentUser() user: User) {
    return this.driver.releasePayout(tripId, user)
  }

  @Post('trips/:tripId/pod')
  uploadPod(@Param('tripId') tripId: string, @Body() body: { podUrl: string }, @CurrentUser() user: User) {
    return this.driver.uploadPod(tripId, body.podUrl, user)
  }
}
