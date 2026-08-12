import { Module } from '@nestjs/common'
import { IntegrationsController } from './integrations.controller'
import { IntegrationsService } from './integrations.service'
import { WebhookDispatcher } from './webhook-dispatcher.service'

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, WebhookDispatcher],
  exports: [WebhookDispatcher],
})
export class IntegrationsModule {}
