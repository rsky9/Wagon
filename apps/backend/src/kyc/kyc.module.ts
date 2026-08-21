import { Module } from '@nestjs/common'
import { KycController } from './kyc.controller'
import { KycService } from './kyc.service'
import { UploadsModule } from '../uploads/uploads.module'
import { IdentityVerificationModule } from './identity-verification.module'
import { VerificationModule } from '../verification/verification.module'

@Module({
  imports: [UploadsModule, IdentityVerificationModule, VerificationModule],
  controllers: [KycController],
  providers: [KycService],
  exports: [KycService],
})
export class KycModule {}
