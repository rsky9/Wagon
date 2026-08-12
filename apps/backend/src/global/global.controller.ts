import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
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
  checklist(@Param('shipmentId') shipmentId: string) {
    return this.global.checklist(shipmentId)
  }
}
