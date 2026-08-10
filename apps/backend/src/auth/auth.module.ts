import { Global, Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { TokenService } from './token.service'
import { MockOtpProvider, OTP_PROVIDER } from './otp-provider.service'
import { JwtAuthGuard } from './guards/jwt-auth.guard'

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    MockOtpProvider,
    JwtAuthGuard,
    { provide: OTP_PROVIDER, useExisting: MockOtpProvider },
  ],
  exports: [AuthService, TokenService, JwtAuthGuard],
})
export class AuthModule {}
