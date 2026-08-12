import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { IntegrationsService } from './integrations.service'
import type { User } from '@prisma/client'

@Controller('integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Post('connectors')
  createConnector(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.integrations.createConnector(body as never, user)
  }

  @Get('connectors')
  listConnectors(@CurrentUser() user: User) {
    return this.integrations.listConnectors(user)
  }

  @Get('connectors/:id')
  connectorDetail(@Param('id') id: string, @CurrentUser() user: User) {
    return this.integrations.connectorDetail(id, user)
  }

  @Post('connectors/:id/sync')
  syncConnector(@Param('id') id: string, @CurrentUser() user: User) {
    return this.integrations.syncConnector(id, user)
  }

  @Patch('connectors/:id/status')
  setConnectorStatus(@Param('id') id: string, @Body() body: { status: 'active' | 'disabled' }, @CurrentUser() user: User) {
    return this.integrations.setConnectorStatus(id, body.status, user)
  }

  @Delete('connectors/:id')
  deleteConnector(@Param('id') id: string, @CurrentUser() user: User) {
    return this.integrations.deleteConnector(id, user)
  }

  @Post('webhooks')
  createWebhook(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.integrations.createWebhook(body as never, user)
  }

  @Get('webhooks')
  listWebhooks(@CurrentUser() user: User) {
    return this.integrations.listWebhooks(user)
  }

  @Get('webhooks/:id')
  webhookDetail(@Param('id') id: string, @CurrentUser() user: User) {
    return this.integrations.webhookDetail(id, user)
  }

  @Patch('webhooks/:id')
  updateWebhook(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.integrations.updateWebhook(id, body as never, user)
  }

  @Patch('webhooks/:id/status')
  setWebhookStatus(@Param('id') id: string, @Body() body: { status: 'active' | 'paused' }, @CurrentUser() user: User) {
    return this.integrations.setWebhookStatus(id, body.status, user)
  }

  @Post('webhooks/:id/rotate-secret')
  rotateSecret(@Param('id') id: string, @CurrentUser() user: User) {
    return this.integrations.rotateSecret(id, user)
  }

  @Post('webhooks/:id/test')
  testWebhook(@Param('id') id: string, @CurrentUser() user: User) {
    return this.integrations.testWebhook(id, user)
  }

  @Get('webhooks/:id/deliveries')
  deliveries(@Param('id') id: string, @CurrentUser() user: User) {
    return this.integrations.deliveries(id, user)
  }

  @Get('deliveries')
  listDeliveries(@Query('status') status: string | undefined, @CurrentUser() user: User) {
    return this.integrations.listDeliveries(user, status)
  }

  @Post('deliveries/:id/retry')
  retryDelivery(@Param('id') id: string, @CurrentUser() user: User) {
    return this.integrations.retryDelivery(id, user)
  }
}
