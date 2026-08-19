import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { TradeDocumentsService } from './trade-documents.service'
import type { User } from '@prisma/client'

@Controller('trade-documents')
@UseGuards(JwtAuthGuard)
export class TradeDocumentsController {
  constructor(private readonly docs: TradeDocumentsService) {}

  @Post()
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.docs.create(body as never, user)
  }

  @Get()
  list(@Query('docType') docType: string | undefined, @Query('shipmentId') shipmentId: string | undefined, @Query('status') status: string | undefined, @CurrentUser() user: User) {
    return this.docs.list(user, { docType, shipmentId, status })
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: User) {
    return this.docs.get(id, user)
  }

  @Patch(':id/status')
  transition(@Param('id') id: string, @Body() body: { status: string }, @CurrentUser() user: User) {
    return this.docs.transition(id, body.status, user)
  }
}