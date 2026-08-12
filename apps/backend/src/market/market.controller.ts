import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { MarketService } from './market.service'
import type { User } from '@prisma/client'

@Controller('market')
@UseGuards(JwtAuthGuard)
export class MarketController {
  constructor(private readonly market: MarketService) {}

  // Lanes
  @Post('lanes')
  upsertLane(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.market.upsertLane(body as never, user)
  }

  @Get('lanes')
  lanes(@Query('origin') origin?: string, @Query('destination') destination?: string, @Query('mode') mode?: string) {
    return this.market.lanes({ origin, destination, mode })
  }

  // Listings (supply)
  @Post('listings')
  createListing(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.market.createListing(body as never, user)
  }

  @Get('listings')
  browseListings(@Query() query: Record<string, unknown>) {
    return this.market.browseListings(query as never)
  }

  @Get('listings/:id')
  listingDetail(@Param('id') id: string) {
    return this.market.listingDetail(id)
  }

  @Patch('listings/:id/status')
  setListingStatus(@Param('id') id: string, @Body() body: { status: string }, @CurrentUser() user: User) {
    return this.market.setListingStatus(id, body.status, user)
  }

  @Post('listings/from-facility/:facilityId')
  publishFromFacility(@Param('facilityId') facilityId: string, @CurrentUser() user: User) {
    return this.market.publishFromFacility(facilityId, user)
  }

  @Post('listings/from-consolidation/:consolidationId')
  publishFromConsolidation(@Param('consolidationId') consolidationId: string, @CurrentUser() user: User) {
    return this.market.publishFromConsolidation(consolidationId, user)
  }

  // Requests (demand) + Quotes
  @Post('requests')
  createRequest(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.market.createRequest(body as never, user)
  }

  @Post('listings/:id/request')
  requestFromListing(
    @Param('id') id: string,
    @Body() body: { capacityNeeded?: number; budget?: number; originRef?: string; destinationRef?: string; city?: string; description?: string },
    @CurrentUser() user: User,
  ) {
    return this.market.requestFromListing({ listingId: id, ...body }, user)
  }

  @Get('requests')
  browseRequests(@Query() query: Record<string, unknown>) {
    return this.market.browseRequests(query as never)
  }

  @Get('requests/mine')
  myRequests(@CurrentUser() user: User) {
    return this.market.myRequests(user)
  }

  @Post('requests/:id/quotes')
  submitQuote(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.market.submitQuote(id, body as never, user)
  }

  @Post('quotes/:id/accept')
  acceptQuote(@Param('id') id: string, @CurrentUser() user: User) {
    return this.market.acceptQuote(id, user)
  }

  @Get('requests/:id/quotes')
  quotesFor(@Param('id') id: string, @CurrentUser() user: User) {
    return this.market.quotesFor(id, user)
  }

  @Get('requests/:id/match')
  matchRequest(@Param('id') id: string, @CurrentUser() user: User) {
    return this.market.matchRequest(id, user)
  }

  // Reputation
  @Post('ratings')
  rateOrg(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.market.rateOrg(body as never, user)
  }

  @Get('ratings/:orgId')
  orgRatings(@Param('orgId') orgId: string, @Query('axis') axis?: string) {
    return this.market.orgAverageRating(orgId, axis)
  }

  @Get('trust/:orgId')
  orgTrust(@Param('orgId') orgId: string) {
    return this.market.orgTrust(orgId)
  }

  @Get('partners')
  browsePartners() {
    return this.market.browsePartners()
  }

  // Carrier schedules
  @Post('carrier-services')
  createCarrierService(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.market.createCarrierService(body as never, user)
  }

  @Get('carrier-services')
  browseCarrierServices(@Query() query: Record<string, unknown>) {
    return this.market.browseCarrierServices(query as never)
  }

  @Post('carrier-services/:id/book')
  bookCarrierService(@Param('id') id: string, @CurrentUser() user: User) {
    return this.market.bookCarrierService(id, user)
  }
}
