import { Module } from '@nestjs/common'
import { AiController } from './ai.controller'
import { AiService } from './ai.service'
import { TripHealthService } from './trip-health.service'
import { TripHealthSweep } from './trip-health-sweep.service'
import { PlanningModule } from '../planning/planning.module'
import { OrgAccessModule } from '../org-access/org-access.module'
import { MarketModule } from '../market/market.module'
import { OutboxModule } from '../outbox/outbox.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [PlanningModule, OrgAccessModule, MarketModule, OutboxModule, NotificationsModule],
  controllers: [AiController],
  providers: [AiService, TripHealthService, TripHealthSweep],
  exports: [AiService, TripHealthService],
})
export class AiModule {}
