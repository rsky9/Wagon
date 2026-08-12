import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { StorageService } from './storage.service'
import type { User } from '@prisma/client'

@Controller('storage')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post('facilities')
  createFacility(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.storage.createFacility(body as never, user)
  }

  @Get('facilities')
  facilities() {
    return this.storage.facilities()
  }

  @Post('facilities/:id/operations')
  startOperation(@Param('id') id: string, @Body() body: { shipmentId?: string; appointmentAt?: string }, @CurrentUser() user: User) {
    return this.storage.startOperation(id, body, user)
  }

  @Post('operations/:id/advance')
  advance(@Param('id') id: string, @CurrentUser() user: User) {
    return this.storage.advance(id, user)
  }

  @Get('operations')
  operations(@Query('facilityId') facilityId?: string) {
    return this.storage.operations(facilityId)
  }
}
