import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Roles } from '../auth/guards/roles.decorator'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { LoadsService } from './loads.service'
import { CreateLoadDto, ListLoadsQuery } from './loads.dto'
import type { User } from '@prisma/client'

@Controller('loads')
@UseGuards(JwtAuthGuard)
export class LoadsController {
  constructor(private readonly loads: LoadsService) {}

  @Post()
  @Roles('supplier')
  create(@Body() body: CreateLoadDto, @CurrentUser() user: User) {
    return this.loads.create(body, user)
  }

  @Get()
  list(@Query() query: ListLoadsQuery, @CurrentUser() user: User) {
    return this.loads.list(query, user)
  }

  @Get('responses/mine')
  @Roles('supplier')
  responses(@CurrentUser() user: User) {
    return this.loads.responses(user)
  }

  @Get('return/:tripId')
  @Roles('transporter')
  returnLoads(@Param('tripId') tripId: string, @CurrentUser() user: User) {
    return this.loads.returnLoads(tripId, user)
  }

  @Get('history/mine')
  @Roles('supplier')
  history(@CurrentUser() user: User) {
    return this.loads.history(user)
  }

  @Patch(':id/pause')
  @Roles('supplier')
  pause(@Param('id') id: string, @CurrentUser() user: User) {
    return this.loads.pause(id, user)
  }

  @Patch(':id/reopen')
  @Roles('supplier')
  reopen(@Param('id') id: string, @CurrentUser() user: User) {
    return this.loads.reopen(id, user)
  }

  @Patch(':id/cancel')
  @Roles('supplier')
  cancel(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() user: User) {
    return this.loads.cancel(id, body.reason, user)
  }

  @Patch(':id/complete')
  @Roles('supplier')
  complete(@Param('id') id: string, @CurrentUser() user: User) {
    return this.loads.complete(id, user)
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.loads.detail(id)
  }
}
