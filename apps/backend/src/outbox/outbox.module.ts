import { Module } from '@nestjs/common'
import { OutboxRelay } from './outbox-relay.service'
import { IntegrationsModule } from '../integrations/integrations.module'

@Module({
  imports: [IntegrationsModule],
  providers: [OutboxRelay],
  exports: [OutboxRelay],
})
export class OutboxModule {}
