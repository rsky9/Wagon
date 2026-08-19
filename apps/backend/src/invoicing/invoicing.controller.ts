import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { InvoicingService } from './invoicing.service'
import type { User } from '@prisma/client'

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicingController {
  constructor(private readonly invoicing: InvoicingService) {}

  @Post()
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.invoicing.create(body as never, user)
  }

  @Get()
  list(@Query('status') status: string | undefined, @Query('type') type: string | undefined, @CurrentUser() user: User) {
    return this.invoicing.list(user, { status, type })
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: User) {
    return this.invoicing.get(id, user)
  }

  @Patch(':id/status')
  transition(@Param('id') id: string, @Body() body: { status: string }, @CurrentUser() user: User) {
    return this.invoicing.transition(id, body.status, user)
  }

  @Get(':id/reconcile')
  reconcile(@Param('id') id: string, @CurrentUser() user: User) {
    return this.invoicing.reconcile(id, user)
  }

  @Post(':id/dispute')
  attachDispute(@Param('id') id: string, @Body() body: { disputeId: string }, @CurrentUser() user: User) {
    return this.invoicing.attachDispute(id, body.disputeId, user)
  }
}