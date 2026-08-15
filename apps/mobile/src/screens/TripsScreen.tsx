import { useEffect, useState, useCallback } from 'react'
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  RefreshControl,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius, formatINR, formatWeight } from '@wagon/design'
import { StatusChip, EmptyState, Button, StatusStepper, type StatusTone } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'
import { uploadToPresignedUrl } from '@wagon/api-client'
import * as DocumentPicker from 'expo-document-picker'
import { LocationShare } from '../components/LocationShare'
import { useStepUp } from '../hooks/useStepUp'
import type { Load } from '@wagon/contracts'

interface TripInfo {
  id: string
  status: string
  podUrl?: string | null
  load: Load
}

interface Props {
  onBack: () => void
  onOpenPassbook: () => void
  onOpenExecution: (tripId: string) => void
  onReturnLoads?: (tripId: string) => void
  capabilities?: string[]
}

const TONE: Record<string, StatusTone> = {
  accepted: 'info',
  in_transit: 'brand',
  delivered: 'success',
  cancelled: 'danger',
}

export function TripsScreen({ onBack, onOpenPassbook, onOpenExecution, onReturnLoads, capabilities = [] }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  // Transporter-side execution (start/mark-delivered/POD/payout/rate/return loads)
  // is only valid for users with the transporter capability; suppliers and
  // others should only track their trips, not run them.
  const canHaul = capabilities.includes('transporter')
  const { stepUp } = useStepUp()
  const [trips, setTrips] = useState<TripInfo[]>([])
  const [pending, setPending] = useState<Array<{ id: string; load: Load }>>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const fetchTrips = useCallback(async () => {
    setError(null)
    try {
      const res = await api.get<{ trips: TripInfo[] }>('/trips/mine')
      setTrips(res.trips)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trips')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const fetchPending = useCallback(() => {
    if (!canHaul) return
    api.get<{ pending: Array<{ id: string; load: Load }> }>('/bidding/pending-bookings').then((res) => setPending(res.pending)).catch(() => {})
  }, [canHaul])

  useEffect(() => {
    fetchTrips()
    fetchPending()
  }, [fetchTrips, fetchPending])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchTrips()
    fetchPending()
  }, [fetchTrips, fetchPending])

  const confirmBooking = async (loadId: string, bidId: string) => {
    const token = await stepUp('confirm_booking')
    if (!token) return
    setBusy(bidId)
    try {
      await api.post(`/bidding/load/${loadId}/confirm/transporter`, { bidId }, { 'x-action-token': token })
      Alert.alert(t('ui.confirmed'), 'Booking locked in — trip created')
      fetchTrips()
      fetchPending()
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed to confirm')
    } finally {
      setBusy(null)
    }
  }

  const rateSupplier = (trip: TripInfo) => {
    const stars = [5, 4, 3, 2, 1].map((s) => ({
      text: `${s}★`,
      onPress: () => api.post(`/bidding/trip/${trip.id}/rate-supplier`, { score: s }).then(() => Alert.alert(t('ui.thanks'), 'Rating saved')).catch(() => Alert.alert(t('ui.error'), 'Failed to rate')),
    }))
    Alert.alert(t('ui.rateSupplier'), 'How was loading readiness and communication?', [{ text: 'Cancel', style: 'cancel' }, ...stars])
  }

  const uploadPod = async (trip: TripInfo) => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      })
      if (picked.canceled || !picked.assets?.[0]) return
      const asset = picked.assets[0]

      setBusy(trip.id)
      const presigned = await api.post<{ uploadUrl: string; key: string }>(`/kyc/pod/${trip.id}`, {
        mimeType: asset.mimeType ?? 'application/octet-stream',
        size: asset.size ?? 0,
      })
      await uploadToPresignedUrl(presigned.uploadUrl, {
        uri: asset.uri,
        name: asset.name ?? 'pod.pdf',
        type: asset.mimeType ?? 'application/pdf',
      })
      // Confirm the upload so the trip's POD is recorded (payout gate).
      await api.post(`/payments/pod/${trip.id}`, { photoKey: presigned.key })
      Alert.alert(t('ui.podUploaded'), 'Proof of delivery recorded')
      fetchTrips()
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed to upload POD')
    } finally {
      setBusy(null)
    }
  }

  const requestPayout = async (trip: TripInfo) => {
    const token = await stepUp('release_payout')
    if (!token) return
    setBusy(trip.id)
    try {
      const res = await api.post<{ alreadyPaid?: boolean }>('/payments/release', { tripId: trip.id }, { 'x-action-token': token })
      Alert.alert('Payout', res.alreadyPaid ? 'Already paid out' : 'Payout processed')
      fetchTrips()
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed to request payout')
    } finally {
      setBusy(null)
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={[styles.back, { color: theme.mutedForeground }]}>←</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.foreground }]}>{t('trip.title')}</Text>
        <Pressable onPress={onOpenPassbook}>
          <Text style={{ color: theme.primary, fontSize: 15, fontWeight: '700' }}>{t('wallet.title')}</Text>
        </Pressable>
      </View>

      {error && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}

      {loading ? (
        <View style={styles.center}>
          <Text style={{ color: theme.mutedForeground }}>{t('common.loading')}</Text>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
          }
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            canHaul && pending.length > 0 ? (
              <View style={[styles.pendingCard, { backgroundColor: theme.card, borderColor: theme.primary + '44' }]}>
                <Text style={[styles.pendingTitle, { color: theme.foreground }]}>{t('trip.pendingConfirm')}</Text>
                {pending.map((b) => (
                  <View key={b.id} style={[styles.pendingRow, { borderTopColor: theme.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pendingRoute, { color: theme.foreground }]} numberOfLines={1}>{b.load.pickupAddr} → {b.load.dropAddr}</Text>
                      <Text style={[styles.pendingMeta, { color: theme.mutedForeground }]}>{b.load.weight}t · {formatINR(b.load.fareEstimate)}</Text>
                    </View>
                    <Button label={busy === b.id ? 'Confirming…' : 'Confirm'} onPress={() => confirmBooking(b.load.id, b.id)} loading={busy === b.id} />
                  </View>
                ))}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              title={t('trip.noTrips')}
              message={canHaul ? 'Accept a load to start your first trip' : 'No trips on your shipments yet'}
              actionLabel="Browse loads"
              onAction={onBack}
            />
          }
          renderItem={({ item }) => (
            <TripCard
              trip={item}
              busy={busy === item.id}
              canHaul={canHaul}
              onUploadPod={uploadPod}
              onPayout={requestPayout}
              onOpenExecution={onOpenExecution}
              onReturnLoads={canHaul ? onReturnLoads : undefined}
              onRateSupplier={canHaul ? () => rateSupplier(item) : undefined}
            />
          )}
        />
      )}
    </SafeAreaView>
  )
}

