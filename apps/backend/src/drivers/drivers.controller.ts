import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Roles } from '../auth/guards/roles.decorator'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { DriversService } from './drivers.service'
import { CreateDriverDto } from './drivers.dto'
import type { User } from '@prisma/client'

@Controller('drivers')
@UseGuards(JwtAuthGuard)
@Roles('transporter')
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.drivers.list(user)
  }

  @Get('available')
  available(@CurrentUser() user: User) {
    return this.drivers.available(user)
  }

  @Post()
  create(@Body() body: CreateDriverDto, @CurrentUser() user: User) {
    return this.drivers.create(body, user)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: CreateDriverDto, @CurrentUser() user: User) {
    return this.drivers.update(id, body, user)
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.drivers.remove(id, user)
  }

  @Post(':id/verify')
  verify(@Param('id') id: string, @Body() body: { licenseKey?: string; imageKey?: string }, @CurrentUser() user: User) {
    return this.drivers.verifyDriver(id, body, user)
  }

  @Post(':id/upload')
  requestUpload(@Param('id') id: string, @Body() body: { mimeType: string; size: number }, @CurrentUser() user: User) {
    return this.drivers.requestUpload(id, body.mimeType, body.size, user)
  }

  @Get(':id/performance')
  performance(@Param('id') id: string, @CurrentUser() user: User) {
    return this.drivers.performance(id, user)
  }
}
