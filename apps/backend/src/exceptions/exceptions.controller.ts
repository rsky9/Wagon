import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { ExceptionsService } from './exceptions.service'
import type { User } from '@prisma/client'

@Controller('exceptions')
@UseGuards(JwtAuthGuard)
export class ExceptionsController {
  constructor(private readonly exceptions: ExceptionsService) {}

  @Post('trip/:tripId')
  report(
    @Param('tripId') tripId: string,
    @Body() body: { kind: string; title: string; notes?: string; photos?: string[] },
    @CurrentUser() user: User,
  ) {
    return this.exceptions.report(tripId, body.kind, body.title, body.notes, body.photos, user)
  }

  @Get('trip/:tripId')
  listForTrip(@Param('tripId') tripId: string, @CurrentUser() user: User) {
    return this.exceptions.listForTrip(tripId, user)
  }

  @Patch(':id/resolve')
  resolve(@Param('id') id: string, @CurrentUser() user: User) {
    return this.exceptions.resolve(id, user)
  }
}
