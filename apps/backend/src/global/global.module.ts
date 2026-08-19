import { Module } from '@nestjs/common'
import { GlobalController } from './global.controller'
import { GlobalService } from './global.service'
import { OrgAccessModule } from '../org-access/org-access.module'
import { TradeDocumentsModule } from '../trade-documents/trade-documents.module'

@Module({
  imports: [OrgAccessModule, TradeDocumentsModule],
  controllers: [GlobalController],
  providers: [GlobalService],
  exports: [GlobalService],
})
export class GlobalModule {}
