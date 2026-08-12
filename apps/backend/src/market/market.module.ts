import { Module } from '@nestjs/common'
import { MarketController } from './market.controller'
import { MarketService } from './market.service'
import { OutboxModule } from '../outbox/outbox.module'
import { OrgAccessModule } from '../org-access/org-access.module'

@Module({
  imports: [OutboxModule, OrgAccessModule],
  controllers: [MarketController],
  providers: [MarketService],
  exports: [MarketService],
})
export class MarketModule {}
