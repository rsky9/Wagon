import { Module } from '@nestjs/common'
import { TrucksController } from './trucks.controller'
import { TrucksService } from './trucks.service'
import { MarketModule } from '../market/market.module'
import { UploadsModule } from '../uploads/uploads.module'
import { VerificationModule } from '../verification/verification.module'

@Module({
  imports: [MarketModule, UploadsModule, VerificationModule],
  controllers: [TrucksController],
  providers: [TrucksService],
})
export class TrucksModule {}
