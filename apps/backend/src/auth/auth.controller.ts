import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { AuthService } from './auth.service'
import { TokenService } from './token.service'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { CurrentUser } from './guards/current-user.decorator'
import type { SendOtpRequest, VerifyOtpRequest } from '@wagon/contracts'
import type { User, UserRole } from '@prisma/client'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  // Strict limit: OTP requests are expensive + brute-force targets.
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Post('otp')
  requestOtp(@Body() body: SendOtpRequest) {
    return this.auth.requestOtp(body)
  }

  // Cap verification attempts too: 10 tries / 10 min per IP.
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @Post('verify')
  verifyOtp(@Body() body: VerifyOtpRequest) {
    return this.auth.verifyOtp(body)
  }

  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }) {
    return this.tokens.refresh(body.refreshToken)
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User) {
    const capabilities = user.capabilities?.length ? user.capabilities : ([user.role] as string[])
    return { profile: { ...user, capabilities } }
  }

  @Patch('role')
  @UseGuards(JwtAuthGuard)
  setRole(@Body() body: { role: UserRole }, @CurrentUser() user: User) {
    return this.auth.setRole(user, body.role)
  }

  @Patch('capabilities')
  @UseGuards(JwtAuthGuard)
  setCapabilities(@Body() body: { capabilities: string[] }, @CurrentUser() user: User) {
    return this.auth.setCapabilities(user, body.capabilities)
  }

  @Get('bank')
  @UseGuards(JwtAuthGuard)
  myBank(@CurrentUser() user: User) {
    return this.auth.myBank(user)
  }

  @Patch('bank')
  @UseGuards(JwtAuthGuard)
  updateBank(@Body() body: { account: string; ifsc: string; holder?: string }, @CurrentUser() user: User) {
    return this.auth.updateBank(user, body.account, body.ifsc, body.holder ?? '')
  }

  @Post('delete')
  @UseGuards(JwtAuthGuard)
  deleteAccount(@CurrentUser() user: User) {
    return this.auth.deleteAccount(user)
  }
}
