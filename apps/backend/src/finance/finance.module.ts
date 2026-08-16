import { Module } from '@nestjs/common'
import { FinanceController } from './finance.controller'
import { FinanceService } from './finance.service'
import { OutboxModule } from '../outbox/outbox.module'
import { OrgAccessModule } from '../org-access/org-access.module'
import { PaymentsModule } from '../payments/payments.module'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [OutboxModule, OrgAccessModule, PaymentsModule, NotificationsModule],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
