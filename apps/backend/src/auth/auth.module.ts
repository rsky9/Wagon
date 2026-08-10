import { Global, Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { TokenService } from './token.service'
import { MockOtpProvider, OTP_PROVIDER } from './otp-provider.service'
import { SmsOtpProvider } from './sms-otp-provider.service'
import { JwtAuthGuard } from './guards/jwt-auth.guard'

const OtpProviderFactory = {
  provide: OTP_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const mode = config.get<string>('OTP_PROVIDER', 'mock')
    if (mode === 'sms') {
      return new SmsOtpProvider(config)
    }
    return new MockOtpProvider()
  },
}

@Global()
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    MockOtpProvider,
    JwtAuthGuard,
    OtpProviderFactory,
  ],
  exports: [AuthService, TokenService, JwtAuthGuard],
})
export class AuthModule {}
