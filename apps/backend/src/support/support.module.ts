import { Module } from '@nestjs/common'
import { SupportController } from './support.controller'
import { SupportService } from './support.service'
import { AuditModule } from '../audit/audit.module'

@Module({
  imports: [AuditModule],
  controllers: [SupportController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
