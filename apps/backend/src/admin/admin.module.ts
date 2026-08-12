import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller'
import { AdminService } from './admin.service'
import { AuditModule } from '../audit/audit.module'
import { UploadsModule } from '../uploads/uploads.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PaymentsModule } from '../payments/payments.module'

@Module({
  imports: [AuditModule, UploadsModule, NotificationsModule, PaymentsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
