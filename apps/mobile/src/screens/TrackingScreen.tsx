import { useEffect, useRef, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  Map as MapLibreMap,
  Camera,
  GeoJSONSource,
  Layer,
  type CameraRef,
} from '@maplibre/maplibre-react-native'
import { useTheme, palette, spacing, radius, shadows } from '@wagon/design'
import { api } from '../config'
import { getTrackingSocket } from '../socket'
import { useI18n } from '@wagon/i18n'

const MAP_STYLE_URL = 'https://demotiles.maplibre.org/style.json'

interface LocationPoint {
  lat: number
  lng: number
  speedKmh?: number | null
  simulated?: boolean
  recordedAt: string
}

interface Props {
  tripId: string
  onBack: () => void
}

export function TrackingScreen({ tripId, onBack }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [locations, setLocations] = useState<LocationPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const cameraRef = useRef<CameraRef>(null)

  useEffect(() => {
    api
      .get<{ locations: LocationPoint[] }>(`/tracking/${tripId}`)
      .then((res) => setLocations(res.locations))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tripId])

  useEffect(() => {
    const socket = getTrackingSocket()
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    const onLocation = (data: LocationPoint) => {
      setLocations((prev) => [...prev, data].slice(-100))
      cameraRef.current?.jumpTo({ center: [data.lng, data.lat], zoom: 12 })
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('location', onLocation)
    socket.emit('join', { tripId })

    return () => {
      socket.emit('leave', { tripId })
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('location', onLocation)
    }
  }, [tripId])

  const latest = locations[locations.length - 1]
  const routeLine = locations.length >= 2 ? locations.map((p) => [p.lng, p.lat] as [number, number]) : []

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={[styles.back, { color: theme.mutedForeground }]}>←</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.foreground }]}>{t('tracking.title')}</Text>
        <View style={[styles.dot, { backgroundColor: connected ? theme.success : theme.mutedForeground }]} />
      </View>

      <View style={styles.map}>
        <MapLibreMap style={styles.map} mapStyle={MAP_STYLE_URL}>
          <Camera ref={cameraRef} />
          {locations.length >= 2 && (
            <GeoJSONSource
              id="route"
              data={{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: routeLine } }}
            >
              <Layer id="route-line" type="line" paint={{ 'line-color': palette.orange500, 'line-width': 4 }} />
            </GeoJSONSource>
          )}
          {latest && (
            <GeoJSONSource
              id="truck"
              data={{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [latest.lng, latest.lat] } }}
            >
              <Layer id="truck-dot" type="circle" paint={{ 'circle-color': palette.orange600, 'circle-radius': 8 }} />
            </GeoJSONSource>
          )}
        </MapLibreMap>
      </View>

      <View style={[styles.panel, { backgroundColor: theme.background, borderTopColor: theme.border }, shadows.lg]}>
        {loading ? (
          <ActivityIndicator color={theme.primary} />
        ) : latest ? (
          <>
            <View style={styles.liveRow}>
              <View style={[styles.liveDot, { backgroundColor: connected ? theme.success : theme.warning }]} />
              <Text style={[styles.liveLabel, { color: connected ? theme.success : theme.warning }]}>
                {latest.simulated
                  ? 'SIMULATED'
                  : connected ? 'LIVE' : 'LAST UPDATE ' + new Date(latest.recordedAt).toLocaleTimeString()}
              </Text>
            </View>
            <Text style={[styles.coords, { color: theme.foreground }, { fontVariant: ['tabular-nums'] }]}>
              {latest.lat.toFixed(5)}, {latest.lng.toFixed(5)}
            </Text>
            <View style={styles.statsRow}>
              {latest.speedKmh != null && (
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: theme.foreground }, { fontVariant: ['tabular-nums'] }]}>
                    {Math.round(latest.speedKmh)}
                  </Text>
                  <Text style={[styles.statLabel, { color: theme.mutedForeground }]}>{t('tracking.kmh')}</Text>
                </View>
              )}
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: theme.foreground }, { fontVariant: ['tabular-nums'] }]}>
                  {locations.length}
                </Text>
                <Text style={[styles.statLabel, { color: theme.mutedForeground }]}>{t('tracking.updates')}</Text>
              </View>
            </View>
          </>
        ) : (
          <Text style={[styles.waiting, { color: theme.mutedForeground }]}>
            Waiting for the truck to start sharing location…
          </Text>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  back: { fontSize: 20, fontWeight: '600', width: 50 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  map: { flex: 1 },
  panel: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    padding: spacing.xl,
    minHeight: 150,
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  coords: { fontSize: 20, fontWeight: '700', marginTop: spacing.sm },
  statsRow: { flexDirection: 'row', gap: spacing.xxxl, marginTop: spacing.md },
  stat: {},
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 12 },
  waiting: { fontSize: 15 },
})
