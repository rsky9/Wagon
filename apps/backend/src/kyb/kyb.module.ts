import { Module } from '@nestjs/common'
import { KybController } from './kyb.controller'
import { KybService } from './kyb.service'
import { AuditModule } from '../audit/audit.module'
import { OrgAccessModule } from '../org-access/org-access.module'

@Module({
  imports: [AuditModule, OrgAccessModule],
  controllers: [KybController],
  providers: [KybService],
  exports: [KybService],
})
export class KybModule {}