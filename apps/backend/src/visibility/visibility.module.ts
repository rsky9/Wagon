import { Module } from '@nestjs/common'
import { VisibilityController } from './visibility.controller'
import { VisibilityService } from './visibility.service'
import { AuditModule } from '../audit/audit.module'
import { OrgAccessModule } from '../org-access/org-access.module'

@Module({
  imports: [AuditModule, OrgAccessModule],
  controllers: [VisibilityController],
  providers: [VisibilityService],
  exports: [VisibilityService],
})
export class VisibilityModule {}