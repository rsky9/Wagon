import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { FoundationService } from './foundation.service'
import type { User } from '@prisma/client'

@Controller('foundation')
@UseGuards(JwtAuthGuard)
export class FoundationController {
  constructor(private readonly foundation: FoundationService) {}

  // Organizations
  @Post('organizations')
  createOrg(@Body() body: { name: string; kind: string; countryCode?: string }, @CurrentUser() user: User) {
    return this.foundation.createOrganization(body.name, body.kind, user, body.countryCode)
  }

  @Get('organizations')
  myOrgs(@CurrentUser() user: User) {
    return this.foundation.myOrganizations(user)
  }

  @Get('organizations/:id')
  orgDetail(@Param('id') id: string, @CurrentUser() user: User) {
    return this.foundation.organizationDetail(id, user)
  }

  @Patch('organizations/:id')
  updateOrg(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.foundation.updateOrganization(id, body as never, user)
  }

  @Get('organizations/:id/members')
  listMembers(@Param('id') id: string, @CurrentUser() user: User) {
    return this.foundation.listMembers(id, user)
  }

  @Post('organizations/:id/members')
  addMember(@Param('id') id: string, @Body() body: { mobile?: string; role?: string }, @CurrentUser() user: User) {
    return this.foundation.addMember(id, body.mobile as string, body.role, user)
  }

  @Delete('organizations/:id/members/:userId')
  removeMember(@Param('id') id: string, @Param('userId') userId: string, @CurrentUser() user: User) {
    return this.foundation.removeMember(id, userId, user)
  }

  @Patch('organizations/:id/members/:userId')
  setMemberRole(@Param('id') id: string, @Param('userId') userId: string, @Body() body: { role: string }, @CurrentUser() user: User) {
    return this.foundation.setMemberRole(id, userId, body.role, user)
  }

  // Shipments
  @Post('shipments')
  createShipment(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.foundation.createShipment(body as never, user)
  }

  @Get('shipments')
  listShipments(@Query() query: Record<string, unknown>, @CurrentUser() user: User) {
    return this.foundation.listShipments(user, query as never)
  }

  @Get('shipments/:id')
  shipmentDetail(@Param('id') id: string, @CurrentUser() user: User) {
    return this.foundation.shipmentDetail(id, user)
  }

  @Patch('shipments/:id')
  updateShipment(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.foundation.updateShipment(id, body, user)
  }

  @Patch('shipments/:id/status')
  transitionShipment(@Param('id') id: string, @Body() body: { status: string }, @CurrentUser() user: User) {
    return this.foundation.transitionShipment(id, body.status, user)
  }

  @Post('shipments/:id/legs')
  addLeg(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.foundation.addLeg(id, body as never, user)
  }

  @Post('legs/:legId/transition')
  legTransition(@Param('legId') legId: string, @Body() body: { event: 'departed' | 'arrived' | 'failed'; reason?: string }, @CurrentUser() user: User) {
    return this.foundation.legTransition(legId, body.event, body.reason, user)
  }

  @Post('shipments/:id/cargo')
  createCargoUnit(
    @Param('id') id: string,
    @Body() body: { legId?: string; kind?: string; weightKg?: number; volumeM3?: number; pieces?: number; equipment?: string; ref?: string },
    @CurrentUser() user: User,
  ) {
    return this.foundation.createCargoUnit({ shipmentId: id, ...body }, user)
  }

  @Get('shipments/:id/cargo')
  listCargoUnits(@Param('id') id: string, @CurrentUser() user: User) {
    return this.foundation.listCargoUnits(id, user)
  }

  @Post('cargo/:id/split')
  splitCargoUnit(@Param('id') id: string, @Body() body: { parts: { weightKg?: number; volumeM3?: number; pieces?: number }[] }, @CurrentUser() user: User) {
    return this.foundation.splitCargoUnit(id, body.parts, user)
  }

  @Post('cargo/:id/merge')
  mergeCargoUnit(@Param('id') id: string, @Body() body: { parentId: string }, @CurrentUser() user: User) {
    return this.foundation.mergeCargoUnit(id, body.parentId, user)
  }

  @Patch('cargo/:id')
  updateCargoUnit(@Param('id') id: string, @Body() body: { status?: string; locationRef?: string }, @CurrentUser() user: User) {
    return this.foundation.updateCargoUnit(id, body, user)
  }

  @Post('cargo/:id/container')
  transitionContainer(@Param('id') id: string, @Body() body: { event: 'gated_in' | 'loaded' | 'discharged' | 'returned' }, @CurrentUser() user: User) {
    return this.foundation.transitionContainer(id, body.event, user)
  }

  // Events
  @Get('events')
  events(@Query('entityType') entityType: string | undefined, @Query('entityId') entityId: string | undefined, @Query('shipmentId') shipmentId: string | undefined, @CurrentUser() user: User) {
    return this.foundation.events(user, { entityType, entityId, shipmentId })
  }
}
