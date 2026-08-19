import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { ReturnsService } from './returns.service'
import type { User } from '@prisma/client'

@Controller('returns')
@UseGuards(JwtAuthGuard)
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Post()
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.returns.create(body as never, user)
  }

  @Get()
  list(@Query('status') status: string | undefined, @Query('reason') reason: string | undefined, @CurrentUser() user: User) {
    return this.returns.list(user, { status, reason })
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: User) {
    return this.returns.get(id, user)
  }

  @Patch(':id/status')
  transition(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    const { status, ...rest } = body as { status: string }
    return this.returns.transition(id, status, rest, user)
  }
}