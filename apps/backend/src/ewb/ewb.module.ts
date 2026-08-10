import { Module } from '@nestjs/common'
import { EwbController } from './ewb.controller'
import { EwbService } from './ewb.service'
import { MockEwbProvider, EWB_PROVIDER } from './ewb-provider.service'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [NotificationsModule],
  controllers: [EwbController],
  providers: [EwbService, MockEwbProvider, { provide: EWB_PROVIDER, useExisting: MockEwbProvider }],
})
export class EwbModule {}
