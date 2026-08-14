import { Module } from '@nestjs/common'
import { AiController } from './ai.controller'
import { AiService } from './ai.service'
import { PlanningModule } from '../planning/planning.module'
import { OrgAccessModule } from '../org-access/org-access.module'
import { MarketModule } from '../market/market.module'
import { OutboxModule } from '../outbox/outbox.module'

@Module({
  imports: [PlanningModule, OrgAccessModule, MarketModule, OutboxModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
