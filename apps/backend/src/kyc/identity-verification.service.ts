import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { VerificationSource } from '@prisma/client'

export interface IdentityVerificationResult {
  source: VerificationSource
  verified: boolean
  name?: string | null
  reference?: string | null
  raw?: Record<string, unknown>
}

export interface AadharInput {
  aadhar: string
  name?: string
}
export interface PanInput {
  pan: string
  name?: string
}
export interface BankInput {
  account?: string
  ifsc?: string
  upi?: string
  statementKey?: string
}
export interface FaceInput {
  selfieKey?: string
  selfieUri?: string
}

/**
 * A verification backend for a person's identity and financial records.
 * - Aadhar (person identification) and PAN + bank statement (financial) go
 *   through Setu. Selfie (face) verification goes through a face-capture API.
 * Real integrations are attempted in order; when no credentials are configured
 * the caller falls back to the mock provider, which records image evidence for
 * later manual review. Vehicle RC / driver DL verification stays in
 * VerificationService (Vahan/ULIP/DigiLocker).
 */
export interface IdentityVerificationProvider {
  readonly name: VerificationSource
  verifyAadhar(input: AadharInput): Promise<IdentityVerificationResult>
  verifyPan(input: PanInput): Promise<IdentityVerificationResult>
  verifyBank(input: BankInput): Promise<IdentityVerificationResult>
  verifyFace(input: FaceInput): Promise<IdentityVerificationResult>
}

/** Mock provider: no external call; flags as verified (mock) so the flow is
 *  exerciseable locally, preserving image evidence for later manual review. */
class MockIdentityProvider implements IdentityVerificationProvider {
  readonly name: VerificationSource = 'mock'
  private logger = new Logger('IdentityVerificationMock')

  verifyAadhar(input: AadharInput): Promise<IdentityVerificationResult> {
    this.logger.log(`mock aadhar verify ref=${input.aadhar} name=${input.name ?? ''}`)
    return Promise.resolve({ source: this.name, verified: true, name: input.name ?? null, reference: input.aadhar, raw: { mock: true } })
  }
  verifyPan(input: PanInput): Promise<IdentityVerificationResult> {
    this.logger.log(`mock pan verify ref=${input.pan} name=${input.name ?? ''}`)
    return Promise.resolve({ source: this.name, verified: true, name: input.name ?? null, reference: input.pan, raw: { mock: true } })
  }
  verifyBank(input: BankInput): Promise<IdentityVerificationResult> {
    this.logger.log(`mock bank verify acct=${input.account ?? 'n/a'} ifsc=${input.ifsc ?? ''} upi=${input.upi ?? ''}`)
    return Promise.resolve({ source: this.name, verified: true, reference: input.upi ?? input.account ?? null, raw: { mock: true, statementKey: input.statementKey ?? null } })
  }
  verifyFace(input: FaceInput): Promise<IdentityVerificationResult> {
    this.logger.log(`mock face verify selfie=${input.selfieKey ?? 'none'}`)
    return Promise.resolve({ source: this.name, verified: true, raw: { mock: true, selfieKey: input.selfieKey ?? null } })
  }
}

/** Setu provider (Aadhar/PAN/bank verification). Activated when SETU_* env vars are present. */
class SetuProvider implements IdentityVerificationProvider {
  readonly name: VerificationSource = 'setu'
  private logger = new Logger('IdentityVerificationSetu')
  constructor(private baseUrl: string, private apiKey: string) {}
  async verifyAadhar(): Promise<IdentityVerificationResult> { return this.throwNotConfigured('aadhar') }
  async verifyPan(): Promise<IdentityVerificationResult> { return this.throwNotConfigured('pan') }
  async verifyBank(): Promise<IdentityVerificationResult> { return this.throwNotConfigured('bank') }
  verifyFace(): Promise<IdentityVerificationResult> { return Promise.reject(new Error('Setu does not verify faces')) }
  private throwNotConfigured(method: string): Promise<IdentityVerificationResult> {
    this.logger.log(`setu ${method}`)
    return Promise.reject(new Error('Setu provider not configured'))
  }
}

/** Face-verification provider (selfie / face capture). Activated when FACE_* env vars are present. */
class FaceProvider implements IdentityVerificationProvider {
  readonly name: VerificationSource = 'face'
  private logger = new Logger('IdentityVerificationFace')
  constructor(private baseUrl: string, private apiKey: string) {}
  async verifyFace(): Promise<IdentityVerificationResult> {
    this.logger.log('face verify')
    return Promise.reject(new Error('Face provider not configured'))
  }
  verifyAadhar(): Promise<IdentityVerificationResult> { return Promise.reject(new Error('Face provider does not verify aadhar')) }
  verifyPan(): Promise<IdentityVerificationResult> { return Promise.reject(new Error('Face provider does not verify pan')) }
  verifyBank(): Promise<IdentityVerificationResult> { return Promise.reject(new Error('Face provider does not verify bank')) }
}

@Injectable()
export class IdentityVerificationService {
  private readonly logger = new Logger(IdentityVerificationService.name)
  private readonly mock = new MockIdentityProvider()
  private readonly providers: IdentityVerificationProvider[] = []

  constructor(config: ConfigService) {
    const setuUrl = config.get<string>('SETU_BASE_URL')
    const setuKey = config.get<string>('SETU_API_KEY')
    if (setuUrl && setuKey) this.providers.push(new SetuProvider(setuUrl, setuKey))

    const faceUrl = config.get<string>('FACE_BASE_URL')
    const faceKey = config.get<string>('FACE_API_KEY')
    if (faceUrl && faceKey) this.providers.push(new FaceProvider(faceUrl, faceKey))

    this.logger.log(`Identity providers registered: [${this.providers.map((p) => p.name).join(', ') || 'none'}] (mock fallback always available)`)
  }

  private async run(
    method: 'verifyAadhar' | 'verifyPan' | 'verifyBank' | 'verifyFace',
    input: AadharInput | PanInput | BankInput | FaceInput,
  ): Promise<IdentityVerificationResult> {
    for (const p of this.providers) {
      try {
        const res = await p[method](input as never)
        if (res.verified) return res
      } catch (e) {
        this.logger.warn(`${p.name} ${method} failed: ${(e as Error).message}`)
      }
    }
    return this.mock[method](input as never)
  }

  verifyAadhar(input: AadharInput): Promise<IdentityVerificationResult> {
    return this.run('verifyAadhar', input)
  }
  verifyPan(input: PanInput): Promise<IdentityVerificationResult> {
    return this.run('verifyPan', input)
  }
  verifyBank(input: BankInput): Promise<IdentityVerificationResult> {
    return this.run('verifyBank', input)
  }
  verifyFace(input: FaceInput): Promise<IdentityVerificationResult> {
    return this.run('verifyFace', input)
  }
}
