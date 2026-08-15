import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { IntegrationsService } from '../../integrations/integrations.service'

/**
 * Machine-to-machine guard: authenticates with x-api-key (a connector's
 * programmatic credential) instead of a user JWT. Attaches a synthetic request
 * context so the marketplace can attribute the demand to the connector's org.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly integrations: IntegrationsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest()
    const apiKey = req.headers['x-api-key']
    if (!apiKey || typeof apiKey !== 'string') throw new UnauthorizedException('Missing x-api-key')
    const { connectorId, orgId } = await this.integrations.verifyApiKey(apiKey)
    req.apiKeyAuth = { connectorId, orgId }
    return true
  }
}
