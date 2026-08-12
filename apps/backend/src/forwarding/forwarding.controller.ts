import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { ForwardingService } from './forwarding.service'
import type { User } from '@prisma/client'

@Controller('forwarding')
@UseGuards(JwtAuthGuard)
export class ForwardingController {
  constructor(private readonly forwarding: ForwardingService) {}

  @Post('orders')
  createOrder(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.forwarding.createOrder(body as never, user)
  }

  @Get('orders')
  listOrders(@CurrentUser() user: User) {
    return this.forwarding.listOrders(user)
  }

  @Get('orders/:id')
  orderDetail(@Param('id') id: string, @CurrentUser() user: User) {
    return this.forwarding.orderDetail(id, user)
  }

  @Patch('orders/:id/status')
  updateOrderStatus(@Param('id') id: string, @Body() body: { status: string }, @CurrentUser() user: User) {
    return this.forwarding.updateOrderStatus(id, body.status, user)
  }

  @Post('orders/:id/margin')
  setMargin(@Param('id') id: string, @Body() body: { buyAmount: number; sellAmount: number }, @CurrentUser() user: User) {
    return this.forwarding.setMargin(id, body.buyAmount, body.sellAmount, user)
  }

  @Post('bookings')
  book(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.forwarding.book(body as never, user)
  }

  @Post('bookings/:id/confirm')
  confirmBooking(@Param('id') id: string, @CurrentUser() user: User) {
    return this.forwarding.confirmBooking(id, user)
  }

  @Post('bookings/:id/cancel')
  cancelBooking(@Param('id') id: string, @CurrentUser() user: User) {
    return this.forwarding.cancelBooking(id, user)
  }

  @Get('shipments/:shipmentId/bookings')
  listBookings(@Param('shipmentId') shipmentId: string, @CurrentUser() user: User) {
    return this.forwarding.listBookings(shipmentId, user)
  }

  @Post('shipments/:id/documents')
  addDocument(@Param('id') id: string, @Body() body: { kind: string; number?: string; storageKey?: string }, @CurrentUser() user: User) {
    return this.forwarding.addDocument(id, body.kind, body.number, body.storageKey, user)
  }

  @Get('shipments/:id/documents')
  listDocuments(@Param('id') id: string, @CurrentUser() user: User) {
    return this.forwarding.listDocuments(id, user)
  }

  @Post('documents/:id/transition')
  transitionDocument(@Param('id') id: string, @Body() body: { status: string }, @CurrentUser() user: User) {
    return this.forwarding.transitionDocument(id, body.status, user)
  }

  @Post('consolidations')
  createConsolidation(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.forwarding.createConsolidation(body as never, user)
  }

  @Get('consolidations')
  listConsolidations(@CurrentUser() user: User) {
    return this.forwarding.listConsolidations(user)
  }

  @Get('consolidations/:id')
  consolidationDetail(@Param('id') id: string, @CurrentUser() user: User) {
    return this.forwarding.consolidationDetail(id, user)
  }

  @Post('consolidations/:id/orders')
  addOrderToConsolidation(@Param('id') id: string, @Body() body: { orderId: string }, @CurrentUser() user: User) {
    return this.forwarding.addOrderToConsolidation(id, body.orderId, user)
  }

  @Post('consolidations/:id/ready')
  markConsolidationReady(@Param('id') id: string, @CurrentUser() user: User) {
    return this.forwarding.markConsolidationReady(id, user)
  }
}
