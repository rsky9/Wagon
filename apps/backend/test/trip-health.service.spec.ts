import { computeTripHealth } from '../src/ai/trip-health.service'

const origin = { lat: 17.385, lng: 78.4867 } // Hyderabad
const destination = { lat: 13.0827, lng: 80.2707 } // Chennai
const startedAt = new Date('2026-08-01T08:00:00Z')

function loc(lat: number, lng: number, minutesFromStart: number, speedKmh: number | null = null) {
  return { lat, lng, speedKmh, recordedAt: new Date(startedAt.getTime() + minutesFromStart * 60000) }
}

describe('computeTripHealth', () => {
  it('healthy trip with steady progress scores healthy', () => {
    const health = computeTripHealth({
      startedAt,
      origin,
      destination,
      geofenceRadiusKm: 1,
      now: new Date(startedAt.getTime() + 120 * 60000),
      locations: [
        loc(origin.lat, origin.lng, 0),
        loc(17.0, 78.9, 60, 45),
        loc(16.6, 79.3, 120, 45),
      ],
    })
    expect(health.band).toBe('healthy')
    expect(health.score).toBeGreaterThanOrEqual(0.75)
    expect(health.flags).toHaveLength(0)
    expect(health.etaMinutes).not.toBeNull()
  })

  it('flags no_ping when the last location is older than the threshold', () => {
    const health = computeTripHealth({
      startedAt,
      origin,
      destination,
      geofenceRadiusKm: 1,
      now: new Date(startedAt.getTime() + 180 * 60000),
      locations: [loc(origin.lat, origin.lng, 0), loc(17.0, 78.9, 30, 40)],
    })
    expect(health.flags.some((f) => f.kind === 'no_ping')).toBe(true)
    expect(health.lastPingMinutesAgo).toBeGreaterThanOrEqual(20)
    expect(health.suggestions.length).toBeGreaterThan(0)
  })

  it('flags stalled when points are inside the radius over the window', () => {
    const health = computeTripHealth({
      startedAt,
      origin,
      destination,
      geofenceRadiusKm: 1,
      now: new Date(startedAt.getTime() + 90 * 60000),
      locations: [
        loc(16.9, 78.8, 20, 30),
        loc(16.901, 78.801, 40, 0),
        loc(16.9, 78.8, 60, 0),
        loc(16.902, 78.8, 80, 0),
      ],
    })
    expect(health.flags.some((f) => f.kind === 'stalled')).toBe(true)
    expect(health.band).not.toBe('healthy')
  })

  it('flags dwell_pickup when still near the origin long after start', () => {
    const health = computeTripHealth({
      startedAt,
      origin,
      destination,
      geofenceRadiusKm: 1,
      now: new Date(startedAt.getTime() + 90 * 60000),
      locations: [loc(origin.lat + 0.002, origin.lng, 60, 0), loc(origin.lat, origin.lng, 85, 0)],
    })
    expect(health.flags.some((f) => f.kind === 'dwell_pickup')).toBe(true)
  })

  it('flags overdue when elapsed exceeds expected duration', () => {
    const health = computeTripHealth({
      startedAt,
      origin,
      destination,
      geofenceRadiusKm: 1,
      now: new Date(startedAt.getTime() + 36 * 60 * 60000), // 36h later
      locations: [loc(origin.lat, origin.lng, 0), loc(16.0, 79.0, 120, 5)],
    })
    expect(health.flags.some((f) => f.kind === 'overdue')).toBe(true)
  })

  it('bounded score and band critical at very low health', () => {
    const health = computeTripHealth({
      startedAt,
      origin,
      destination,
      geofenceRadiusKm: 1,
      now: new Date(startedAt.getTime() + 240 * 60000),
      locations: [
        loc(origin.lat, origin.lng, 0),
        loc(origin.lat + 0.001, origin.lng, 60, 0),
        loc(origin.lat + 0.001, origin.lng, 210, 0),
        loc(origin.lat, origin.lng, 225, 0),
      ],
    })
    expect(health.score).toBeGreaterThanOrEqual(0)
    expect(health.score).toBeLessThanOrEqual(1)
    expect(health.band).toBe('critical')
    expect(health.suggestions.length).toBeGreaterThanOrEqual(2)
  })
})
