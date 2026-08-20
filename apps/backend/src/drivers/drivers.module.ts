import { Module } from '@nestjs/common'
import { DriversController } from './drivers.controller'
import { DriversService } from './drivers.service'
import { UploadsModule } from '../uploads/uploads.module'
import { VerificationModule } from '../verification/verification.module'

@Module({
  imports: [UploadsModule, VerificationModule],
  controllers: [DriversController],
  providers: [DriversService],
})
export class DriversModule {}
