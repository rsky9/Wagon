import { Module } from '@nestjs/common'
import { TrucksController } from './trucks.controller'
import { TrucksService } from './trucks.service'
import { MarketModule } from '../market/market.module'

@Module({
  imports: [MarketModule],
  controllers: [TrucksController],
  providers: [TrucksService],
})
export class TrucksModule {}
