import { Injectable, Logger } from '@nestjs/common'

export interface GenerateEwbInput {
  supplierGst?: string | null
  transporterGst?: string | null
  fromPincode?: string
  toPincode?: string
  value: number
}

export interface GenerateEwbResult {
  ewbNumber: string
  status: 'generated'
  validUntil: Date
  docKey: string
}

export interface CancelEwbInput {
  ewbNumber: string
  reason?: string
}

export interface CancelEwbResult {
  ewbNumber: string
  cancelledAt: Date
}

export interface ExtendEwbResult {
  ewbNumber: string
  validUntil: Date
}

export const EWB_PROVIDER = Symbol('EWB_PROVIDER')

export interface EwbProvider {
  generate(input: GenerateEwbInput): Promise<GenerateEwbResult>
  cancel(input: CancelEwbInput): Promise<CancelEwbResult>
  extend(ewbNumber: string): Promise<ExtendEwbResult>
}

/**
 * Mock e-way bill provider. E-way bills are legally required for inter-state
 * movement of goods >₹50,000 (GST regime). Swap for the GSTN/NIC e-way bill API
 * behind this interface when going live.
 */
@Injectable()
export class MockEwbProvider implements EwbProvider {
  private readonly logger = new Logger(MockEwbProvider.name)

  async generate(input: GenerateEwbInput): Promise<GenerateEwbResult> {
    const ewbNumber = `EWB${String(Date.now()).slice(-12)}`
    const validUntil = new Date(Date.now() + 24 * 3600000) // 24h validity per distance slab
    this.logger.log(
      `[mock-ewb] generated ${ewbNumber} for ₹${input.value} (${input.fromPincode ?? '?'}->${input.toPincode ?? '?'}) valid until ${validUntil.toISOString()}`,
    )
    return { ewbNumber, status: 'generated', validUntil, docKey: `${ewbNumber}.pdf` }
  }

  async cancel(input: CancelEwbInput): Promise<CancelEwbResult> {
    this.logger.log(`[mock-ewb] cancelled ${input.ewbNumber} (${input.reason ?? 'no reason'})`)
    return { ewbNumber: input.ewbNumber, cancelledAt: new Date() }
  }

  async extend(ewbNumber: string): Promise<ExtendEwbResult> {
    const validUntil = new Date(Date.now() + 24 * 3600000)
    this.logger.log(`[mock-ewb] extended ${ewbNumber} valid until ${validUntil.toISOString()}`)
    return { ewbNumber, validUntil }
  }
}
