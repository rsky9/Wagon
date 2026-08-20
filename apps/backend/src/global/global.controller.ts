import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { Roles } from '../auth/guards/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { GlobalService } from './global.service'
import type { User } from '@prisma/client'

@Controller('countries')
@UseGuards(JwtAuthGuard)
export class GlobalController {
  constructor(private readonly global: GlobalService) {}

  @Get()
  countries() {
    return this.global.countries()
  }

  @Get('home')
  homeCountry(@CurrentUser() user: User) {
    return this.global.homeCountry(user)
  }

  @Get('convert')
  convert(@Query('code') code: string, @Query('amount') amount: string) {
    return this.global.convert(code, Number(amount))
  }

  @Get(':code')
  country(@Param('code') code: string) {
    return this.global.country(code)
  }

  @Get(':code/documents')
  documents(@Param('code') code: string) {
    return this.global.documents(code)
  }

  @Post('home')
  setHomeCountry(@Body() body: { code: string }, @CurrentUser() user: User) {
    return this.global.setHomeCountry(body.code, user)
  }

  @Get('shipments/:shipmentId/checklist')
  checklist(@Param('shipmentId') shipmentId: string, @CurrentUser() user: User) {
    return this.global.checklist(shipmentId, user)
  }

  @Post('shipments/:shipmentId/documents/issue')
  issueDocuments(@Param('shipmentId') shipmentId: string, @CurrentUser() user: User) {
    return this.global.issueRequiredDocuments(shipmentId, user)
  }

  @Get('compliance/overview')
  complianceOverview(@CurrentUser() user: User) {
    return this.global.complianceOverview(user)
  }

  // Admin
  @Roles('admin')
  @Get('admin/list')
  adminList() {
    return this.global.adminList()
  }

  @Roles('admin')
  @Post('admin/upsert')
  upsertCountry(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.global.upsertCountry(body as never, user)
  }
}
