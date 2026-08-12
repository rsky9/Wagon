import { Module } from '@nestjs/common'
import { FinanceController } from './finance.controller'
import { FinanceService } from './finance.service'
import { OutboxModule } from '../outbox/outbox.module'

@Module({
  imports: [OutboxModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
