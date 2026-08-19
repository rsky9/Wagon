import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Roles } from '../auth/guards/roles.decorator'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { TrucksService } from './trucks.service'
import { CreateTruckDto } from './trucks.dto'
import type { User } from '@prisma/client'

@Controller('trucks')
@UseGuards(JwtAuthGuard)
@Roles('transporter')
export class TrucksController {
  constructor(private readonly trucks: TrucksService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.trucks.list(user)
  }

  @Get('fleet/dashboard')
  fleet(@CurrentUser() user: User) {
    return this.trucks.fleetDashboard(user)
  }

  @Get('fleet/overview')
  overview(@CurrentUser() user: User) {
    return this.trucks.fleetOverview(user)
  }

  @Get('maintenance/due')
  maintenanceDue(@CurrentUser() user: User) {
    return this.trucks.maintenanceDue(user)
  }

  @Get(':id/maintenance')
  maintenanceHistory(@Param('id') id: string, @CurrentUser() user: User) {
    return this.trucks.maintenanceHistory(id, user)
  }

  @Post(':id/maintenance')
  logMaintenance(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.trucks.logMaintenance({ ...(body as object), truckId: id } as never, user)
  }

  @Post()
  create(@Body() body: CreateTruckDto, @CurrentUser() user: User) {
    return this.trucks.create(body, user)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: CreateTruckDto, @CurrentUser() user: User) {
    return this.trucks.update(id, body, user)
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.trucks.remove(id, user)
  }
}
