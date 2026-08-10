import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Roles } from '../auth/guards/roles.decorator'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { AdminService } from './admin.service'
import type { User } from '@prisma/client'

@Controller('admin')
@UseGuards(JwtAuthGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard()
  }

  @Get('loads')
  loads(@Query('status') status?: string) {
    return this.admin.loads(status ? { status } : undefined)
  }

  @Get('trips')
  trips() {
    return this.admin.trips()
  }

  @Get('users')
  users(@Query('q') q?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.admin.usersSearch(q, Number(page) || 1, Number(pageSize) || 20)
  }

  @Get('users/:id')
  user(@Param('id') id: string) {
    return this.admin.userDetail(id)
  }

  @Get('users/:id/kyc')
  kyc(@Param('id') id: string) {
    return this.admin.kycDocuments(id)
  }

  @Get('tickets')
  tickets(@Query('q') q?: string, @Query('status') status?: string) {
    return this.admin.ticketsSearch(q, status)
  }

  @Get('reports')
  reports() {
    return this.admin.reports()
  }

  @Post('tickets/:id/resolve')
  resolveTicket(@Param('id') id: string, @Body() body: { resolution: string }, @CurrentUser() actor: User) {
    return this.admin.resolveTicket(id, body.resolution, actor)
  }

  @Post('broadcast')
  broadcast(@Body() body: { role?: string; title: string; body: string }, @CurrentUser() actor: User) {
    return this.admin.broadcast(body.role, body.title, body.body, actor)
  }

  @Post('rate-cards/:modelId')
  updateRateCard(@Param('modelId') modelId: string, @Body() body: { pricePerKm: number }, @CurrentUser() actor: User) {
    return this.admin.updateRateCard(modelId, body.pricePerKm, actor)
  }

  @Post('verify/:id')
  verify(@Param('id') id: string, @Body() body: { capability?: 'supplier' | 'transporter' }, @CurrentUser() actor: User) {
    return this.admin.verify(id, actor, body?.capability)
  }

  @Patch('users/:id/reject')
  reject(@Param('id') id: string, @Body() body: { capability?: 'supplier' | 'transporter' }, @CurrentUser() actor: User) {
    return this.admin.reject(id, actor, body?.capability)
  }

  @Post('users/:id/suspend')
  suspend(@Param('id') id: string, @CurrentUser() actor: User) {
    return this.admin.suspend(id, actor)
  }

  @Post('users/:id/activate')
  activate(@Param('id') id: string, @CurrentUser() actor: User) {
    return this.admin.activate(id, actor)
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string, @CurrentUser() actor: User) {
    return this.admin.deleteUser(id, actor)
  }

  @Patch('users/:id/role')
  changeRole(@Param('id') id: string, @Body() body: { role: string }, @CurrentUser() actor: User) {
    return this.admin.changeRole(id, body.role, actor)
  }

  @Post('loads/:id/cancel')
  cancelLoad(@Param('id') id: string, @Body() body: { reason?: string }, @CurrentUser() actor: User) {
    return this.admin.cancelLoad(id, body.reason ?? '', actor)
  }

  @Post('trips/:id/force-complete')
  forceCompleteTrip(@Param('id') id: string, @CurrentUser() actor: User) {
    return this.admin.forceCompleteTrip(id, actor)
  }

  @Get('payments')
  payments(@Query('status') status?: string) {
    return this.admin.payments(status ? { status } : undefined)
  }

  @Post('payments/:id/refund')
  refund(@Param('id') id: string, @CurrentUser() actor: User) {
    return this.admin.refund(id, actor)
  }

  @Post('reports/:id/action')
  actionReport(@Param('id') id: string, @Body() body: { action: 'dismiss' | 'block' }, @CurrentUser() actor: User) {
    return this.admin.actionReport(id, body.action, actor)
  }
}
