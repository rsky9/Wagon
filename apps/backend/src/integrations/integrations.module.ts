import { Module } from '@nestjs/common'
import { IntegrationsController } from './integrations.controller'
import { IntegrationsService } from './integrations.service'
import { WebhookDispatcher } from './webhook-dispatcher.service'
import { OrgAccessModule } from '../org-access/org-access.module'

@Module({
  imports: [OrgAccessModule],
  controllers: [IntegrationsController],
  providers: [IntegrationsService, WebhookDispatcher],
  exports: [WebhookDispatcher, IntegrationsService],
})
export class IntegrationsModule {}
