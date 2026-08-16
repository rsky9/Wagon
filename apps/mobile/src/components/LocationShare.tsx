import { useEffect, useRef, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import * as Location from 'expo-location'
import { useTheme, spacing, radius } from '@wagon/design'
import { api } from '../config'

interface Props {
  tripId: string
}

// Simulated tracking is ONLY allowed for explicit dev/demo builds — never for
// production, where a fabricated truck position would mislead the supplier.
const ALLOW_SIMULATED = process.env.EXPO_PUBLIC_ALLOW_SIMULATED_TRACKING === 'true'

/**
 * Continuously shares the device's location with the backend while an
 * in-transit trip is active. When location permission is unavailable it only
 * falls back to simulated movement in dev/demo builds, and every simulated
 * point is tagged `simulated` so the supplier UI can render it as such.
 */
export function LocationShare({ tripId }: Props) {
  const theme = useTheme()
  const [permission, setPermission] = useState<'granted' | 'denied' | 'checking'>('checking')
  const [lastSent, setLastSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const simIndex = useRef(0)

  const SIM_ROUTE: Array<[number, number]> = [
    [17.385, 78.487],
    [17.2, 78.7],
    [16.9, 79.0],
    [16.6, 79.4],
    [16.3, 79.8],
    [16.1, 80.2],
    [15.9, 80.5],
  ]

  useEffect(() => {
    let cancelled = false
    let watch: Location.LocationSubscription | null = null
    let timer: ReturnType<typeof setInterval> | null = null

    const send = async (lat: number, lng: number, speed?: number | null, simulated = false) => {
      try {
        await api.post(`/tracking/${tripId}/location`, {
          lat,
          lng,
          speedKmh: speed,
          simulated,
        })
        if (!cancelled) {
          setLastSent(`${lat.toFixed(4)}, ${lng.toFixed(4)}${simulated ? ' (simulated)' : ''}`)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to share location')
        }
      }
    }

    const startSimulation = () => {
      timer = setInterval(() => {
        const pt = SIM_ROUTE[simIndex.current % SIM_ROUTE.length]
        simIndex.current += 1
        void send(pt[0], pt[1], 45 + (simIndex.current % 3) * 8, true)
      }, 3000)
    }

    ;(async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (cancelled) return
      if (status !== 'granted') {
        setPermission('denied')
        if (ALLOW_SIMULATED) {
          startSimulation()
        } else {
          setError('Location permission denied — live tracking is off.')
        }
        return
      }
      setPermission('granted')
      watch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 200, timeInterval: 3000 },
        (pos) => void send(pos.coords.latitude, pos.coords.longitude, pos.coords.speed),
      )
    })()

    return () => {
      cancelled = true
      watch?.remove()
      if (timer) clearInterval(timer)
    }
  }, [tripId])

  return (
    <View style={[styles.box, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: theme.success }]} />
        <Text style={[styles.title, { color: theme.foreground }]}>
          {permission === 'checking'
            ? 'Requesting location…'
            : permission === 'granted'
              ? 'Sharing live location'
              : ALLOW_SIMULATED
                ? 'Simulated tracking (no permission)'
                : 'Location permission denied'}
        </Text>
      </View>
      {lastSent && <Text style={[styles.last, { color: theme.mutedForeground }]}>Last update: {lastSent}</Text>}
      {error && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}
      <Text style={[styles.hint, { color: theme.mutedForeground }]}>
        Keep this screen open while the truck is in transit. The supplier sees your position live.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { fontSize: 15, fontWeight: '700' },
  last: { fontSize: 13, marginTop: spacing.sm },
  error: { fontSize: 13, marginTop: spacing.sm },
  hint: { fontSize: 12, marginTop: spacing.sm, lineHeight: 16 },
})
