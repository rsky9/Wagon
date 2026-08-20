import { Module } from '@nestjs/common'
import { MarketController } from './market.controller'
import { MarketService } from './market.service'
import { AuditModule } from '../audit/audit.module'
import { OutboxModule } from '../outbox/outbox.module'
import { OrgAccessModule } from '../org-access/org-access.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PlanningModule } from '../planning/planning.module'
import { MatchingModule } from '../matching/matching.module'

@Module({
  imports: [AuditModule, OutboxModule, OrgAccessModule, NotificationsModule, PlanningModule, MatchingModule],
  controllers: [MarketController],
  providers: [MarketService],
  exports: [MarketService],
})
export class MarketModule {}
