import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { FinanceService } from './finance.service'
import type { User } from '@prisma/client'

@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Post('claims')
  fileClaim(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.finance.fileClaim(body as never, user)
  }

  @Post('claims/:id/assess')
  assessClaim(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.finance.assessClaim(id, body as never, user)
  }

  @Post('claims/:id/decide')
  decideClaim(@Param('id') id: string, @Body() body: { decision: 'approved' | 'rejected'; notes?: string }, @CurrentUser() user: User) {
    return this.finance.decideClaim(id, body.decision, body.notes, user)
  }

  @Get('claims')
  listClaims(@Query('status') status: string | undefined, @CurrentUser() user: User) {
    return this.finance.listClaims(user, status)
  }

  @Post('policies')
  issuePolicy(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.finance.issuePolicy(body as never, user)
  }

  @Get('policies')
  listPolicies(@CurrentUser() user: User) {
    return this.finance.listPolicies(user)
  }

  @Post('policies/:id/expire')
  expirePolicy(@Param('id') id: string, @CurrentUser() user: User) {
    return this.finance.expirePolicy(id, user)
  }

  @Post('policies/:id/claim')
  markPolicyClaimed(@Param('id') id: string, @CurrentUser() user: User) {
    return this.finance.markPolicyClaimed(id, user)
  }

  @Post('settlements')
  createSettlement(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.finance.createSettlement(body as never, user)
  }

  @Post('settlements/:id/clear')
  clearSettlement(@Param('id') id: string, @CurrentUser() user: User) {
    return this.finance.clearSettlement(id, user)
  }

  @Get('settlements')
  listSettlements(@Query('status') status: string | undefined, @CurrentUser() user: User) {
    return this.finance.listSettlements(user, status)
  }

  @Post('risk/:shipmentId/assess')
  assessRisk(@Param('shipmentId') shipmentId: string, @CurrentUser() user: User) {
    return this.finance.assessRisk(shipmentId, user)
  }

  @Post('plans/:id/cover-quote')
  quotePlanCover(@Param('id') id: string, @Body() body: { declaredValue: number; currency?: string }, @CurrentUser() user: User) {
    return this.finance.quotePlanCover(id, body, user)
  }

  @Post('plans/:id/cover-accept')
  acceptPlanCover(@Param('id') id: string, @Body() body: { declaredValue: number; policyRef: string; currency?: string }, @CurrentUser() user: User) {
    return this.finance.acceptPlanCover(id, body, user)
  }

  @Get('shipments/:shipmentId/summary')
  summary(@Param('shipmentId') shipmentId: string, @CurrentUser() user: User) {
    return this.finance.summary(shipmentId, user)
  }
}
