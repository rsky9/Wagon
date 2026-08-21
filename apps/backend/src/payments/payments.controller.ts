import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Roles } from '../auth/guards/roles.decorator'
import { ActionVerifiedGuard } from '../auth/guards/action-verified.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { PaymentsService } from './payments.service'
import type { User } from '@prisma/client'

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('escrow')
  @Roles('supplier')
  @UseGuards(ActionVerifiedGuard('capture_escrow'))
  capture(@Body() body: { tripId: string; amount: number; stage?: 'escrow' | 'advance' | 'balance' }, @CurrentUser() user: User) {
    return this.payments.captureEscrow(body.tripId, body.amount, user, body.stage ?? 'escrow')
  }

  @Post('release')
  @Roles('transporter')
  @UseGuards(ActionVerifiedGuard('release_payout'))
  release(@Body() body: { tripId: string }, @CurrentUser() user: User) {
    return this.payments.releasePayout(body.tripId, user)
  }

  @Get('passbook')
  passbook(@CurrentUser() user: User) {
    return this.payments.passbook(user)
  }

  @Get('wallet')
  wallet(@CurrentUser() user: User) {
    return this.payments.wallet(user)
  }

  @Get('invoices')
  invoices(@CurrentUser() user: User) {
    return this.payments.invoices(user)
  }

  @Get('invoice/:tripId')
  invoice(@Param('tripId') tripId: string, @CurrentUser() user: User) {
    return this.payments.invoice(tripId, user)
  }

  @Post('pod/:tripId')
  @Roles('transporter')
  uploadPod(@Param('tripId') tripId: string, @Body() body: { photoKey: string; signatureKey?: string; consigneeName?: string; lat?: number; lng?: number; note?: string }, @CurrentUser() user: User) {
    return this.payments.uploadPod(tripId, body, user)
  }

  @Post('pod/:tripId/confirm')
  @Roles('supplier')
  confirmPod(@Param('tripId') tripId: string, @CurrentUser() user: User) {
    return this.payments.confirmPod(tripId, user)
  }
}
