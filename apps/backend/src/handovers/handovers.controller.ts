import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { HandoversService } from './handovers.service'
import type { User } from '@prisma/client'

@Controller('handovers')
@UseGuards(JwtAuthGuard)
export class HandoversController {
  constructor(private readonly handovers: HandoversService) {}

  @Post()
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.handovers.create(body as never, user)
  }

  @Get()
  list(@Query('entityType') entityType: string | undefined, @Query('status') status: string | undefined, @CurrentUser() user: User) {
    return this.handovers.list(user, { entityType, status })
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: User) {
    return this.handovers.get(id, user)
  }

  @Patch(':id/status')
  transition(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    const { status, ...rest } = body as { status: string }
    return this.handovers.transition(id, status, rest, user)
  }
}