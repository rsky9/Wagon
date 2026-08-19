import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { NotificationsService } from './notifications.service'
import type { User } from '@prisma/client'

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  mine(@Query('limit') limit: string | undefined, @Query('offset') offset: string | undefined, @CurrentUser() user: User) {
    return this.notifications.list(user.id, limit ? parseInt(limit, 10) : 50, offset ? parseInt(offset, 10) : 0)
  }

  @Get('count')
  count(@CurrentUser() user: User) {
    return this.notifications.unreadCount(user.id)
  }

  @Post('read-all')
  readAll(@CurrentUser() user: User) {
    return this.notifications.markAllRead(user.id)
  }

  @Get('preferences')
  preferences(@CurrentUser() user: User) {
    return this.notifications.getPreferences(user.id)
  }

  @Patch('preferences')
  updatePreferences(@Body() body: Record<string, boolean>, @CurrentUser() user: User) {
    return this.notifications.updatePreferences(user.id, body)
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: User) {
    return this.notifications.setRead(id, user.id, true)
  }

  @Patch(':id/unread')
  markUnread(@Param('id') id: string, @CurrentUser() user: User) {
    return this.notifications.setRead(id, user.id, false)
  }
}