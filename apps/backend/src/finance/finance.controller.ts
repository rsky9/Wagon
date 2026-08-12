import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
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

  @Post('claims/:id/decide')
  decideClaim(@Param('id') id: string, @Body() body: { decision: 'approved' | 'rejected'; notes?: string }, @CurrentUser() user: User) {
    return this.finance.decideClaim(id, body.decision, body.notes, user)
  }

  @Post('policies')
  issuePolicy(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.finance.issuePolicy(body as never, user)
  }

  @Post('settlements')
  createSettlement(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.finance.createSettlement(body as never, user)
  }

  @Post('settlements/:id/clear')
  clearSettlement(@Param('id') id: string, @CurrentUser() user: User) {
    return this.finance.clearSettlement(id, user)
  }

  @Post('risk/:shipmentId/assess')
  assessRisk(@Param('shipmentId') shipmentId: string, @CurrentUser() user: User) {
    return this.finance.assessRisk(shipmentId, user)
  }

  @Get('shipments/:shipmentId/summary')
  summary(@Param('shipmentId') shipmentId: string) {
    return this.finance.summary(shipmentId)
  }
}
