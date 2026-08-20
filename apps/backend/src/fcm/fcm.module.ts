import { Module } from '@nestjs/common'
import { FcmController } from './fcm.controller'
import { FcmService } from './fcm.service'
import { AuditModule } from '../audit/audit.module'

@Module({
  imports: [AuditModule],
  controllers: [FcmController],
  providers: [FcmService],
  exports: [FcmService],
})
export class FcmModule {}
