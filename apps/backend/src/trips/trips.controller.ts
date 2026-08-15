import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  Get,
  UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Roles } from '../auth/guards/roles.decorator'
import { ActionVerifiedGuard } from '../auth/guards/action-verified.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { TripsService } from './trips.service'
import type { User } from '@prisma/client'

@Controller('trips')
@UseGuards(JwtAuthGuard)
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Post('quotes')
  @Roles('transporter')
  quote(@Body() body: { loadId: string; amount: number }, @CurrentUser() user: User) {
    return this.trips.quote(body.loadId, body.amount, user)
  }

  @Post('accept')
  @Roles('transporter')
  @UseGuards(ActionVerifiedGuard('accept_load'))
  accept(@Body() body: { loadId: string }, @CurrentUser() user: User) {
    return this.trips.accept(body.loadId, user)
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: 'in_transit' | 'delivered' },
    @CurrentUser() user: User,
  ) {
    return this.trips.updateStatus(id, body.status, user)
  }

  @Post(':id/advance')
  @Roles('transporter', 'driver')
  advance(@Param('id') id: string, @CurrentUser() user: User) {
    return this.trips.advanceStage(id, user)
  }

  @Post(':id/cancel')
  @Roles('transporter', 'supplier')
  cancelTrip(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentUser() user: User,
  ) {
    return this.trips.cancelTrip(id, body.reason, user)
  }

  @Post(':id/otp/:kind')
  @Roles('transporter', 'driver')
  generateOtp(@Param('id') id: string, @Param('kind') kind: 'pickup' | 'delivery', @CurrentUser() user: User) {
    return this.trips.generateOtp(id, kind, user)
  }

  @Post(':id/otp/:kind/verify')
  @Roles('supplier')
  verifyOtp(
    @Param('id') id: string,
    @Param('kind') kind: 'pickup' | 'delivery',
    @Body() body: { code: string },
    @CurrentUser() user: User,
  ) {
    return this.trips.verifyOtp(id, kind, body.code, user)
  }

  @Get('mine')
  myTrips(@CurrentUser() user: User) {
    return this.trips.forUser(user)
  }
}
