import { Module } from '@nestjs/common'
import { AnalyticsController } from './analytics.controller'
import { AnalyticsService } from './analytics.service'
import { AuditModule } from '../audit/audit.module'
import { OrgAccessModule } from '../org-access/org-access.module'

@Module({
  imports: [AuditModule, OrgAccessModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}