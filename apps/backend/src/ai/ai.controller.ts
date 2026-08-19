import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { AiService, PlanConstraints, PlanOption } from './ai.service'
import { TripHealthService } from './trip-health.service'
import type { User } from '@prisma/client'

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly tripHealth: TripHealthService,
  ) {}

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

  @Post('market/:requestId')
  recommendMarket(@Param('requestId') requestId: string, @CurrentUser() user: User) {
    return this.ai.recommendMarket(requestId, user)
  }

  @Post('carrier')
  recommendCarrier(@Body() body: { originRef: string; destinationRef: string; mode?: string }, @CurrentUser() user: User) {
    return this.ai.recommendCarrier(body, user)
  }

  @Post('risk/:shipmentId')
  assessRisk(@Param('shipmentId') shipmentId: string, @CurrentUser() user: User) {
    return this.ai.assessRisk(shipmentId, user)
  }

  @Post('trip-health/:tripId')
  assessTripHealth(@Param('tripId') tripId: string, @CurrentUser() user: User) {
    return this.tripHealth.assess(tripId, user)
  }

  @Post('draft-document')
  draftDocument(@Body() body: { shipmentId: string; docType: 'packing_list' | 'commercial_invoice' | 'bol'; currency?: string }, @CurrentUser() user: User) {
    return this.ai.draftDocument(body, user)
  }

  @Post('eta/:shipmentId')
  etaIntelligence(@Param('shipmentId') shipmentId: string, @CurrentUser() user: User) {
    return this.ai.etaIntelligence(shipmentId, user)
  }

  @Post('exceptions/scan')
  runExceptionScan(@CurrentUser() user: User) {
    return this.ai.runExceptionScan(user)
  }

  @Get('exceptions/feed')
  exceptionFeed(@Query('status') status: string | undefined, @CurrentUser() user: User) {
    return this.ai.exceptionFeed(user, status)
  }

  @Post('exceptions/:shipmentId')
  detectExceptions(@Param('shipmentId') shipmentId: string, @CurrentUser() user: User) {
    return this.ai.detectExceptions(shipmentId, user)
  }

  @Post('invite/:loadId/:transporterId')
  inviteTransporter(@Param('loadId') loadId: string, @Param('transporterId') transporterId: string, @CurrentUser() user: User) {
    return this.ai.inviteTransporter(loadId, transporterId, user)
  }

  @Patch('recommendations/:id/status')
  setRecommendationStatus(@Param('id') id: string, @Body() body: { status: 'accepted' | 'dismissed' }, @CurrentUser() user: User) {
    return this.ai.setRecommendationStatus(id, body.status, user)
  }

  @Get('recommendations')
  list(
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
    @Query('agent') agent: string | undefined,
    @Query('status') status: string | undefined,
    @CurrentUser() user: User,
  ) {
    return this.ai.list(entityType, entityId, user, agent, status)
  }

  @Get('recommendations/mine')
  myRecommendations(@Query('agent') agent: string | undefined, @Query('status') status: string | undefined, @CurrentUser() user: User) {
    return this.ai.myRecommendations(user, agent, status)
  }
}
