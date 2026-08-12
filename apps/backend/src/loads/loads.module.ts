import { Module } from '@nestjs/common'
import { LoadsController } from './loads.controller'
import { LoadsService } from './loads.service'
import { AlertsModule } from '../alerts/alerts.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { ShipmentsModule } from '../shipments/shipments.module'

@Module({
  imports: [AlertsModule, NotificationsModule, ShipmentsModule],
  controllers: [LoadsController],
  providers: [LoadsService],
  exports: [LoadsService],
})
export class LoadsModule {}
