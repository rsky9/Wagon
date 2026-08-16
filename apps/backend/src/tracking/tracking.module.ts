import { Module } from '@nestjs/common'
import { TrackingController } from './tracking.controller'
import { TrackingService } from './tracking.service'
import { TrackingGateway } from './tracking.gateway'
import { OutboxModule } from '../outbox/outbox.module'

@Module({
  imports: [OutboxModule],
  controllers: [TrackingController],
  providers: [TrackingService, TrackingGateway],
  exports: [TrackingService],
})
export class TrackingModule {}
