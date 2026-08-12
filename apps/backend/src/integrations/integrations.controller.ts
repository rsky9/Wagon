import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
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

  @Post('connectors/:id/sync')
  syncConnector(@Param('id') id: string, @CurrentUser() user: User) {
    return this.integrations.syncConnector(id, user)
  }

  @Post('webhooks')
  createWebhook(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.integrations.createWebhook(body as never, user)
  }

  @Get('webhooks')
  listWebhooks(@CurrentUser() user: User) {
    return this.integrations.listWebhooks(user)
  }

  @Get('webhooks/:id/deliveries')
  deliveries(@Param('id') id: string, @CurrentUser() user: User) {
    return this.integrations.deliveries(id, user)
  }
}