function TripCard({
  trip,
  busy,
  canHaul,
  onUploadPod,
  onPayout,
  onOpenExecution,
  onReturnLoads,
  onRateSupplier,
}: {
  trip: TripInfo
  busy: boolean
  canHaul: boolean
  onUploadPod: (t: TripInfo) => void
  onPayout: (t: TripInfo) => void
  onOpenExecution: (tripId: string) => void
  onReturnLoads?: (tripId: string) => void
  onRateSupplier?: () => void
}) {
  const theme = useTheme()
  const steps = buildSteps(trip)

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardTop}>
        <Text style={[styles.fare, { color: theme.foreground }, { fontVariant: ['tabular-nums'] }]}>
          {formatINR(trip.load.fareEstimate)}
        </Text>
        <StatusChip label={trip.status.replace('_', ' ')} tone={TONE[trip.status]} />
      </View>

      <Text style={[styles.route, { color: theme.foreground }]}>
        {trip.load.pickupAddr} → {trip.load.dropAddr}
      </Text>
      <Text style={[styles.meta, { color: theme.mutedForeground }]}>
        {formatWeight(trip.load.weight)} · {trip.load.distanceKm} km · {trip.load.material?.name ?? '—'}
      </Text>

      {trip.status === 'in_transit' && <LocationShare tripId={trip.id} />}

      <View style={[styles.stepper, { backgroundColor: theme.muted, borderRadius: radius.lg }]}>
        <StatusStepper steps={steps} />
      </View>

      <View style={styles.actions}>
        {canHaul && (
          <>
            <Button label="Execute trip →" onPress={() => onOpenExecution(trip.id)} size="md" variant="secondary" />
            {trip.status === 'delivered' && !trip.podUrl && (
              <Button label="Upload POD" onPress={() => onUploadPod(trip)} loading={busy} size="md" />
            )}
            {trip.status === 'delivered' && trip.podUrl && (
              <Button label="Request payout" onPress={() => onPayout(trip)} loading={busy} size="md" />
            )}
            {trip.status === 'delivered' && onReturnLoads && (
              <Button label="Find return loads 🔄" onPress={() => onReturnLoads(trip.id)} size="md" variant="secondary" />
            )}
            {trip.status === 'delivered' && onRateSupplier && (
              <Button label="Rate supplier ⭐" onPress={onRateSupplier} size="md" variant="secondary" />
            )}
          </>
        )}
      </View>
    </View>
  )
}

function buildSteps(trip: TripInfo) {
  const order = ['accepted', 'in_transit', 'delivered']
  const idx = order.indexOf(trip.status)
  const labels: Array<{ label: string; detail: string }> = [
    { label: 'Load accepted', detail: 'Transporter confirmed' },
    { label: 'In transit', detail: 'Truck on the road' },
    { label: 'Delivered', detail: trip.podUrl ? 'POD uploaded' : 'Awaiting POD' },
  ]
  return labels.map((l, i) => ({
    ...l,
    state: i < idx ? ('done' as const) : i === idx ? ('active' as const) : ('upcoming' as const),
  }))
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
  back: { fontSize: 20, fontWeight: '600', width: 30 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: 100 },
  pendingCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  pendingTitle: { fontSize: 15, fontWeight: '800' },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1 },
  pendingRoute: { fontSize: 14, fontWeight: '700' },
  pendingMeta: { fontSize: 12, marginTop: 1 },
  card: { borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, gap: spacing.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fare: { fontSize: 22, fontWeight: '800', letterSpacing: -0.02 },
  route: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 13 },
  stepper: { padding: spacing.md, marginVertical: spacing.xs },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { textAlign: 'center', padding: spacing.md },
})
