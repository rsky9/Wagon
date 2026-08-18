import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { Type } from 'class-transformer'
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { MarketService } from './market.service'
import type { User } from '@prisma/client'

// Numeric query params must be transformed (class-transformer) — strings on an
// Int filter make Prisma throw. Mirrors ListLoadsQuery in loads.dto.ts.
class BrowseListingsQuery {
  @IsOptional() @IsString() kind?: string
  @IsOptional() @IsString() city?: string
  @IsOptional() @IsString() origin?: string
  @IsOptional() @IsString() destination?: string
  @IsOptional() @IsString() status?: string
  @IsOptional() @Type(() => Number) @IsNumber() lat?: number
  @IsOptional() @Type(() => Number) @IsNumber() lng?: number
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) radiusKm?: number
  @IsOptional() @IsString() q?: string
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minPrice?: number
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxPrice?: number
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minCapacity?: number
  @IsOptional() @IsIn(['newest', 'cheapest', 'priciest', 'capacity']) sort?: 'newest' | 'cheapest' | 'priciest' | 'capacity'
}

class BrowseRequestsQuery {
  @IsOptional() @IsString() kind?: string
  @IsOptional() @IsString() city?: string
  @IsOptional() @IsString() status?: string
  @IsOptional() @Type(() => Number) @IsNumber() lat?: number
  @IsOptional() @Type(() => Number) @IsNumber() lng?: number
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) radiusKm?: number
  @IsOptional() @IsString() q?: string
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minBudget?: number
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxBudget?: number
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minCapacity?: number
  @IsOptional() @IsIn(['newest', 'budgetLow', 'budgetHigh', 'capacity']) sort?: 'newest' | 'budgetLow' | 'budgetHigh' | 'capacity'
}

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

  @Get('for-you')
  forYou(@CurrentUser() user: User) {
    return this.market.forYou(user)
  }

  @Get('listings')
  browseListings(@Query() query: BrowseListingsQuery) {
    return this.market.browseListings(query as never)
  }

  @Get('listings/mine')
  myListings(@CurrentUser() user: User) {
    return this.market.myListings(user)
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
  browseRequests(@Query() query: BrowseRequestsQuery) {
    return this.market.browseRequests(query as never)
  }

  @Get('requests/mine')
  myRequests(@CurrentUser() user: User) {
    return this.market.myRequests(user)
  }

  @Get('quotes/mine')
  myQuotes(@CurrentUser() user: User) {
    return this.market.myQuotes(user)
  }

  @Get('requests/inbound')
  listingRequests(@CurrentUser() user: User) {
    return this.market.listingRequests(user)
  }

  @Post('requests/:id/quotes')
  submitQuote(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.market.submitQuote(id, body as never, user)
  }

  @Post('requests/:id/close')
  closeRequest(@Param('id') id: string, @CurrentUser() user: User) {
    return this.market.closeRequest(id, user)
  }

  @Post('quotes/:id/accept')
  acceptQuote(@Param('id') id: string, @CurrentUser() user: User) {
    return this.market.acceptQuote(id, user)
  }

  @Post('quotes/:id/withdraw')
  withdrawQuote(@Param('id') id: string, @CurrentUser() user: User) {
    return this.market.withdrawQuote(id, user)
  }

  @Post('quotes/:id/reject')
  rejectQuote(@Param('id') id: string, @CurrentUser() user: User) {
    return this.market.rejectQuote(id, user)
  }

  @Get('requests/:id/quotes')
  quotesFor(@Param('id') id: string, @CurrentUser() user: User) {
    return this.market.quotesFor(id, user)
  }

  @Get('requests/:id/match')
  matchRequest(@Param('id') id: string, @CurrentUser() user: User) {
    return this.market.matchRequest(id, user)
  }

  @Post('requests/:id/decompose')
  decompose(@Param('id') id: string, @Body() body: { legs: Array<{ origin: string; destination?: string; city?: string; mode?: string; kind?: string; capacityNeeded?: number }> }, @CurrentUser() user: User) {
    return this.market.decompose({ requestId: id, legs: body.legs }, user)
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
