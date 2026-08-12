import type {
  DocumentKind,
  KycStatus,
  KycTier,
  LanguageCode,
  LoadStatus,
  PaymentMethod,
  PaymentType,
  TripStatus,
  TruckType,
  UserRole,
} from './domain'

export interface Material {
  id: string
  name: string
  imageKey?: string
  imageUrl?: string
  status?: boolean
}

export interface TruckModel {
  id: string
  type: TruckType
  model: string
  capacities: number[]
}

export interface Load {
  id: string
  supplierId: string
  pickupAddr: string
  dropAddr: string
  haltAddr?: string | null
  pickupLat: number
  pickupLng: number
  dropLat: number
  dropLng: number
  haltLat?: number | null
  haltLng?: number | null
  date: string
  truckType: TruckType
  modelId: string
  weight: number
  distanceKm: number
  materialId: string
  material?: Material | null
  description?: string | null
  noOfTrucks: number
  fareEstimate: number
  payLater: boolean
  ewbNumber?: string | null
  cancelReason?: string | null
  commercialModel?: 'fixed_rate' | 'open_bidding' | 'invite'
  referenceRate?: number | null
  biddingDeadline?: string | null
  advancePct?: number | null
  paymentTerms?: string | null
  extraCharges?: string | null
  status: LoadStatus
  createdAt: string
}

export interface Quote {
  id: string
  loadId: string
  transporterId: string
  amount: number
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: string
}

export interface Trip {
  id: string
  loadId: string
  transporterId: string
  status: TripStatus
  podUrl?: string
  startedAt?: string
  deliveredAt?: string
}

export interface Payment {
  id: string
  tripId: string
  type: PaymentType
  amount: number
  method: PaymentMethod
  providerRef?: string
  status: 'pending' | 'succeeded' | 'failed'
  createdAt: string
}

export interface KycDocument {
  id: string
  userId: string
  kind: DocumentKind
  storageKey: string
  status: KycStatus
  adminNote?: string
  verifiedAt?: string
}

export interface UserProfile {
  id: string
  role: UserRole
  mobile: string
  lang: LanguageCode
  tier: KycTier
  kycStatus: KycStatus
  name?: string
  rating?: number
  tripsCompleted: number
  verified: boolean
  supplierVerified?: boolean
  transporterVerified?: boolean
  capabilities?: string[]
}

export interface Notification {
  id: string
  userId: string
  type: string
  title: string
  body: string
  isRead: boolean
  data?: Record<string, unknown>
  createdAt: string
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
