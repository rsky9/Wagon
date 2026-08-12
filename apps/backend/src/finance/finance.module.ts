import { Module } from '@nestjs/common'
import { FinanceController } from './finance.controller'
import { FinanceService } from './finance.service'
import { OutboxModule } from '../outbox/outbox.module'
import { OrgAccessModule } from '../org-access/org-access.module'
import { PaymentsModule } from '../payments/payments.module'

@Module({
  imports: [OutboxModule, OrgAccessModule, PaymentsModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
