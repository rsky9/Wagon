import { Module } from '@nestjs/common'
import { EwbController } from './ewb.controller'
import { EwbService } from './ewb.service'
import { MockEwbProvider, EWB_PROVIDER } from './ewb-provider.service'
import { NotificationsModule } from '../notifications/notifications.module'
import { AuditModule } from '../audit/audit.module'

@Module({
  imports: [NotificationsModule, AuditModule],
  controllers: [EwbController],
  providers: [EwbService, MockEwbProvider, { provide: EWB_PROVIDER, useExisting: MockEwbProvider }],
  exports: [EwbService],
})
export class EwbModule {}
