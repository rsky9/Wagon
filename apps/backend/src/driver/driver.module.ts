import { Module } from '@nestjs/common'
import { DriverController } from './driver.controller'
import { DriverService } from './driver.service'
import { PaymentsModule } from '../payments/payments.module'

@Module({
  imports: [PaymentsModule],
  controllers: [DriverController],
  providers: [DriverService],
})
export class DriverModule {}
