import { Module } from '@nestjs/common'
import { TradeDocumentsController } from './trade-documents.controller'
import { TradeDocumentsService } from './trade-documents.service'
import { AuditModule } from '../audit/audit.module'
import { OrgAccessModule } from '../org-access/org-access.module'

@Module({
  imports: [AuditModule, OrgAccessModule],
  controllers: [TradeDocumentsController],
  providers: [TradeDocumentsService],
  exports: [TradeDocumentsService],
})
export class TradeDocumentsModule {}