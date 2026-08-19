import { Module } from '@nestjs/common'
import { HandoversController } from './handovers.controller'
import { HandoversService } from './handovers.service'
import { AuditModule } from '../audit/audit.module'
import { OrgAccessModule } from '../org-access/org-access.module'

@Module({
  imports: [AuditModule, OrgAccessModule],
  controllers: [HandoversController],
  providers: [HandoversService],
  exports: [HandoversService],
})
export class HandoversModule {}