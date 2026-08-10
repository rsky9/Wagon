import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { SupportService } from './support.service'
import type { User } from '@prisma/client'

@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('tickets')
  create(@Body() body: { subject: string; category?: string; message: string }, @CurrentUser() user: User) {
    return this.support.create(body, user)
  }

  @Get('tickets')
  mine(@CurrentUser() user: User) {
    return this.support.mine(user)
  }

  @Post('tickets/:id/close')
  close(@Param('id') id: string, @CurrentUser() user: User) {
    return this.support.close(id, user)
  }
}
