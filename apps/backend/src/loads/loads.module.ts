import { Module } from '@nestjs/common'
import { LoadsController } from './loads.controller'
import { LoadsService } from './loads.service'
import { AlertsModule } from '../alerts/alerts.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [AlertsModule, NotificationsModule],
  controllers: [LoadsController],
  providers: [LoadsService],
  exports: [LoadsService],
})
export class LoadsModule {}
