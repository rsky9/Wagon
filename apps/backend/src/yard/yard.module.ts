import { Module } from '@nestjs/common'
import { YardController } from './yard.controller'
import { YardService } from './yard.service'
import { AuditModule } from '../audit/audit.module'
import { OrgAccessModule } from '../org-access/org-access.module'

@Module({
  imports: [AuditModule, OrgAccessModule],
  controllers: [YardController],
  providers: [YardService],
  exports: [YardService],
})
export class YardModule {}