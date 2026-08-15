import { Module } from '@nestjs/common'
import { ProgrammaticMarketController } from './programmatic-market.controller'
import { ApiKeyGuard } from './api-key.guard'
import { MarketModule } from '../market.module'
import { IntegrationsModule } from '../../integrations/integrations.module'

@Module({
  imports: [MarketModule, IntegrationsModule],
  controllers: [ProgrammaticMarketController],
  providers: [ApiKeyGuard],
})
export class ProgrammaticMarketModule {}
