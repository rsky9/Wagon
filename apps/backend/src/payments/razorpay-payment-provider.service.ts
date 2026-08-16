import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  CaptureInput,
  CaptureResult,
  PayoutInput,
  PayoutResult,
  RefundInput,
  RefundResult,
  PaymentProvider,
} from './payment-provider.service'

/**
 * Razorpay payment provider (orders + payouts via the REST API).
 * Activated when PAYMENT_PROVIDER=razorpay and RAZORPAY_KEY_ID/SECRET are set.
 */
@Injectable()
export class RazorpayPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(RazorpayPaymentProvider.name)
  private readonly base = 'https://api.razorpay.com/v1'
  private readonly auth: string

  constructor(private readonly config: ConfigService) {
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID') ?? ''
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET') ?? ''
    this.auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64')
  }

  private async call(path: string, method: string, body: Record<string, unknown>) {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${this.auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      this.logger.warn(`Razorpay ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`)
      throw new Error(`Razorpay API error ${res.status}`)
    }
    return res.json() as Promise<Record<string, unknown>>
  }

  /** Create a payment order representing the escrow amount. */
  async capture(input: CaptureInput): Promise<CaptureResult> {
    try {
      // Razorpay amounts are in paise.
      const order = await this.call('/orders', 'POST', {
        amount: Math.round(input.amount * 100),
        currency: input.currency,
        receipt: input.reference.slice(0, 40),
        notes: input.metadata ?? {},
      })
      return {
        providerRef: String(order.id ?? `rzp_${input.reference}`),
        status: 'succeeded',
        capturedAt: new Date(),
      }
    } catch (e) {
      this.logger.error(`Razorpay order creation failed: ${e instanceof Error ? e.message : e}`)
      return { providerRef: `rzp_fail_${input.reference}`, status: 'failed', capturedAt: new Date() }
    }
  }

  /** Payout to a registered fund account (bank/UPI). */
  async payout(input: PayoutInput): Promise<PayoutResult> {
    try {
      const fundAccount = await this.call('/fund_accounts', 'POST', {
        contact: { name: 'Wagon payout', type: 'customer' },
        account_type: input.destination.upi ? 'vpa' : 'bank_account',
        vpa: input.destination.upi ? { address: input.destination.upi } : undefined,
        bank_account: input.destination.ifsc
          ? {
              name: 'Wagon payout',
              ifsc: input.destination.ifsc,
              account_number: input.destination.account,
            }
          : undefined,
      })
      const payout = await this.call('/payouts', 'POST', {
        fund_account_id: String(fundAccount.id),
        amount: Math.round(input.amount * 100),
        currency: input.currency,
        mode: input.destination.upi ? 'upi' : 'NEFT',
        purpose: 'payout',
        reference_id: input.reference.slice(0, 30),
      })
      return {
        providerRef: String(payout.id ?? `rzp_po_${input.reference}`),
        status: 'succeeded',
        paidAt: new Date(),
      }
    } catch (e) {
      this.logger.error(`Razorpay payout failed: ${e instanceof Error ? e.message : e}`)
      return { providerRef: `rzp_fail_${input.reference}`, status: 'failed', paidAt: new Date() }
    }
  }

  /** Refund a captured payment (payment-id based for orders). */
  async refund(input: RefundInput): Promise<RefundResult> {
    try {
      const paymentId = input.originalProviderRef && input.originalProviderRef.startsWith('pay_')
        ? input.originalProviderRef
        : undefined
      // If we only have an order id, try the refund via the payments list is
      // not possible; fall back to a payment-id-less refund which Razorpay
      // requires a payment_id for — surface as failed so it can be retried
      // with a captured payment id.
      if (!paymentId) {
        this.logger.warn(`Razorpay refund requires a payment id, got ${input.originalProviderRef ?? 'none'}`)
        return { providerRef: `rzp_refund_fail_${input.reference}`, status: 'failed', refundedAt: new Date() }
      }
      const refund = await this.call('/refunds', 'POST', {
        payment_id: paymentId,
        amount: Math.round(input.amount * 100),
        notes: input.metadata ?? {},
      })
      return {
        providerRef: String(refund.id ?? `rzp_refund_${input.reference}`),
        status: 'succeeded',
        refundedAt: new Date(),
      }
    } catch (e) {
      this.logger.error(`Razorpay refund failed: ${e instanceof Error ? e.message : e}`)
      return { providerRef: `rzp_refund_fail_${input.reference}`, status: 'failed', refundedAt: new Date() }
    }
  }
}
