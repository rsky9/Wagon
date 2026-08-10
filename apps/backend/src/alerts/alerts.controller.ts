import { Body, Controller, Get, Patch, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Roles } from '../auth/guards/roles.decorator'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { AlertsService } from './alerts.service'
import type { User } from '@prisma/client'

@Controller('alerts')
@UseGuards(JwtAuthGuard)
@Roles('transporter')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Post()
  create(@Body() body: { fromLane: string; truckType?: string }, @CurrentUser() user: User) {
    return this.alerts.create(body.fromLane, body.truckType, user)
  }

  @Get('mine')
  mine(@CurrentUser() user: User) {
    return this.alerts.mine(user)
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string, @CurrentUser() user: User) {
    return this.alerts.toggle(id, user)
  }
}
