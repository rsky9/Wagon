import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { SupportService } from './support.service'
import type { User } from '@prisma/client'

@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('tickets')
  create(@Body() body: { subject: string; category?: string; message: string; priority?: string }, @CurrentUser() user: User) {
    return this.support.create(body, user)
  }

  @Get('tickets')
  mine(@CurrentUser() user: User) {
    return this.support.mine(user)
  }

  @Get('tickets/:id')
  thread(@Param('id') id: string, @CurrentUser() user: User) {
    return this.support.thread(id, user)
  }

  @Post('tickets/:id/messages')
  addMessage(@Param('id') id: string, @Body() body: { body: string }, @CurrentUser() user: User) {
    return this.support.addMessage(id, body.body, user)
  }

  @Post('tickets/:id/close')
  close(@Param('id') id: string, @CurrentUser() user: User) {
    return this.support.close(id, user)
  }

  @Post('tickets/:id/reopen')
  reopen(@Param('id') id: string, @CurrentUser() user: User) {
    return this.support.reopen(id, user)
  }

  // Admin
  @Get('admin/tickets')
  listAll(@Query('status') status: string | undefined, @CurrentUser() user: User) {
    return this.support.listAll(status, user)
  }

  @Patch('tickets/:id/assign')
  assign(@Param('id') id: string, @Body() body: { assignedToId?: string | null }, @CurrentUser() user: User) {
    return this.support.assign(id, body.assignedToId ?? null, user)
  }

  @Patch('tickets/:id/priority')
  setPriority(@Param('id') id: string, @Body() body: { priority: string }, @CurrentUser() user: User) {
    return this.support.setPriority(id, body.priority, user)
  }

  @Post('tickets/:id/resolve')
  resolve(@Param('id') id: string, @Body() body: { resolution: string }, @CurrentUser() user: User) {
    return this.support.resolve(id, body.resolution, user)
  }
}