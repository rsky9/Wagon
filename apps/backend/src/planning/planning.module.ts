import { Module } from '@nestjs/common'
import { PlanningController } from './planning.controller'
import { PlanningService } from './planning.service'
import { AuditModule } from '../audit/audit.module'
import { OutboxModule } from '../outbox/outbox.module'
import { OrgAccessModule } from '../org-access/org-access.module'

@Module({
  imports: [AuditModule, OutboxModule, OrgAccessModule],
  controllers: [PlanningController],
  providers: [PlanningService],
  exports: [PlanningService],
})
export class PlanningModule {}
