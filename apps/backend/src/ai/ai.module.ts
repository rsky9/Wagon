import { Module } from '@nestjs/common'
import { AiController } from './ai.controller'
import { AiService } from './ai.service'
import { PlanningModule } from '../planning/planning.module'
import { OrgAccessModule } from '../org-access/org-access.module'

@Module({
  imports: [PlanningModule, OrgAccessModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
