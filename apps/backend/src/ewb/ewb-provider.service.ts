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
}

export const EWB_PROVIDER = Symbol('EWB_PROVIDER')

export interface EwbProvider {
  generate(input: GenerateEwbInput): Promise<GenerateEwbResult>
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
    this.logger.log(
      `[mock-ewb] generated ${ewbNumber} for ₹${input.value} (${input.fromPincode ?? '?'}->${input.toPincode ?? '?'})`,
    )
    return { ewbNumber, status: 'generated' }
  }
}
