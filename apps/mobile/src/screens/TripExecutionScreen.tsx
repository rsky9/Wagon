import { SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, ScrollView, Pressable, Alert } from 'react-native'
import { useTheme, spacing, radius, formatINR } from '@wagon/design'
import { StatusChip, Button, StatusStepper, type StatusTone } from '@wagon/components'
import { api } from '../config'

interface TripDetail {
  id: string
  stage: string
  status: string
  podUrl?: string | null
  pickupOtpAt?: string | null
  deliveryOtpAt?: string | null
  load: {
    id: string
    pickupAddr: string
    dropAddr: string
    weight: number
    distanceKm: number
    fareEstimate: number
    material?: { name: string } | null
  }
}

interface Props {
  tripId: string
  onBack: () => void
  onExceptions?: () => void
}

const STAGE_FLOW: Array<{ key: string; label: string }> = [
  { key: 'accepted', label: 'Accepted' },
  { key: 'enroute_pickup', label: 'En route to pickup' },
  { key: 'arrived_pickup', label: 'Arrived at pickup' },
  { key: 'loading', label: 'Loading' },
  { key: 'loaded', label: 'Goods loaded' },
  { key: 'enroute_drop', label: 'In transit' },
  { key: 'arrived_drop', label: 'Arrived at destination' },
  { key: 'unloading', label: 'Unloading' },
  { key: 'delivered', label: 'Delivered' },
]

const TONE: Record<string, StatusTone> = {
  accepted: 'info',
  enroute_pickup: 'brand',
  arrived_pickup: 'brand',
  loading: 'brand',
  loaded: 'info',
  enroute_drop: 'brand',
  arrived_drop: 'brand',
  unloading: 'brand',
  delivered: 'success',
}

export function TripExecutionScreen({ tripId, onBack, onExceptions }: Props) {
  const theme = useTheme()
  const [trip, setTrip] = useState<TripDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const fetch = () => {
    api.get<{ trips: TripDetail[] }>('/trips/mine')
      .then((res) => {
        const t = res.trips.find((x) => x.id === tripId)
        setTrip(t ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetch() }, [tripId])

  if (loading) {
    return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}><View style={styles.center}><Text style={{ color: theme.mutedForeground }}>Loading trip…</Text></View></SafeAreaView>
  }

  if (!trip) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <Header onBack={onBack} title="Trip execution" theme={theme} />
        <View style={styles.center}><Text style={{ color: theme.mutedForeground }}>Trip not found.</Text></View>
      </SafeAreaView>
    )
  }

  const currentIdx = STAGE_FLOW.findIndex((s) => s.key === trip.stage)
  const isDelivered = trip.stage === 'delivered'
  const needsPickupOtp = trip.stage === 'arrived_pickup' && !trip.pickupOtpAt
  const needsDeliveryOtp = trip.stage === 'arrived_drop' && !trip.deliveryOtpAt

  const advance = async () => {
    setBusy(true)
    try {
      await api.post(`/trips/${tripId}/advance`)
      fetch()
    } catch (e) {
      Alert.alert('Cannot advance', e instanceof Error ? e.message : 'Failed')
    } finally { setBusy(false) }
  }

  const generateOtp = async (kind: 'pickup' | 'delivery') => {
    setBusy(true)
    try {
      const res = await api.post<{ devCode: string }>(`/trips/${tripId}/otp/${kind}`)
      Alert.alert(`${kind} OTP`, `Share this code with the supplier: ${res.devCode}`, [
        { text: "I've shared it", onPress: () => fetch() },
      ])
    } catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  const steps = STAGE_FLOW.map((s, i) => ({
    ...s,
    state: i < currentIdx ? ('done' as const) : i === currentIdx ? ('active' as const) : ('upcoming' as const),
  }))

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <Header onBack={onBack} title="Trip execution" theme={theme} />

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.topRow}>
          <Text style={[styles.fare, { color: theme.foreground }, { fontVariant: ['tabular-nums'] }]}>{formatINR(trip.load.fareEstimate)}</Text>
          <StatusChip label={trip.stage.replace('_', ' ')} tone={TONE[trip.stage]} />
        </View>
        <Text style={[styles.route, { color: theme.foreground }]}>{trip.load.pickupAddr} → {trip.load.dropAddr}</Text>
        <Text style={[styles.meta, { color: theme.mutedForeground }]}>{trip.load.weight}t · {trip.load.distanceKm} km · {trip.load.material?.name ?? '—'}</Text>

        <View style={[styles.stepper, { backgroundColor: theme.muted, borderRadius: radius.lg }]}>
          <StatusStepper steps={steps} />
        </View>

        <View style={styles.actions}>
          {onExceptions && (
            <Button label="Report an issue" onPress={onExceptions} variant="ghost" />
          )}
          {!isDelivered && (
            <Button label={`Mark ${STAGE_FLOW[currentIdx + 1]?.label ?? 'next'} →`} onPress={advance} loading={busy} />
          )}
          {needsPickupOtp && (
            <Button label="Generate pickup OTP" onPress={() => generateOtp('pickup')} loading={busy} variant="secondary" />
          )}
          {needsDeliveryOtp && (
            <Button label="Generate delivery OTP" onPress={() => generateOtp('delivery')} loading={busy} variant="secondary" />
          )}
          {isDelivered && (
            <View style={[styles.done, { backgroundColor: theme.success + '1A' }]}>
              <Text style={{ color: theme.success, fontWeight: '800', fontSize: 16, textAlign: 'center' }}>✓ Trip completed</Text>
              <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 4 }}>
                Uploaded POD: {trip.podUrl ? 'Yes' : 'No'} · Request payout from your Trips tab
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function Header({ onBack, title, theme }: { onBack: () => void; title: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={[styles.header, { borderBottomColor: theme.border }]}>
      <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
      <Text style={[styles.title, { color: theme.foreground }]}>{title}</Text>
      <View style={{ width: 20 }} />
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  body: { padding: spacing.lg, gap: spacing.md },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fare: { fontSize: 24, fontWeight: '800' },
  route: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 13 },
  stepper: { padding: spacing.md },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  done: { borderRadius: radius.lg, padding: spacing.lg },
})
