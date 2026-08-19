import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { ContractsService } from './contracts.service'
import type { User } from '@prisma/client'

@Controller('contracts')
@UseGuards(JwtAuthGuard)
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Post()
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.contracts.create(body as never, user)
  }

  @Get()
  list(@Query('status') status: string | undefined, @Query('type') type: string | undefined, @CurrentUser() user: User) {
    return this.contracts.list(user, { status, type })
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: User) {
    return this.contracts.get(id, user)
  }

  @Patch(':id/status')
  transition(@Param('id') id: string, @Body() body: { status: string }, @CurrentUser() user: User) {
    return this.contracts.transition(id, body.status, user)
  }

  @Post(':id/rate-card')
  attachRateCard(@Param('id') id: string, @Body() body: { rateCardId: string }, @CurrentUser() user: User) {
    return this.contracts.attachRateCard(id, body.rateCardId, user)
  }
}