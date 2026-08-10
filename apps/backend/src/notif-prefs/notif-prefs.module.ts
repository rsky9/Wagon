import { Module } from '@nestjs/common'
import { NotifPrefsController } from './notif-prefs.controller'
import { NotifPrefsService } from './notif-prefs.service'

@Module({
  controllers: [NotifPrefsController],
  providers: [NotifPrefsService],
})
export class NotifPrefsModule {}
