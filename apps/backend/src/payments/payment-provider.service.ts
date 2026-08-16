import { Injectable, Logger } from '@nestjs/common'

export interface CaptureInput {
  amount: number
  currency: string
  reference: string
  metadata?: Record<string, string>
}

export interface CaptureResult {
  providerRef: string
  status: 'succeeded' | 'failed'
  capturedAt: Date
}

export interface PayoutInput {
  amount: number
  currency: string
  destination: { account?: string; ifsc?: string; upi?: string }
  reference: string
}

export interface PayoutResult {
  providerRef: string
  status: 'succeeded' | 'failed'
  paidAt: Date
}

export interface RefundInput {
  amount: number
  currency: string
  reference: string
  originalProviderRef?: string
  metadata?: Record<string, string>
}

export interface RefundResult {
  providerRef: string
  status: 'succeeded' | 'failed'
  refundedAt: Date
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER')

export interface PaymentProvider {
  capture(input: CaptureInput): Promise<CaptureResult>
  payout(input: PayoutInput): Promise<PayoutResult>
  refund(input: RefundInput): Promise<RefundResult>
}

/**
 * Mock payment provider (mocks-first). In production, swap for Razorpay/UPI
 * behind this same interface. Deterministic: succeeds unless amount <= 0.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(MockPaymentProvider.name)

  async capture(input: CaptureInput): Promise<CaptureResult> {
    this.logger.log(
      `[mock-payment] CAPTURE ${input.amount}${input.currency} ref=${input.reference}`,
    )
    if (input.amount <= 0) {
      return { providerRef: `mock_${input.reference}`, status: 'failed', capturedAt: new Date() }
    }
    return { providerRef: `mock_${input.reference}`, status: 'succeeded', capturedAt: new Date() }
  }

  async payout(input: PayoutInput): Promise<PayoutResult> {
    this.logger.log(
      `[mock-payment] PAYOUT ${input.amount}${input.currency} ref=${input.reference} dest=${input.destination.upi ?? input.destination.account ?? 'n/a'}`,
    )
    if (input.amount <= 0) {
      return { providerRef: `mock_${input.reference}`, status: 'failed', paidAt: new Date() }
    }
    return { providerRef: `mock_${input.reference}`, status: 'succeeded', paidAt: new Date() }
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    this.logger.log(
      `[mock-payment] REFUND ${input.amount}${input.currency} ref=${input.reference} original=${input.originalProviderRef ?? 'n/a'}`,
    )
    if (input.amount <= 0) {
      return { providerRef: `mock_${input.reference}`, status: 'failed', refundedAt: new Date() }
    }
    return { providerRef: `mock_${input.reference}`, status: 'succeeded', refundedAt: new Date() }
  }
}
