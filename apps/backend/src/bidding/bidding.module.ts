import { Module } from '@nestjs/common'
import { BiddingController } from './bidding.controller'
import { BiddingService } from './bidding.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { RatingsModule } from '../ratings/ratings.module'
import { ShipmentsModule } from '../shipments/shipments.module'

@Module({
  imports: [NotificationsModule, RatingsModule, ShipmentsModule],
  controllers: [BiddingController],
  providers: [BiddingService],
})
export class BiddingModule {}
