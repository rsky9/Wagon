import { Module } from '@nestjs/common'
import { FoundationController } from './foundation.controller'
import { FoundationService } from './foundation.service'
import { AuditModule } from '../audit/audit.module'
import { OutboxModule } from '../outbox/outbox.module'
import { OrgAccessModule } from '../org-access/org-access.module'
import { MarketModule } from '../market/market.module'
import { PlanningModule } from '../planning/planning.module'

@Module({
  imports: [AuditModule, OutboxModule, OrgAccessModule, MarketModule, PlanningModule],
  controllers: [FoundationController],
  providers: [FoundationService],
  exports: [FoundationService],
})
export class FoundationModule {}
