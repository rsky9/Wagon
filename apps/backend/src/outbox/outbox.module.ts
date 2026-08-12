import { Module } from '@nestjs/common'
import { OutboxRelay } from './outbox-relay.service'

@Module({
  providers: [OutboxRelay],
  exports: [OutboxRelay],
})
export class OutboxModule {}
