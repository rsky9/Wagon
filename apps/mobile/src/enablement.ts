import { api } from './config'
import type {
  Organization,
  Shipment,
  ForwardOrder,
  Consolidation,
  Plan,
  Claim,
  Settlement,
  Facility,
  WarehouseOperation,
  InsurancePolicy,
} from '@wagon/contracts'

/** Thin typed helpers for the enablement platform endpoints. */

export async function myOrganizations(): Promise<Organization[]> {
  const res = await api.get<{ organizations: Organization[] }>('/foundation/organizations')
  return res.organizations
}

export async function listShipments(): Promise<Shipment[]> {
  const res = await api.get<{ shipments: Shipment[] }>('/foundation/shipments')
  return res.shipments
}

export async function createShipment(input: Partial<Shipment>): Promise<Shipment> {
  const res = await api.post<{ shipment: Shipment }>('/foundation/shipments', input)
  return res.shipment
}

export async function listOrders(): Promise<ForwardOrder[]> {
  const res = await api.get<{ orders: ForwardOrder[] }>('/forwarding/orders')
  return res.orders
}

export async function listConsolidations(): Promise<Consolidation[]> {
  const res = await api.get<{ consolidations: Consolidation[] }>('/forwarding/consolidations')
  return res.consolidations
}

export async function listPlans(): Promise<Plan[]> {
  const res = await api.get<{ plans: Plan[] }>('/planning/plans')
  return res.plans
}

export async function listClaims(): Promise<Claim[]> {
  const res = await api.get<{ claims: Claim[] }>('/finance/claims')
  return res.claims
}

export async function listPolicies(): Promise<InsurancePolicy[]> {
  const res = await api.get<{ policies: InsurancePolicy[] }>('/finance/policies')
  return res.policies
}

export async function listSettlements(): Promise<Settlement[]> {
  const res = await api.get<{ settlements: Settlement[] }>('/finance/settlements')
  return res.settlements
}

export async function listFacilities(): Promise<Facility[]> {
  const res = await api.get<{ facilities: Facility[] }>('/storage/facilities')
  return res.facilities
}

export async function listOperations(): Promise<WarehouseOperation[]> {
  const res = await api.get<{ operations: WarehouseOperation[] }>('/storage/operations')
  return res.operations
}

export async function listCountries(): Promise<{ code: string; name: string; currency: string }[]> {
  const res = await api.get<{ countries: { code: string; name: string; currency: string }[] }>('/countries')
  return res.countries
}
