import { Module } from '@nestjs/common'
import { BiddingController } from './bidding.controller'
import { BiddingService } from './bidding.service'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [NotificationsModule],
  controllers: [BiddingController],
  providers: [BiddingService],
})
export class BiddingModule {}
