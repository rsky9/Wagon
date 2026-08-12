import { Module } from '@nestjs/common'
import { ForwardingController } from './forwarding.controller'
import { ForwardingService } from './forwarding.service'
import { OutboxModule } from '../outbox/outbox.module'
import { OrgAccessModule } from '../org-access/org-access.module'

@Module({
  imports: [OutboxModule, OrgAccessModule],
  controllers: [ForwardingController],
  providers: [ForwardingService],
  exports: [ForwardingService],
})
export class ForwardingModule {}
