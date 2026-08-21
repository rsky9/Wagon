import type { DocumentKind } from '@prisma/client'

/**
 * Role/capability-specific KYC requirements. Every user establishes identity
 * (aadhar + selfie). Financial verification (pan + bank, via Setu) unlocks money
 * movement. Vehicle RC and driver licence (Vahan/DigiLocker) are only required
 * for transporters who haul. Nothing is demanded up-front at onboarding —
 * verification fires when the user initiates a transaction (post load, bid,
 * accept, payout).
 */
const COMMON_DOCS: DocumentKind[] = ['aadhar', 'selfie']
const FINANCIAL_DOCS: DocumentKind[] = ['pan', 'bank']
const TRANSPORTER_DOCS: DocumentKind[] = ['rc', 'license']
const DRIVER_DOCS: DocumentKind[] = ['license']

/** The doc kinds a user must verify, derived from their role/capabilities.
 *  - Identity (everyone): aadhar + selfie (person / face)
 *  - Financial (everyone who transacts money): pan + bank (Setu)
 *  - Operational (transporters/drivers only): vehicle rc + driving licence
 */
export function requiredDocsFor(capabilities: string[]): DocumentKind[] {
  const caps = capabilities.map((c) => c.toLowerCase())
  const set = new Set<DocumentKind>([...COMMON_DOCS, ...FINANCIAL_DOCS])
  if (caps.some((c) => ['transporter', 'driver'].includes(c))) {
    for (const k of TRANSPORTER_DOCS) set.add(k)
  }
  if (caps.some((c) => c === 'driver')) {
    for (const k of DRIVER_DOCS) set.add(k)
  }
  return [...set]
}

/** Financial docs required to initiate a money transaction. */
export function financialDocs(): DocumentKind[] {
  return [...FINANCIAL_DOCS]
}
