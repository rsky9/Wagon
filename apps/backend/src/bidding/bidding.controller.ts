import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ActionVerifiedGuard } from '../auth/guards/action-verified.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { BiddingService, type SubmitBidInput } from './bidding.service'
import type { User } from '@prisma/client'

@Controller('bidding')
@UseGuards(JwtAuthGuard)
export class BiddingController {
  constructor(private readonly bidding: BiddingService) {}

  @Post('bid')
  submitBid(@Body() body: SubmitBidInput, @CurrentUser() user: User) {
    return this.bidding.submitBid(body, user)
  }

  @Post('bid/:id/withdraw')
  withdrawBid(@Param('id') id: string, @CurrentUser() user: User) {
    return this.bidding.withdrawBid(id, user)
  }

  @Get('load/:loadId/decision-room')
  decisionRoom(@Param('loadId') loadId: string, @CurrentUser() user: User) {
    return this.bidding.decisionRoom(loadId, user)
  }

  @Post('bid/:id/shortlist')
  shortlist(@Param('id') id: string, @CurrentUser() user: User) {
    return this.bidding.shortlist(id, user)
  }

  @Post('bid/:id/reject')
  rejectBid(@Param('id') id: string, @CurrentUser() user: User) {
    return this.bidding.rejectBid(id, user)
  }

  @Post('bid/:id/counter')
  counterOffer(
    @Param('id') id: string,
    @Body() body: { amount: number; conditions?: string },
    @CurrentUser() user: User,
  ) {
    return this.bidding.counterOffer(id, body.amount, body.conditions, user)
  }

  @Post('offer/:id/respond')
  respondToCounter(
    @Param('id') id: string,
    @Body() body: { action: 'accept' | 'reject' | 'counter'; amount?: number; conditions?: string },
    @CurrentUser() user: User,
  ) {
    return this.bidding.respondToCounter(id, body.action, body.amount, user, body.conditions)
  }

  @Post('load/:loadId/confirm')
  confirmBooking(
    @Param('loadId') loadId: string,
    @Body() body: { bidId: string },
    @CurrentUser() user: User,
  ) {
    return this.bidding.confirmBooking(loadId, body.bidId, user)
  }

  @Post('load/:loadId/confirm/transporter')
  @UseGuards(ActionVerifiedGuard('confirm_booking'))
  transporterConfirm(
    @Param('loadId') loadId: string,
    @Body() body: { bidId: string },
    @CurrentUser() user: User,
  ) {
    return this.bidding.transporterConfirm(loadId, body.bidId, user)
  }

  @Get('load/:loadId/timeline')
  negotiationTimeline(@Param('loadId') loadId: string, @CurrentUser() user: User) {
    return this.bidding.negotiationTimeline(loadId, user)
  }

  @Get('mine')
  myBids(@CurrentUser() user: User) {
    return this.bidding.myBids(user)
  }

  @Get('pending-bookings')
  myPendingBookings(@CurrentUser() user: User) {
    return this.bidding.myPendingBookings(user)
  }

  @Post('trip/:tripId/rate-supplier')
  rateSupplier(
    @Param('tripId') tripId: string,
    @Body() body: { score: number; review?: string },
    @CurrentUser() user: User,
  ) {
    return this.bidding.rateSupplier(tripId, body.score, body.review, user)
  }

  @Get('trip/:tripId/booking')
  bookingForTrip(@Param('tripId') tripId: string, @CurrentUser() user: User) {
    return this.bidding.bookingForTrip(tripId, user)
  }
}
