import { Module } from '@nestjs/common'
import { MarketController } from './market.controller'
import { MarketService } from './market.service'
import { OutboxModule } from '../outbox/outbox.module'
import { OrgAccessModule } from '../org-access/org-access.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [OutboxModule, OrgAccessModule, NotificationsModule],
  controllers: [MarketController],
  providers: [MarketService],
  exports: [MarketService],
})
export class MarketModule {}
