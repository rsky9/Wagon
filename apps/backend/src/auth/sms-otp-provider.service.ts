import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OtpProvider, SendOtpInput } from './otp-provider.service'

/**
 * Real SMS/WhatsApp OTP provider (MSG91-style HTTP API).
 * Activated when OTP_PROVIDER=sms and MSG91_AUTH_KEY (+ MSG91_SENDER_ID) are set.
 * In production you can swap to Twilio / WhatsApp Business API behind the same interface.
 */
@Injectable()
export class SmsOtpProvider implements OtpProvider {
  private readonly logger = new Logger(SmsOtpProvider.name)

  constructor(private readonly config: ConfigService) {}

  async send({ mobile, channel }: SendOtpInput, code: string): Promise<void> {
    const authKey = this.config.get<string>('MSG91_AUTH_KEY')
    const senderId = this.config.get<string>('MSG91_SENDER_ID') ?? 'WAGON'

    if (!authKey) {
      this.logger.warn(`[sms-otp] MSG91_AUTH_KEY not set — logging code ${code} for ${mobile}`)
      return
    }

    // MSG91 v2: send a transactional message with variable `otp`.
    const res = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: {
        authkey: authKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: senderId,
        mobiles: `91${mobile}`,
        flow_id: this.config.get<string>('MSG91_FLOW_ID'),
        VAR1: code,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      this.logger.warn(`[sms-otp] MSG91 send failed: ${res.status} ${text.slice(0, 200)}`)
      return
    }
    this.logger.log(`[sms-otp] ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} OTP sent to ${mobile}`)
  }
}
