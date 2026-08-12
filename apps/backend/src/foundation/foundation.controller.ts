import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
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

  @Post('organizations/:id/members')
  addMember(@Param('id') id: string, @Body() body: { mobile?: string; role?: string }, @CurrentUser() user: User) {
    return this.foundation.addMember(id, body.mobile ?? '', body.role, user)
  }

  // Shipments
  @Post('shipments')
  createShipment(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.foundation.createShipment(body as never, user)
  }

  @Get('shipments')
  listShipments(@CurrentUser() user: User) {
    return this.foundation.listShipments(user)
  }

  @Get('shipments/:id')
  shipmentDetail(@Param('id') id: string, @CurrentUser() user: User) {
    return this.foundation.shipmentDetail(id, user)
  }

  @Post('shipments/:id/legs')
  addLeg(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.foundation.addLeg(id, body as never, user)
  }

  // Events
  @Get('events')
  events(@Query('entityType') entityType?: string, @Query('entityId') entityId?: string, @Query('shipmentId') shipmentId?: string) {
    return this.foundation.events({ entityType, entityId, shipmentId })
  }
}
