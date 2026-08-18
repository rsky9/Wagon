/**
 * Deterministic city -> lat/lng table for geocoding trucks, loads and searches.
 * Shared by the reference controller and the load-matching engine so a truck's
 * home base and a load's pickup can be compared by distance offline.
 */
export const CITY_COORDS: Record<string, [number, number]> = {
  mumbai: [19.076, 72.8777],
  delhi: [28.6139, 77.209],
  newdelhi: [28.6139, 77.209],
  bangalore: [12.9716, 77.5946],
  bengaluru: [12.9716, 77.5946],
  hyderabad: [17.385, 78.4867],
  chennai: [13.0827, 80.2707],
  kolkata: [22.5726, 88.3639],
  pune: [18.5204, 73.8567],
  ahmedabad: [23.0225, 72.5714],
  jaipur: [26.9124, 75.7873],
  lucknow: [26.8467, 80.9462],
  kanpur: [26.4499, 80.3319],
  nagpur: [21.1458, 79.0882],
  indore: [22.7196, 75.8577],
  bhopal: [23.2599, 77.4126],
  ludhiana: [30.901, 75.8573],
  agra: [27.1767, 78.0081],
  vadodara: [22.3072, 73.1812],
  surat: [21.1702, 72.8311],
  coimbatore: [11.0168, 76.9558],
  madurai: [9.9252, 78.1198],
  vijayawada: [16.5062, 80.648],
  visakhapatnam: [17.6868, 83.2185],
  guwahati: [26.1445, 91.7362],
  patna: [25.5941, 85.1376],
  ranchi: [23.3441, 85.3096],
  bhubaneswar: [20.2961, 85.8245],
  amritsar: [31.634, 74.8723],
  chandigarh: [30.7333, 76.7794],
  mundra: [22.8393, 69.7344],
  kandla: [23.0317, 70.2167],
  jnpt: [18.9512, 72.9523],
  nhava: [18.9512, 72.9523],
  singapore: [1.3521, 103.8198],
}

/** Resolve a free-text place to coordinates, best-effort. */
export function geocodePlace(place?: string | null): [number, number] | null {
  if (!place) return null
  const key = place.trim().toLowerCase().replace(/\s+/g, '')
  if (CITY_COORDS[key]) return CITY_COORDS[key]
  // "Hyderabad, Telangana" -> take the first comma segment.
  const first = place.split(',')[0]?.trim().toLowerCase().replace(/\s+/g, '')
  return (first ? CITY_COORDS[first] : undefined) ?? null
}

/** Great-circle distance in km between two coordinates (haversine). */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

/** Distance between a truck home base and a load pickup (km), null if unknown. */
export function truckToPickupKm(
  truck: { origin?: string | null; lat?: number | null; lng?: number | null },
  load: { pickupAddr?: string; pickupLat?: number | null; pickupLng?: number | null },
): number | null {
  let tCoords: [number, number] | null = null
  if (truck.lat != null && truck.lng != null) tCoords = [truck.lat, truck.lng]
  else tCoords = geocodePlace(truck.origin)
  let lCoords: [number, number] | null = null
  if (load.pickupLat != null && load.pickupLng != null) lCoords = [load.pickupLat, load.pickupLng]
  else lCoords = geocodePlace(load.pickupAddr)
  if (!tCoords || !lCoords) return null
  return haversineKm(tCoords[0], tCoords[1], lCoords[0], lCoords[1])
}
