import { Module } from '@nestjs/common'
import { TripsController } from './trips.controller'
import { TripsService } from './trips.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { ShipmentsModule } from '../shipments/shipments.module'

@Module({
  imports: [NotificationsModule, ShipmentsModule],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
