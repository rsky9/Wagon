import { Module } from '@nestjs/common'
import { FoundationController } from './foundation.controller'
import { FoundationService } from './foundation.service'
import { OutboxModule } from '../outbox/outbox.module'

@Module({
  imports: [OutboxModule],
  controllers: [FoundationController],
  providers: [FoundationService],
  exports: [FoundationService],
})
export class FoundationModule {}
