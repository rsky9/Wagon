import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { NotifPrefsService } from './notif-prefs.service'
import { UpdatePrefsDto } from './notif-prefs.dto'
import type { User } from '@prisma/client'

@Controller('notification-preferences')
@UseGuards(JwtAuthGuard)
export class NotifPrefsController {
  constructor(private readonly prefs: NotifPrefsService) {}

  @Get()
  get(@CurrentUser() user: User) {
    return this.prefs.get(user)
  }

  @Patch()
  update(@Body() body: UpdatePrefsDto, @CurrentUser() user: User) {
    return this.prefs.update(user, body)
  }
}
