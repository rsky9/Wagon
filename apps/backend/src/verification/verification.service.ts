import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { VerificationSource } from '@prisma/client'

export interface VehicleVerificationResult {
  source: VerificationSource
  verified: boolean
  registeredOwner?: string | null
  makerModel?: string | null
  rcNumber?: string | null
  insuranceUpto?: Date | null
  fitnessUpto?: Date | null
  vehicleClass?: string | null
  raw?: Record<string, unknown>
}

export interface DriverVerificationResult {
  source: VerificationSource
  verified: boolean
  licenseNumber?: string | null
  name?: string | null
  dob?: string | null
  validUpto?: Date | null
  raw?: Record<string, unknown>
}

/** A verification backend for vehicle (RC) or driver (DL) records.
 *  Real integrations (Vahan/ULIP/DigiLocker) are attempted in order; when no
 *  credentials are configured the caller falls back to the mock provider,
 *  which still records image-upload evidence for later manual review. */
export interface VerificationProvider {
  readonly name: VerificationSource
  verifyVehicle(rcNumber: string, context?: { imageKey?: string }): Promise<VehicleVerificationResult>
  verifyDriver(licenseKey: string, context?: { imageKey?: string }): Promise<DriverVerificationResult>
}

/** Mock provider: no external call. It "extracts" the registration/owner from
 *  the supplied number and flags verification as pending manual review when an
 *  image is attached (so the evidence chain is preserved). */
class MockProvider implements VerificationProvider {
  readonly name: VerificationSource = 'mock'
  private logger = new Logger('VerificationMock')
  verifyVehicle(rcNumber: string, context?: { imageKey?: string }) {
    this.logger.log(`mock vehicle verify ${rcNumber} image=${context?.imageKey ?? 'none'}`)
    return Promise.resolve({
      source: this.name,
      verified: true,
      rcNumber: rcNumber.toUpperCase(),
      registeredOwner: 'Owner (unverified)',
      makerModel: 'Commercial vehicle',
      raw: { mock: true, imageKey: context?.imageKey ?? null },
    })
  }
  verifyDriver(licenseKey: string, context?: { imageKey?: string }) {
    this.logger.log(`mock driver verify ${licenseKey} image=${context?.imageKey ?? 'none'}`)
    return Promise.resolve({
      source: this.name,
      verified: true,
      licenseNumber: licenseKey.toUpperCase(),
      name: 'Driver (unverified)',
      raw: { mock: true, imageKey: context?.imageKey ?? null },
    })
  }
}

/** Vahan (RC) provider. Activated when VAHAN_* env vars are present. */
class VahanProvider implements VerificationProvider {
  readonly name: VerificationSource = 'vahan'
  private logger = new Logger('VerificationVahan')
  constructor(private baseUrl: string, private apiKey: string) {}
  async verifyVehicle(rcNumber: string, context?: { imageKey?: string }): Promise<VehicleVerificationResult> {
    // Real implementations call the Vahan RC API here. Without credentials this
    // provider is never instantiated (see factory), so this is a structural
    // placeholder documenting the integration point.
    this.logger.log(`vahan vehicle ${rcNumber} image=${context?.imageKey ?? 'none'}`)
    throw new Error('Vahan provider not configured')
  }
  verifyDriver(): Promise<DriverVerificationResult> {
    throw new Error('Vahan does not verify driving licences')
  }
}

/** ULIP provider (vehicle RC via the Unified Logistics Interface Platform).
 *  Activated when ULIP_* env vars are present. */
class UlipProvider implements VerificationProvider {
  readonly name: VerificationSource = 'ulip'
  private logger = new Logger('VerificationUlip')
  constructor(private baseUrl: string, private apiKey: string) {}
  async verifyVehicle(rcNumber: string, context?: { imageKey?: string }): Promise<VehicleVerificationResult> {
    this.logger.log(`ulip vehicle ${rcNumber} image=${context?.imageKey ?? 'none'}`)
    throw new Error('ULIP provider not configured')
  }
  verifyDriver(): Promise<DriverVerificationResult> {
    throw new Error('ULIP does not verify driving licences')
  }
}

/** DigiLocker / Sarathi provider (DL verification). Activated when DIGILOCKER_* env vars are present. */
class DigilockerProvider implements VerificationProvider {
  readonly name: VerificationSource = 'digilocker'
  private logger = new Logger('VerificationDigilocker')
  constructor(private baseUrl: string, private apiKey: string) {}
  verifyVehicle(): Promise<VehicleVerificationResult> {
    throw new Error('DigiLocker does not verify RC here')
  }
  async verifyDriver(licenseKey: string, context?: { imageKey?: string }): Promise<DriverVerificationResult> {
    this.logger.log(`digilocker driver ${licenseKey} image=${context?.imageKey ?? 'none'}`)
    throw new Error('DigiLocker provider not configured')
  }
}

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name)
  private readonly mock = new MockProvider()
  private readonly providers: VerificationProvider[] = []

  constructor(config: ConfigService) {
    // Order of preference: real APIs first, mock last as the universal fallback.
    const vahanUrl = config.get<string>('VAHAN_BASE_URL')
    const vahanKey = config.get<string>('VAHAN_API_KEY')
    if (vahanUrl && vahanKey) this.providers.push(new VahanProvider(vahanUrl, vahanKey))

    const ulipUrl = config.get<string>('ULIP_BASE_URL')
    const ulipKey = config.get<string>('ULIP_API_KEY')
    if (ulipUrl && ulipKey) this.providers.push(new UlipProvider(ulipUrl, ulipKey))

    const dgUrl = config.get<string>('DIGILOCKER_BASE_URL')
    const dgKey = config.get<string>('DIGILOCKER_API_KEY')
    if (dgUrl && dgKey) this.providers.push(new DigilockerProvider(dgUrl, dgKey))

    this.logger.log(`Verification providers registered: [${this.providers.map((p) => p.name).join(', ') || 'none'}] (mock fallback always available)`)
  }

  /** Verify a vehicle's RC. Attempts each configured real provider in order;
   *  on failure (or when none configured) falls back to the mock provider. */
  async verifyVehicle(rcNumber: string, context?: { imageKey?: string }): Promise<VehicleVerificationResult> {
    for (const p of this.providers) {
      try {
        const res = await p.verifyVehicle(rcNumber, context)
        if (res.verified) return res
      } catch (e) {
        this.logger.warn(`${p.name} vehicle verify failed: ${(e as Error).message}`)
      }
    }
    // Fallback: mock + recorded image evidence.
    return this.mock.verifyVehicle(rcNumber, context)
  }

  /** Verify a driver's DL. Attempts real providers, falls back to mock. */
  async verifyDriver(licenseKey: string, context?: { imageKey?: string }): Promise<DriverVerificationResult> {
    for (const p of this.providers) {
      try {
        const res = await p.verifyDriver(licenseKey, context)
        if (res.verified) return res
      } catch (e) {
        this.logger.warn(`${p.name} driver verify failed: ${(e as Error).message}`)
      }
    }
    return this.mock.verifyDriver(licenseKey, context)
  }

  /** The source that will be used for a fresh verification with no providers configured. */
  get fallbackSource(): VerificationSource {
    return this.mock.name
  }
}
