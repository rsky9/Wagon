import { Module } from '@nestjs/common'
import { DisputesController } from './disputes.controller'
import { DisputesService } from './disputes.service'
import { AuditModule } from '../audit/audit.module'

@Module({
  imports: [AuditModule],
  controllers: [DisputesController],
  providers: [DisputesService],
})
export class DisputesModule {}
