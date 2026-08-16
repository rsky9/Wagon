import { SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, ScrollView, Pressable, Alert } from 'react-native'
import { useTheme, spacing, radius, formatINR } from '@wagon/design'
import { StatusChip, Button, StatusStepper, type StatusTone } from '@wagon/components'
import * as DocumentPicker from 'expo-document-picker'
import { uploadToPresignedUrl } from '@wagon/api-client'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'
import { useStepUp } from '../hooks/useStepUp'
import { useAuth } from '../auth'

interface TripDetail {
  id: string
  stage: string
  status: string
  podUrl?: string | null
  pod?: { status?: string } | null
  pickupOtpAt?: string | null
  pickupOtpVerifiedAt?: string | null
  deliveryOtpAt?: string | null
  deliveryOtpVerifiedAt?: string | null
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
  const { t } = useI18n()
  const { session } = useAuth()
  const caps = session?.profile.capabilities?.length ? session.profile.capabilities : [session?.profile.role ?? '']
  // Drivers execute trips but don't upload POD or request payout — those are
  // transporter actions (driver endpoints 403 on the transporter-only routes).
  const isDriverOnly = caps.includes('driver') && !caps.includes('transporter')
  const [trip, setTrip] = useState<TripDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const { stepUp } = useStepUp()

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
    return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}><View style={styles.center}><Text style={{ color: theme.mutedForeground }}>{t('common.loading')}</Text></View></SafeAreaView>
  }

  if (!trip) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <Header onBack={onBack} title={t('tripExec.title')} theme={theme} />
        <View style={styles.center}><Text style={{ color: theme.mutedForeground }}>{t('tripExec.notFound')}</Text></View>
      </SafeAreaView>
    )
  }

  const currentIdx = STAGE_FLOW.findIndex((s) => s.key === trip.stage)
  const isDelivered = trip.stage === 'delivered'
  // OTP is required until the supplier VERIFIES it (not merely generated) — so a
  // mistyped code can be regenerated instead of blocking the trip forever.
  const needsPickupOtp = trip.stage === 'arrived_pickup' && !trip.pickupOtpVerifiedAt
  const needsDeliveryOtp = trip.stage === 'arrived_drop' && !trip.deliveryOtpVerifiedAt
  const pickupOtpPending = trip.stage === 'arrived_pickup' && !!trip.pickupOtpAt && !trip.pickupOtpVerifiedAt
  const deliveryOtpPending = trip.stage === 'arrived_drop' && !!trip.deliveryOtpAt && !trip.deliveryOtpVerifiedAt

  const advance = async () => {
    setBusy(true)
    try {
      await api.post(`/trips/${tripId}/advance`)
      fetch()
    } catch (e) {
      Alert.alert(t('ui.cannotAdvance'), e instanceof Error ? e.message : 'Failed')
    } finally { setBusy(false) }
  }

  const generateOtp = async (kind: 'pickup' | 'delivery') => {
    setBusy(true)
    try {
      const res = await api.post<{ devCode?: string }>(`/trips/${tripId}/otp/${kind}`)
      // In production the backend never returns the code — the supplier gets it
      // via notification. Only show the code in dev/mock builds.
      const msg = res.devCode
        ? `Share this code with the supplier: ${res.devCode}`
        : 'Verification code sent to the supplier via notification.'
      Alert.alert(`${kind} OTP`, msg, [
        { text: "I've shared it", onPress: () => fetch() },
      ])
    } catch (e) { Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed') } finally { setBusy(false) }
  }

  const uploadPod = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      })
      if (picked.canceled || !picked.assets?.[0]) return
      const asset = picked.assets[0]
      setBusy(true)
      const presigned = await api.post<{ uploadUrl: string; key: string }>(`/kyc/pod/${tripId}`, {
        mimeType: asset.mimeType ?? 'application/octet-stream',
        size: asset.size ?? 0,
      })
      await uploadToPresignedUrl(presigned.uploadUrl, {
        uri: asset.uri,
        name: asset.name ?? 'pod.pdf',
        type: asset.mimeType ?? 'application/pdf',
      })
      await api.post(`/payments/pod/${tripId}`, { photoKey: presigned.key })
      Alert.alert('POD uploaded', 'Delivery evidence recorded — the consignee will confirm receipt.')
      fetch()
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed to upload POD')
    } finally { setBusy(false) }
  }

  const requestPayout = async () => {
    const token = await stepUp('release_payout')
    if (!token) return
    setBusy(true)
    try {
      const res = await api.post<{ alreadyPaid?: boolean }>('/payments/release', { tripId }, { 'x-action-token': token })
      Alert.alert('Payout', res.alreadyPaid ? 'Already paid out' : 'Payout processed')
      fetch()
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed to request payout')
    } finally { setBusy(false) }
  }

  const steps = STAGE_FLOW.map((s, i) => ({
    ...s,
    state: i < currentIdx ? ('done' as const) : i === currentIdx ? ('active' as const) : ('upcoming' as const),
  }))

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <Header onBack={onBack} title={t('tripExec.title')} theme={theme} />

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
            <Button label={t('tripExec.reportIssue')} onPress={onExceptions} variant="ghost" />
          )}
          {!isDelivered && currentIdx >= 0 && trip.status !== 'cancelled' && (
            <Button label={`Mark ${STAGE_FLOW[currentIdx + 1]?.label ?? 'next'} →`} onPress={advance} loading={busy} />
          )}
          {needsPickupOtp && (
            <Button label={t('tripExec.genPickupOtp')} onPress={() => generateOtp('pickup')} loading={busy} variant="secondary" />
          )}
          {pickupOtpPending && (
            <Text style={{ color: theme.warning, fontSize: 13, textAlign: 'center', marginVertical: 4 }}>
              Waiting for the supplier to verify the pickup OTP
            </Text>
          )}
          {needsDeliveryOtp && (
            <Button label={t('tripExec.genDeliveryOtp')} onPress={() => generateOtp('delivery')} loading={busy} variant="secondary" />
          )}
          {deliveryOtpPending && (
            <Text style={{ color: theme.warning, fontSize: 13, textAlign: 'center', marginVertical: 4 }}>
              Waiting for the supplier to verify the delivery OTP
            </Text>
          )}
          {isDelivered && (
            <View style={[styles.done, { backgroundColor: theme.success + '1A' }]}>
              <Text style={{ color: theme.success, fontWeight: '800', fontSize: 16, textAlign: 'center' }}>✓ Trip completed</Text>
              <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 4 }}>
                POD: {trip.podUrl ? 'Uploaded' : 'Not uploaded'}
              </Text>
              {isDriverOnly ? (
                <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 4 }}>
                  The transporter handles the delivery proof and payout for this trip.
                </Text>
              ) : (
              <>
              {!trip.podUrl && (
                <Button label="Upload delivery proof" onPress={uploadPod} loading={busy} variant="secondary" />
              )}
              {trip.podUrl && trip.pod?.status && trip.pod.status !== 'confirmed' && trip.pod.status !== 'verified' && (
                <Text style={{ color: theme.warning, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
                  POD uploaded — waiting for the consignee to confirm receipt (payout unlocks after)
                </Text>
              )}
              {trip.podUrl && (!trip.pod?.status || trip.pod.status === 'confirmed' || trip.pod.status === 'verified') && (
                <Button label="Request payout →" onPress={requestPayout} loading={busy} />
              )}
              </>
              )}
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
  done: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
})
