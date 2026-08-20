import { Module } from '@nestjs/common'
import { ForwardingController } from './forwarding.controller'
import { ForwardingService } from './forwarding.service'
import { AuditModule } from '../audit/audit.module'
import { OutboxModule } from '../outbox/outbox.module'
import { OrgAccessModule } from '../org-access/org-access.module'
import { MarketModule } from '../market/market.module'

@Module({
  imports: [AuditModule, OutboxModule, OrgAccessModule, MarketModule],
  controllers: [ForwardingController],
  providers: [ForwardingService],
  exports: [ForwardingService],
})
export class ForwardingModule {}
