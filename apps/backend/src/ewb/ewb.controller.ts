import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { EwbService } from './ewb.service'
import type { User } from '@prisma/client'

@Controller('ewb')
@UseGuards(JwtAuthGuard)
export class EwbController {
  constructor(private readonly ewb: EwbService) {}

  @Post('loads/:loadId')
  generate(@Param('loadId') loadId: string, @CurrentUser() user: User) {
    return this.ewb.generate(loadId, user)
  }

  @Post('loads/:loadId/generate')
  generateSub(@Param('loadId') loadId: string, @CurrentUser() user: User) {
    return this.ewb.generate(loadId, user)
  }

  @Post('loads/:loadId/cancel')
  cancel(@Param('loadId') loadId: string, @Body() body: { reason?: string }, @CurrentUser() user: User) {
    return this.ewb.cancel(loadId, body.reason, user)
  }

  @Post('loads/:loadId/extend')
  extend(@Param('loadId') loadId: string, @CurrentUser() user: User) {
    return this.ewb.extend(loadId, user)
  }

  @Get('loads/:loadId')
  status(@Param('loadId') loadId: string, @CurrentUser() user: User) {
    return this.ewb.status(loadId, user)
  }

  @Post('sweep-expired')
  sweepExpired(@CurrentUser() user: User) {
    return this.ewb.sweepExpired()
  }
}