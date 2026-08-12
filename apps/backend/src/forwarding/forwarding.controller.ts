import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
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

  @Post('shipments/:id/documents')
  addDocument(@Param('id') id: string, @Body() body: { kind: string; number?: string; storageKey?: string }, @CurrentUser() user: User) {
    return this.forwarding.addDocument(id, body.kind, body.number, body.storageKey, user)
  }

  @Get('orders')
  listOrders(@CurrentUser() user: User) {
    return this.forwarding.listOrders(user)
  }
}
