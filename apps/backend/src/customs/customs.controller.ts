import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { CustomsService } from './customs.service'
import type { User } from '@prisma/client'

@Controller('customs')
@UseGuards(JwtAuthGuard)
export class CustomsController {
  constructor(private readonly customs: CustomsService) {}

  @Post()
  create(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.customs.create(body as never, user)
  }

  @Get()
  list(@Query('direction') direction: string | undefined, @Query('status') status: string | undefined, @CurrentUser() user: User) {
    return this.customs.list(user, { direction, status })
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: User) {
    return this.customs.get(id, user)
  }

  @Patch(':id/status')
  transition(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    const { status, ...rest } = body as { status: string }
    return this.customs.transition(id, status, rest, user)
  }
}