import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Roles } from '../auth/guards/roles.decorator'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { DisputesService } from './disputes.service'
import { RaiseDto } from './disputes.dto'
import type { User } from '@prisma/client'

@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  raise(@Body() body: RaiseDto, @CurrentUser() user: User) {
    return this.disputes.raise(body.tripId, body.subject, body.evidenceKeys, user, body.issueType)
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: User) {
    return this.disputes.listForUser(user)
  }

  @Get('open')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  open() {
    return this.disputes.listOpen()
  }

  @Patch(':id/resolve')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  resolve(@Param('id') id: string, @Body() body: { resolution: string }, @CurrentUser() user: User) {
    return this.disputes.resolve(id, body.resolution, user)
  }
}
