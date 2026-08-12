import { Module } from '@nestjs/common'
import { TripsController } from './trips.controller'
import { TripsService } from './trips.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { ShipmentsModule } from '../shipments/shipments.module'
import { MarketModule } from '../market/market.module'

@Module({
  imports: [NotificationsModule, ShipmentsModule, MarketModule],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
