import type { Load, Paged, Quote, UserProfile } from './models'
import type {
  Claim,
  Consolidation,
  ForwardOrder,
  LogisticsEvent,
  Organization,
  Plan,
  PlanLeg,
  Settlement,
  Shipment,
  ShipmentLeg,
  ShipmentStatus,
} from './enablement'

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

// ---------- Enablement platform API types ----------

// Foundation
export type CreateOrganizationRequest = { name: string; kind: Organization['kind']; countryCode?: string }
export type CreateOrganizationResponse = { organization: Organization }
export type MyOrganizationsResponse = { organizations: (Organization & { myRole: string })[] }

export type CreateShipmentRequest = Partial<Omit<Shipment, 'id' | 'ref' | 'status' | 'createdAt' | 'updatedAt'>>
export type CreateShipmentResponse = { shipment: Shipment }
export type ListShipmentsResponse = { shipments: Shipment[]; total: number; page: number; pageSize: number }
export type ShipmentDetailResponse = { shipment: Shipment & { legs: ShipmentLeg[]; plans: Plan[]; forwardOrder?: ForwardOrder | null } }

export type AddLegRequest = Partial<Omit<ShipmentLeg, 'id' | 'shipmentId' | 'createdAt'>>
export type TransitionShipmentRequest = { status: ShipmentStatus }

export type ListEventsResponse = { events: LogisticsEvent[] }

// Planning
export type ProposePlanRequest = {
  shipmentId: string
  source?: string
  legs: PlanLeg[]
  currency?: string
  cost?: number
  etaHours?: number
  riskScore?: number
}

// Forwarding
export type CreateForwardOrderRequest = { customerId?: string; shipmentId: string; buyAmount?: number; sellAmount?: number; currency?: string; notes?: string }
export type CreateConsolidationRequest = { mode?: string; origin?: string; destination?: string; equipment?: string; orderIds?: string[] }

// Finance
export type FileClaimRequest = { shipmentId: string; reason: string; amount?: number; currency?: string; notes?: string }
export type AssessClaimRequest = { recommendedAmount?: number; notes?: string }
export type CreateSettlementRequest = { shipmentId: string; payerId?: string; payeeId?: string; type: string; amount?: number; currency?: string }

// AI
export type RecommendPlanRequest = { shipmentId: string; options: PlanOption[]; constraints?: PlanConstraints }
export type PlanOption = PlanLeg & { name?: string }
export type PlanConstraints = { maxBudget?: number; maxEtaHours?: number; modes?: string[]; preference?: 'cheapest' | 'fastest' | 'balanced' }

// Integrations
export type CreateWebhookRequest = { name: string; url: string; eventTypes: string[] }
export type CreateConnectorRequest = { kind: string; name: string; baseUrl?: string; apiKeyRef?: string; config?: unknown }

// Global
export type ConvertResponse = { from: string; to: string; amount: number; rate: number; converted: number }
