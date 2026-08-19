import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { YardService } from './yard.service'
import type { User } from '@prisma/client'

@Controller('yard')
@UseGuards(JwtAuthGuard)
export class YardController {
  constructor(private readonly yard: YardService) {}

  @Post('docks')
  createDock(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.yard.createDock(body as never, user)
  }

  @Get('docks')
  listDocks(@Query('facilityId') facilityId: string | undefined, @Query('status') status: string | undefined, @CurrentUser() user: User) {
    return this.yard.listDocks(user, { facilityId, status })
  }

  @Post('appointments')
  createAppointment(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.yard.createAppointment(body as never, user)
  }

  @Get('appointments')
  listAppointments(@Query('facilityId') facilityId: string | undefined, @Query('status') status: string | undefined, @Query('date') date: string | undefined, @CurrentUser() user: User) {
    return this.yard.listAppointments(user, { facilityId, status, date })
  }

  @Get('appointments/:id')
  getAppointment(@Param('id') id: string, @CurrentUser() user: User) {
    return this.yard.getAppointment(id, user)
  }

  @Patch('appointments/:id/status')
  transition(@Param('id') id: string, @Body() body: { status: string }, @CurrentUser() user: User) {
    return this.yard.transition(id, body.status, user)
  }
}