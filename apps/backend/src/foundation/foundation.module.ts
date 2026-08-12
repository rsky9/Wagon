import { Module } from '@nestjs/common'
import { FoundationController } from './foundation.controller'
import { FoundationService } from './foundation.service'
import { OutboxModule } from '../outbox/outbox.module'
import { OrgAccessModule } from '../org-access/org-access.module'

@Module({
  imports: [OutboxModule, OrgAccessModule],
  controllers: [FoundationController],
  providers: [FoundationService],
  exports: [FoundationService],
})
export class FoundationModule {}
