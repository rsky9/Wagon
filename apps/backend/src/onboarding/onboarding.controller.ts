import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { OnboardingService } from './onboarding.service'
import { TransporterDto, SupplierDto } from './onboarding.dto'
import type { User } from '@prisma/client'

@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Post('transporter')
  completeTransporter(@Body() body: TransporterDto, @CurrentUser() user: User) {
    return this.onboarding.completeTransporter(body, user)
  }

  @Post('supplier')
  completeSupplier(@Body() body: SupplierDto, @CurrentUser() user: User) {
    return this.onboarding.completeSupplier(body, user)
  }

  @Get('status')
  status(@CurrentUser() user: User) {
    return this.onboarding.status(user)
  }
}
