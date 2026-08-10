import { Module } from '@nestjs/common'
import { KycController } from './kyc.controller'
import { KycService } from './kyc.service'
import { UploadsModule } from '../uploads/uploads.module'

@Module({
  imports: [UploadsModule],
  controllers: [KycController],
  providers: [KycService],
})
export class KycModule {}
