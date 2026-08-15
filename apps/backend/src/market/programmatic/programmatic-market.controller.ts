import { Body, Controller, Get, Param, Post, Req, UseGuards, ForbiddenException } from '@nestjs/common'
import { ApiKeyGuard } from './api-key.guard'
import { PrismaService } from '../../prisma/prisma.service'
import { MarketService } from '../market.service'

/**
 * Programmatic marketplace (Phase 5): machine-to-machine demand posting.
 * An ERP/TMS authenticates with a connector x-api-key and can publish a need,
 * list live supply, or decompose a need into a plan — no human app required.
 */
@Controller('programmatic/market')
@UseGuards(ApiKeyGuard)
export class ProgrammaticMarketController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
  ) {}

  /** Resolve a User row for the connector's org (prefer an owner). */
  private async actingUser(orgId: string) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { organizationId: orgId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    })
    if (!member?.user) throw new ForbiddenException('Connector org has no acting user')
    return member.user
  }

  @Post('requests')
  async postRequest(@Req() req: { apiKeyAuth: { orgId: string } }, @Body() body: { kind: string; originRef?: string; destinationRef?: string; city?: string; capacityNeeded?: number; budget?: number; description?: string }) {
    const user = await this.actingUser(req.apiKeyAuth.orgId)
    return this.market.createRequest({ ...body, sourceType: 'programmatic', sourceId: req.apiKeyAuth.orgId }, user)
  }

  @Post('requests/:requestId/decompose')
  async decompose(@Req() req: { apiKeyAuth: { orgId: string } }, @Param('requestId') requestId: string, @Body() body: { legs: Array<{ origin: string; destination?: string; city?: string; mode?: string; kind?: string; capacityNeeded?: number }> }) {
    const user = await this.actingUser(req.apiKeyAuth.orgId)
    return this.market.decompose({ requestId, legs: body.legs }, user)
  }

  @Get('supply')
  async supply(@Req() req: { apiKeyAuth: { orgId: string } }) {
    await this.actingUser(req.apiKeyAuth.orgId)
    return this.market.browseListings({ status: 'live' })
  }

  @Get('for-you')
  async forYou(@Req() req: { apiKeyAuth: { orgId: string } }) {
    const user = await this.actingUser(req.apiKeyAuth.orgId)
    return this.market.forYou(user)
  }
}
