import { Module } from '@nestjs/common'
import { TripsController } from './trips.controller'
import { TripsService } from './trips.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { ShipmentsModule } from '../shipments/shipments.module'
import { MarketModule } from '../market/market.module'
import { PaymentsModule } from '../payments/payments.module'

@Module({
  imports: [NotificationsModule, ShipmentsModule, MarketModule, PaymentsModule],
  controllers: [TripsController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
