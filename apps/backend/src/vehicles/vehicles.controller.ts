import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Roles } from '../auth/guards/roles.decorator'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { VehiclesService } from './vehicles.service'
import type { User } from '@prisma/client'

@Controller('vehicles')
@UseGuards(JwtAuthGuard)
@Roles('transporter')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.vehicles.list(user)
  }

  @Post()
  create(@Body() body: { rcNumber: string; insuranceUpto?: string; permit?: string }, @CurrentUser() user: User) {
    return this.vehicles.create(body, user)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { rcNumber?: string; insuranceUpto?: string; permit?: string }, @CurrentUser() user: User) {
    return this.vehicles.update(id, body, user)
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.vehicles.remove(id, user)
  }

  @Post(':id/verify')
  @Roles('admin')
  verify(@Param('id') id: string, @CurrentUser() user: User) {
    return this.vehicles.verify(id, user)
  }
}
