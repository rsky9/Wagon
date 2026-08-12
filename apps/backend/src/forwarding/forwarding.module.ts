import { Module } from '@nestjs/common'
import { ForwardingController } from './forwarding.controller'
import { ForwardingService } from './forwarding.service'
import { OutboxModule } from '../outbox/outbox.module'
import { OrgAccessModule } from '../org-access/org-access.module'
import { MarketModule } from '../market/market.module'

@Module({
  imports: [OutboxModule, OrgAccessModule, MarketModule],
  controllers: [ForwardingController],
  providers: [ForwardingService],
  exports: [ForwardingService],
})
export class ForwardingModule {}
