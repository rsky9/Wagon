export const USER_ROLES = ['supplier', 'transporter', 'admin'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const TRUCK_TYPES = ['open', 'container', 'trailer'] as const
export type TruckType = (typeof TRUCK_TYPES)[number]

export const LOAD_STATUSES = [
  'posted',
  'paused',
  'interested',
  'accepted',
  'in_transit',
  'delivered',
  'completed',
  'cancelled',
] as const
export type LoadStatus = (typeof LOAD_STATUSES)[number]

export const TRIP_STATUSES = [
  'accepted',
  'in_transit',
  'delivered',
  'cancelled',
] as const
export type TripStatus = (typeof TRIP_STATUSES)[number]

export const PAYMENT_TYPES = ['escrow', 'payout', 'refund'] as const
export type PaymentType = (typeof PAYMENT_TYPES)[number]

export const PAYMENT_METHODS = ['mock', 'upi'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const KYC_STATUSES = ['not_started', 'pending', 'approved', 'rejected'] as const
export type KycStatus = (typeof KYC_STATUSES)[number]

export const KYC_TIERS = ['basic', 'kyc_lite', 'kyc_full'] as const
export type KycTier = (typeof KYC_TIERS)[number]

export const DOCUMENT_KINDS = [
  'pan',
  'aadhar',
  'rc',
  'license',
  'bank',
  'selfie',
  'company',
] as const
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export const LANGUAGES = [
  'en',
  'hi',
  'bn',
  'mr',
  'te',
  'ta',
  'gu',
  'ur',
  'kn',
  'od',
  'ml',
] as const
export type LanguageCode = (typeof LANGUAGES)[number]
