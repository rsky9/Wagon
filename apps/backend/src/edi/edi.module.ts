import { Module } from '@nestjs/common'
import { EdiController } from './edi.controller'
import { EdiService } from './edi.service'
import { AuditModule } from '../audit/audit.module'
import { OrgAccessModule } from '../org-access/org-access.module'

@Module({
  imports: [AuditModule, OrgAccessModule],
  controllers: [EdiController],
  providers: [EdiService],
  exports: [EdiService],
})
export class EdiModule {}