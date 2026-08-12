import { Module } from '@nestjs/common'
import { ForwardingController } from './forwarding.controller'
import { ForwardingService } from './forwarding.service'
import { OutboxModule } from '../outbox/outbox.module'

@Module({
  imports: [OutboxModule],
  controllers: [ForwardingController],
  providers: [ForwardingService],
  exports: [ForwardingService],
})
export class ForwardingModule {}
