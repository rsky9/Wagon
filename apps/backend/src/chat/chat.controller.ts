import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { ChatService } from './chat.service'
import type { User } from '@prisma/client'

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('threads')
  threads(@CurrentUser() user: User) {
    return this.chat.threads(user)
  }

  @Get('trip/:tripId')
  list(@Param('tripId') tripId: string, @CurrentUser() user: User) {
    return this.chat.list(tripId, user)
  }

  @Post('trip/:tripId')
  send(@Param('tripId') tripId: string, @Body() body: { body: string }, @CurrentUser() user: User) {
    return this.chat.send(tripId, body.body, user)
  }
}
