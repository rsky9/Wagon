import { Injectable, Logger } from '@nestjs/common'

export interface SendOtpInput {
  mobile: string
  channel: 'sms' | 'whatsapp'
}

export interface OtpProvider {
  send(input: SendOtpInput, code: string): Promise<void>
}

export const OTP_PROVIDER = Symbol('OTP_PROVIDER')

/**
 * Mock OTP provider (mocks-first). In production, swap for an SMS/WhatsApp gateway
 * (e.g. MSG91, Twilio, WhatsApp Business API) behind this same interface.
 */
@Injectable()
export class MockOtpProvider implements OtpProvider {
  private readonly logger = new Logger(MockOtpProvider.name)

  async send({ mobile, channel }: SendOtpInput, code: string): Promise<void> {
    // Dev/demo: log the code so flows can be tested without a real gateway.
    this.logger.log(`[mock-otp] channel=${channel} mobile=${mobile} code=${code}`)
  }
}
