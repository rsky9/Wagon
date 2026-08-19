import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { EdiService } from './edi.service'
import type { User } from '@prisma/client'

@Controller('integrations/edi')
@UseGuards(JwtAuthGuard)
export class EdiController {
  constructor(private readonly edi: EdiService) {}

  @Post('receive')
  receive(@Body() body: { orgId: string; partnerOrgId?: string; raw: string }, @CurrentUser() user: User) {
    return this.edi.receive(body, user)
  }

  @Post('generate')
  generate(@Body() body: { orgId: string; partnerOrgId?: string; documentType: string; payload: Record<string, unknown> }, @CurrentUser() user: User) {
    return this.edi.generate(body, user)
  }

  @Post('send')
  send(@Body() body: { orgId: string; partnerOrgId?: string; documentType: string; payload: Record<string, unknown> }, @CurrentUser() user: User) {
    return this.edi.send(body, user)
  }

  @Get()
  list(@Query('direction') direction: string | undefined, @Query('status') status: string | undefined, @Query('documentType') documentType: string | undefined, @CurrentUser() user: User) {
    return this.edi.list(user, { direction, status, documentType })
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: User) {
    return this.edi.get(id, user)
  }
}