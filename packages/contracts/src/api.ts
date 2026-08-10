import type { Load, Paged, Quote, UserProfile } from './models'

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

export type SendOtpRequest = { mobile: string; channel?: 'sms' | 'whatsapp' }
export type SendOtpResponse = { requestId: string; expiresIn: number }

export type VerifyOtpRequest = { mobile: string; code: string; requestId: string }
export type VerifyOtpResponse = {
  accessToken: string
  refreshToken: string
  profile: UserProfile
  isNewUser: boolean
}

export type RefreshRequest = { refreshToken: string }
export type RefreshResponse = { accessToken: string; refreshToken: string }

export type RegisterFcmRequest = {
  token: string
  deviceId: string
  platform: 'android' | 'ios'
}

export type UploadKycRequest = {
  kind: string
  fileName: string
  mimeType: string
  size: number
}
export type UploadKycResponse = { uploadUrl: string; documentId: string }

export type CreateLoadRequest = Omit<Load, 'id' | 'status' | 'createdAt'>
export type CreateLoadResponse = { load: Load }

export type ListLoadsQuery = {
  truckType?: string
  modelId?: string
  fromLane?: string
  date?: string
  page?: number
  pageSize?: number
}
export type ListLoadsResponse = Paged<Load>

export type CreateQuoteRequest = { loadId: string; amount: number }
export type CreateQuoteResponse = { quote: Quote }

export type AcceptLoadRequest = { loadId: string }
export type AcceptLoadResponse = { tripId: string }

export type UpdateTripStatusRequest = { status: 'in_transit' | 'delivered' }

export type UploadPodRequest = { fileName: string; mimeType: string; size: number }
export type UploadPodResponse = { uploadUrl: string }

export type CreateEscrowRequest = { tripId: string; amount: number }
export type CreateEscrowResponse = { paymentId: string; status: string }

export type ReleasePayoutRequest = { tripId: string }
export type ReleasePayoutResponse = { paymentId: string; status: string }
