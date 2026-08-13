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

  @Get('loads/:id')
  load(@Param('id') id: string) {
    return this.admin.loadDetail(id)
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

  @Get('broadcasts')
  broadcasts() {
    return this.admin.broadcasts()
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
  payments(@Query('type') type?: string, @Query('status') status?: string) {
    const q: { type?: string; status?: string } = {}
    if (type) q.type = type
    if (status) q.status = status
    return this.admin.payments(q)
  }

  @Get('payments/:id')
  payment(@Param('id') id: string) {
    return this.admin.paymentDetail(id)
  }

  @Post('payments/:id/refund')
  refund(@Param('id') id: string, @CurrentUser() actor: User) {
    return this.admin.refund(id, actor)
  }

  @Post('reports/:id/action')
  actionReport(@Param('id') id: string, @Body() body: { action: 'dismiss' | 'block' }, @CurrentUser() actor: User) {
    return this.admin.actionReport(id, body.action, actor)
  }

  // ---------- Enablement platform ----------

  @Get('organizations')
  organizations() {
    return this.admin.organizations()
  }

  @Get('shipments')
  allShipments(@Query('status') status?: string, @Query('ownerOrgId') ownerOrgId?: string) {
    return this.admin.allShipments(status || ownerOrgId ? { status, ownerOrgId } : undefined)
  }

  @Get('plans')
  plans(@Query('shipmentId') shipmentId?: string) {
    return this.admin.plans(shipmentId)
  }

  @Get('claims')
  claims(@Query('status') status?: string) {
    return this.admin.claims(status)
  }

  @Get('webhooks')
  webhooks() {
    return this.admin.webhooks()
  }

  @Get('webhook-deliveries')
  webhookDeliveries(@Query('status') status?: string) {
    return this.admin.webhookDeliveries(status)
  }

  @Get('facilities')
  facilities() {
    return this.admin.facilities()
  }

  @Get('consolidations')
  consolidations() {
    return this.admin.consolidations()
  }

  @Get('settlements')
  settlements() {
    return this.admin.settlements()
  }

  @Get('enablement-dashboard')
  enablementDashboard() {
    return this.admin.enablementDashboard()
  }

  @Post('organizations/:id/verify')
  verifyOrganization(@Param('id') id: string, @Body() body: { verified?: boolean; capability?: string }, @CurrentUser() actor: User) {
    return this.admin.verifyOrganization(id, body.verified ?? true, actor, body.capability)
  }

  @Patch('shipments/:id/status')
  forceShipmentStatus(@Param('id') id: string, @Body() body: { status: string }, @CurrentUser() actor: User) {
    return this.admin.forceShipmentStatus(id, body.status, actor)
  }

  @Post('claims/:id/decide')
  decideClaim(@Param('id') id: string, @Body() body: { decision: 'approved' | 'rejected'; notes?: string }, @CurrentUser() actor: User) {
    return this.admin.decideClaim(id, body.decision, body.notes, actor)
  }

  @Post('settlements/:id/clear')
  clearSettlement(@Param('id') id: string, @CurrentUser() actor: User) {
    return this.admin.clearSettlement(id, actor)
  }

  @Post('plans/:id/cancel')
  cancelPlan(@Param('id') id: string, @CurrentUser() actor: User) {
    return this.admin.cancelPlan(id, actor)
  }

  @Patch('webhooks/:id/status')
  setWebhookStatus(@Param('id') id: string, @Body() body: { status: 'active' | 'paused' }, @CurrentUser() actor: User) {
    return this.admin.setWebhookStatus(id, body.status, actor)
  }

  @Post('webhook-deliveries/:id/retry')
  retryWebhookDelivery(@Param('id') id: string, @CurrentUser() actor: User) {
    return this.admin.retryWebhookDelivery(id, actor)
  }

  // ---------- Marketplace oversight ----------

  @Get('market/listings')
  marketListings(@Query('kind') kind?: string, @Query('status') status?: string) {
    return this.admin.marketListings({ kind, status })
  }

  @Get('market/requests')
  marketRequests(@Query('kind') kind?: string, @Query('status') status?: string) {
    return this.admin.marketRequests({ kind, status })
  }

  @Get('market/stats')
  marketStats() {
    return this.admin.marketStats()
  }

  @Post('market/listings/:id/pause')
  pauseListing(@Param('id') id: string, @CurrentUser() actor: User) {
    return this.admin.pauseListing(id, actor)
  }

  @Get('market/quotes')
  marketQuotes(@Query('status') status?: string) {
    return this.admin.marketQuotes({ status })
  }

  @Delete('market/quotes/:id')
  deleteQuote(@Param('id') id: string, @CurrentUser() actor: User) {
    return this.admin.deleteQuote(id, actor)
  }

  @Get('market/ratings')
  marketRatings() {
    return this.admin.marketRatings()
  }

  @Get('market/ai')
  aiRecommendations() {
    return this.admin.aiRecommendations()
  }

  @Get('market/analytics')
  marketAnalytics() {
    return this.admin.marketAnalytics()
  }
}
