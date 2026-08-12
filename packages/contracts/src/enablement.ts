// Enablement platform models — Phase 0–8
// Mirrors apps/backend/prisma/schema.prisma entities for typed clients.

export interface Organization {
  id: string
  name: string
  kind: 'shipper' | 'transporter' | 'forwarder' | 'warehouse' | 'carrier' | 'broker' | 'other'
  gst?: string | null
  countryCode: string
  verified: boolean
  createdAt: string
  updatedAt: string
}

export interface OrganizationMember {
  id: string
  organizationId: string
  userId: string
  role: 'owner' | 'admin' | 'operator' | 'member'
  createdAt: string
}

export type ShipmentStatus = 'draft' | 'planned' | 'quoted' | 'booked' | 'in_transit' | 'delivered' | 'closed' | 'cancelled'

export interface Shipment {
  id: string
  ref: string
  ownerOrgId?: string | null
  originId?: string | null
  destinationId?: string | null
  commodity?: string | null
  description?: string | null
  weightKg?: number | null
  volumeM3?: number | null
  pieces?: number | null
  pickupWindow?: string | null
  deliveryWindow?: string | null
  value?: number | null
  status: ShipmentStatus
  mode: string
  activePlanId?: string | null
  createdAt: string
  updatedAt: string
  legs?: ShipmentLeg[]
}

export interface ShipmentLeg {
  id: string
  shipmentId: string
  sequence: number
  mode: string
  originId?: string | null
  destinationId?: string | null
  pickupAddr?: string | null
  dropAddr?: string | null
  distanceKm?: number | null
  equipment?: string | null
  providerId?: string | null
  status: string
  createdAt: string
}

export interface LogisticsEvent {
  id: string
  eventType: string
  eventCode: string
  classifier: string
  entityType: string
  entityId: string
  orgId?: string | null
  shipmentId?: string | null
  legId?: string | null
  occurredAt: string
  source: string
  actorId?: string | null
  location?: string | null
  confidence: number
  correlationId?: string | null
  payload?: Record<string, unknown> | null
}

export interface Plan {
  id: string
  shipmentId: string
  ref: string
  source: string
  legs: PlanLeg[]
  cost?: number | null
  currency: string
  etaHours?: number | null
  riskScore: number
  status: 'proposed' | 'selected' | 'superseded' | 'declined'
  selectedBy?: string | null
  selectedAt?: string | null
  createdAt: string
}

export interface PlanLeg {
  mode: string
  equipment?: string
  carrier?: string
  providerId?: string
  origin?: string
  destination?: string
  cost?: number
  etaHours?: number
  departure?: string
}

export interface ForwardOrder {
  id: string
  forwarderId: string
  customerId?: string | null
  shipmentId: string
  ref: string
  status: 'intake' | 'consolidated' | 'booked' | 'in_transit' | 'delivered' | 'closed' | 'cancelled'
  buyAmount?: number | null
  sellAmount?: number | null
  currency: string
  consolidationId?: string | null
  notes?: string | null
  createdAt: string
}

export interface Consolidation {
  id: string
  ref: string
  forwarderId: string
  shipmentId?: string | null
  mode: string
  origin?: string | null
  destination?: string | null
  equipment?: string | null
  cargoWeightKg?: number | null
  cargoVolumeM3?: number | null
  cargoPieces?: number | null
  status: 'grouping' | 'ready' | 'booked' | 'in_transit' | 'delivered' | 'closed'
  bookedCarrierId?: string | null
  createdAt: string
}

export interface CarrierBooking {
  id: string
  shipmentId: string
  legId?: string | null
  carrierId?: string | null
  bookingRef?: string | null
  vessel?: string | null
  voyage?: string | null
  flight?: string | null
  equipment?: string | null
  rate?: number | null
  currency: string
  status: 'requested' | 'confirmed' | 'cancelled'
  createdAt: string
}

export interface ForwardDocument {
  id: string
  shipmentId: string
  kind: string
  number?: string | null
  storageKey?: string | null
  status: 'draft' | 'issued' | 'cleared'
  createdAt: string
}

export interface Facility {
  id: string
  name: string
  kind: string
  operatorId?: string | null
  address?: string | null
  city?: string | null
  capacitySlots: number
  createdAt: string
}

export interface WarehouseOperation {
  id: string
  facilityId: string
  shipmentId?: string | null
  ref: string
  status: string
  operatorId?: string | null
  appointmentAt?: string | null
  createdAt: string
}

export interface Claim {
  id: string
  shipmentId: string
  claimantId?: string | null
  handlerId?: string | null
  reason: string
  amount?: number | null
  currency: string
  status: 'filed' | 'assessed' | 'approved' | 'rejected'
  decision?: string | null
  decidedAt?: string | null
  notes?: string | null
  createdAt: string
}

export interface InsurancePolicy {
  id: string
  shipmentId: string
  insurerId?: string | null
  policyRef: string
  premium?: number | null
  coverage?: number | null
  currency: string
  status: string
  createdAt: string
}

export interface Settlement {
  id: string
  shipmentId: string
  payerId?: string | null
  payeeId?: string | null
  type: string
  amount?: number | null
  currency: string
  status: 'due' | 'cleared'
  settledAt?: string | null
  createdAt: string
}

export interface RiskAssessment {
  id: string
  shipmentId: string
  score: number
  factors: Record<string, unknown>
  assessedBy?: string | null
  createdAt: string
}

export interface AiRecommendation {
  id: string
  agent: string
  entityType: string
  entityId: string
  summary: string
  score?: number | null
  output: Record<string, unknown> | unknown[]
  constraints?: Record<string, unknown> | null
  rationale?: Record<string, unknown> | null
  guardrails?: Record<string, unknown> | null
  status: 'proposed' | 'accepted' | 'dismissed'
  createdBy?: string | null
  createdAt: string
}

export interface IntegrationConnector {
  id: string
  orgId: string
  kind: string
  name: string
  baseUrl?: string | null
  status: string
  lastSyncAt?: string | null
  createdAt: string
}

export interface WebhookSubscription {
  id: string
  orgId: string
  name: string
  url: string
  eventTypes: string[]
  status: 'active' | 'paused'
  createdAt: string
}

export interface WebhookDelivery {
  id: string
  subscriptionId: string
  eventCode: string
  payload?: Record<string, unknown> | null
  status: 'pending' | 'sent' | 'failed' | 'dead'
  attempts: number
  responseStatus?: number | null
  createdAt: string
}

export interface CountryPack {
  id: string
  code: string
  name: string
  currency: string
  baseCurrency: string
  exchangeRateToBase?: number | null
  language: string
  unitSystem: string
  customsRegime: string
  documentRequirements?: string[] | null
  incotermsSupported?: string[] | null
  enabled: boolean
  createdAt: string
}
