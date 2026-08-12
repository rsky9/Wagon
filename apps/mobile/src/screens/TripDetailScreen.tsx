import { useEffect, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius, formatINR } from '@wagon/design'
import { StatusChip, Button, StatusStepper, type StatusTone } from '@wagon/components'
import { api } from '../config'
import type { Load } from '@wagon/contracts'
import { useI18n } from '@wagon/i18n'

interface TripInfo {
  id: string
  status: string
  podUrl?: string | null
  rating?: number | null
  load: Load
}

interface Props {
  loadId: string
  onBack: () => void
  onTrack?: (tripId: string) => void
  onOpenShipment?: (shipmentId: string) => void
}

const TONE: Record<string, StatusTone> = {
  posted: 'info',
  accepted: 'success',
  in_transit: 'brand',
  delivered: 'success',
  cancelled: 'danger',
}

export function TripDetailScreen({ loadId, onBack, onTrack, onOpenShipment }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [trip, setTrip] = useState<TripInfo | null>(null)
  const [snapshot, setSnapshot] = useState<{ rate: number; advanceAmount?: number | null; balanceAmount?: number | null; paymentTerms?: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [rating, setRating] = useState(0)
  const [ewb, setEwb] = useState<string | null>(null)
  const [shipmentId, setShipmentId] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<{ trips: TripInfo[] }>('/trips/mine')
      .then((res) => {
        const t = res.trips.find((x) => x.load.id === loadId)
        setTrip(t ?? null)
        if (t) {
          api.get<{ snapshot: { rate: number; advanceAmount?: number | null; balanceAmount?: number | null; paymentTerms?: string | null } }>(`/bidding/trip/${t.id}/booking`)
            .then((r) => setSnapshot(r.snapshot)).catch(() => {})
        }
        if (t?.rating) setRating(t.rating)
        if (t?.load.ewbNumber) setEwb(t.load.ewbNumber)
      })
      .catch((e) => Alert.alert(t('ui.error'), e.message))
      .finally(() => setLoading(false))
    // Enablement linkage: this load is also a canonical shipment.
    api.get<{ shipmentId: string | null }>(`/loads/${loadId}`)
      .then((r) => setShipmentId(r.shipmentId))
      .catch(() => {})
  }, [loadId])

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (!trip) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <Header onBack={onBack} title={t('tripDetail.loadDetails')} theme={theme} />
        <View style={styles.center}>
          <Text style={{ color: theme.mutedForeground, fontSize: 16 }}>{t('tripDetail.noActiveTrip')}</Text>
        </View>
      </SafeAreaView>
    )
  }

  const canPay = (trip.status === 'accepted' || trip.status === 'in_transit') && !paying
  const canRate = trip.status === 'delivered' && !trip.rating

  const payEscrow = async () => {
    setPaying(true)
    try {
      await api.post('/payments/escrow', { tripId: trip.id, amount: trip.load.fareEstimate })
      Alert.alert(t('ui.paid'), `Booking amount ${formatINR(trip.load.fareEstimate)} captured`)
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Payment failed')
    } finally {
      setPaying(false)
    }
  }

  const submitRating = async () => {
    try {
      await api.post(`/ratings/trip/${trip.id}`, { score: rating })
      Alert.alert(t('ui.thanks'), 'Your rating has been saved')
      setTrip({ ...trip, rating })
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed to rate')
    }
  }

  const generateEwb = async () => {
    try {
      const res = await api.post<{ ewbNumber: string }>(`/ewb/loads/${loadId}`)
      setEwb(res.ewbNumber)
      Alert.alert(t('ui.ewb'), `Generated ${res.ewbNumber}`)
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed to generate EWB')
    }
  }

  const verifyOtp = (kind: 'pickup' | 'delivery') => {
    Alert.prompt(`Enter ${kind} OTP`, `Ask the transporter for the ${kind} code`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Verify', onPress: (code?: string) => {
      api.post(`/trips/${trip.id}/otp/${kind}/verify`, { code: code ?? '' })
        .then(() => { Alert.alert(t('ui.verified'), `${kind} confirmed`); setTrip({ ...trip }) })
        .catch((e) => Alert.alert(t('ui.invalidAmount'), e instanceof Error ? e.message : 'Wrong code'))
    } }])
  }

  const steps = buildSteps(trip, !!ewb)

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <Header onBack={onBack} title={t('tripDetail.loadDetails')} theme={theme} />

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.topRow}>
          <Text style={[styles.fare, { color: theme.foreground }, { fontVariant: ['tabular-nums'] }]}>
            {formatINR(trip.load.fareEstimate)}
          </Text>
          <StatusChip label={trip.status.replace('_', ' ')} tone={TONE[trip.status]} />
        </View>
        <Text style={[styles.escrowNote, { color: theme.mutedForeground }]}>
          Escrow held by Wagon · released on delivery
        </Text>

        {shipmentId && (
          <Pressable style={[styles.card, { backgroundColor: 'rgba(249,115,22,0.08)', borderColor: '#F97316' }]} onPress={() => onOpenShipment?.(shipmentId)}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.cardTitle, { color: theme.foreground }]}>📦 Also a shipment</Text>
              <Text style={{ color: '#F97316', fontWeight: '800', fontSize: 14 }}>Open →</Text>
            </View>
            <Text style={[styles.route, { color: theme.mutedForeground, fontSize: 12 }]}>
              Track plans, bookings, claims & documents on the canonical shipment
            </Text>
          </Pressable>
        )}

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.foreground }]}>{t('tripDetail.tripStatus')}</Text>
          <StatusStepper steps={steps} />
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.foreground }]}>{t('tripDetail.route')}</Text>
          <Text style={[styles.route, { color: theme.foreground }]}>
            {trip.load.pickupAddr} → {trip.load.dropAddr}
          </Text>
          <Row label={t('tripDetail.weight')} value={`${trip.load.weight}t`} theme={theme} />
          <Row label={t('tripDetail.distance')} value={`${trip.load.distanceKm} km`} theme={theme} />
          <Row label={t('tripDetail.material')} value={trip.load.material?.name ?? '—'} theme={theme} />
          {trip.podUrl && <Row label={t('tripDetail.pod')} value="Uploaded ✓" theme={theme} />}
        </View>

        {snapshot && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.foreground }]}>{t('tripDetail.snapshot')}</Text>
            <Row label={t('tripDetail.agreedRate')} value={formatINR(snapshot.rate)} theme={theme} />
            {snapshot.advanceAmount ? <Row label={t('tripDetail.advance')} value={formatINR(snapshot.advanceAmount)} theme={theme} /> : null}
            {snapshot.balanceAmount ? <Row label={t('tripDetail.balance')} value={formatINR(snapshot.balanceAmount)} theme={theme} /> : null}
            {snapshot.paymentTerms ? <Row label={t('tripDetail.paymentTerms')} value={snapshot.paymentTerms} theme={theme} /> : null}
            <Text style={{ color: theme.mutedForeground, fontSize: 12, marginTop: 4 }}>These terms are immutable and govern the trip, payments and disputes.</Text>
          </View>
        )}

        <Pressable
          style={[styles.ewbBtn, { borderColor: theme.primary, backgroundColor: ewb != null ? theme.accent : 'transparent' }]}
          onPress={generateEwb}
          disabled={ewb != null}
        >
          <Text style={{ color: ewb != null ? theme.accentForeground : theme.primary, fontWeight: '700', fontSize: 15 }}>
            {ewb != null ? `E-way bill: ${ewb}` : 'Generate e-way bill'}
          </Text>
        </Pressable>

        {trip.status === 'in_transit' && (
          <Button label={t('tripDetail.trackLive')} onPress={() => onTrack?.(trip.id)} />
        )}
        {(trip.status === 'in_transit' || trip.status === 'accepted') && (
          <Button label={t('tripDetail.enterPickupOtp')} onPress={() => verifyOtp('pickup')} variant="secondary" />
        )}
        {trip.status === 'in_transit' && (
          <Button label={t('tripDetail.enterDeliveryOtp')} onPress={() => verifyOtp('delivery')} variant="secondary" />
        )}

        {canPay && (
          <Button
            label={`Pay booking amount · ${formatINR(trip.load.fareEstimate)}`}
            onPress={payEscrow}
            loading={paying}
          />
        )}

        {canRate && (
          <View style={[styles.rateBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.foreground }]}>{t('tripDetail.rateTransporter')}</Text>
            <View style={styles.stars}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setRating(n)} hitSlop={4}>
                  <Text style={[styles.star, { color: n <= rating ? theme.primary : theme.border }]}>★</Text>
                </Pressable>
              ))}
            </View>
            <Button label={t('tripDetail.submitRating')} onPress={submitRating} disabled={rating === 0} size="md" />
          </View>
        )}

        {trip.rating ? (
          <View style={styles.ratedBox}>
            <Text style={{ color: theme.success, fontSize: 16, fontWeight: '700' }}>You rated ★ {trip.rating}/5</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

function Header({ onBack, title, theme }: { onBack: () => void; title: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={[styles.header, { borderBottomColor: theme.border }]}>
      <Pressable onPress={onBack} hitSlop={8}>
        <Text style={[styles.back, { color: theme.mutedForeground }]}>←</Text>
      </Pressable>
      <Text style={[styles.headerTitle, { color: theme.foreground }]}>{title}</Text>
      <View style={{ width: 30 }} />
    </View>
  )
}

function Row({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: theme.mutedForeground }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: theme.foreground }]}>{value}</Text>
    </View>
  )
}

