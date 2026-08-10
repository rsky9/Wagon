import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaymentsController } from './payments.controller'
import { PaymentsService } from './payments.service'
import { MockPaymentProvider, PAYMENT_PROVIDER } from './payment-provider.service'
import { RazorpayPaymentProvider } from './razorpay-payment-provider.service'
import { NotificationsModule } from '../notifications/notifications.module'

const PaymentProviderFactory = {
  provide: PAYMENT_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const mode = config.get<string>('PAYMENT_PROVIDER', 'mock')
    if (mode === 'razorpay' && config.get('RAZORPAY_KEY_ID') && config.get('RAZORPAY_KEY_SECRET')) {
      return new RazorpayPaymentProvider(config)
    }
    return new MockPaymentProvider()
  },
}

@Module({
  imports: [NotificationsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymentProviderFactory],
  exports: [PaymentsService],
})
export class PaymentsModule {}