function buildSteps(trip: TripInfo, hasEwb: boolean) {
  const order = ['accepted', 'in_transit', 'delivered']
  const idx = order.indexOf(trip.status)
  const labels = [
    { label: 'Accepted', detail: 'Transporter confirmed' },
    { label: 'In transit', detail: 'Truck on the road' },
    { label: 'Delivered', detail: trip.podUrl ? 'POD uploaded' : 'Awaiting POD' },
  ]
  const steps = labels.map((l, i) => ({
    ...l,
    state: i < idx ? ('done' as const) : i === idx ? ('active' as const) : ('upcoming' as const),
  }))
  if (hasEwb) {
    steps.unshift({ label: 'E-way bill', detail: 'Generated', state: 'done' as const })
  }
  return steps
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  back: { fontSize: 20, fontWeight: '600', width: 30 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fare: { fontSize: 30, fontWeight: '800', letterSpacing: -0.02 },
  escrowNote: { fontSize: 13 },
  card: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  route: { fontSize: 15, fontWeight: '600', marginBottom: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: spacing.lg },
  ewbBtn: { borderRadius: radius.md, borderWidth: 1, paddingVertical: spacing.lg, alignItems: 'center' },
  rateBox: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  stars: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.sm },
  star: { fontSize: 36 },
  ratedBox: { alignItems: 'center', paddingVertical: spacing.lg },
})
