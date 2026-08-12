import { useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme, spacing, radius, formatINR, formatWeight, shadows } from '@wagon/design'
import { RouteRail, StatusChip, Button, type StatusTone } from '@wagon/components'
import { api } from '../config'
import { useAuth } from '../auth'
import type { Load } from '@wagon/contracts'
import { useI18n } from '@wagon/i18n'

interface Props {
  load: Load
  onBack: () => void
  onAccepted: () => void
  onOpenBid?: () => void
}

const TONE: Record<string, StatusTone> = {
  posted: 'success',
  interested: 'warning',
  accepted: 'info',
  in_transit: 'brand',
  delivered: 'success',
  cancelled: 'danger',
}

export function LoadDetailScreen({ load, onBack, onAccepted, onOpenBid }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const insets = useSafeAreaInsets()
  const { session } = useAuth()
  const caps = session?.profile.capabilities?.length ? session.profile.capabilities : [session?.profile.role ?? '']
  const canHaul = caps.includes('transporter')
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const accepted = load.status !== 'posted'

  const toggleSave = () => {
    if (saved) {
      api.request('DELETE', `/favorites/load/${load.id}`).then(() => setSaved(false)).catch(() => {})
    } else {
      api.post(`/favorites/load/${load.id}`).then(() => setSaved(true)).catch(() => {})
    }
  }

  const accept = async () => {
    setLoading(true)
    try {
      await api.post<{ trip: unknown }>('/trips/accept', { loadId: load.id })
      Alert.alert(t('ui.loadReserved'), 'Start the trip from your Trips tab.', [
        { text: 'View trip', onPress: onAccepted },
      ])
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed to accept load')
    } finally {
      setLoading(false)
    }
  }

  const openBid = () => {
    if (onOpenBid) { onOpenBid(); return }
    Alert.prompt(t('ui.submitBidQ'), `Enter your freight amount (reference: ${formatINR(load.fareEstimate)})`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Bid', onPress: (amount?: string) => {
      const n = Number(amount ?? 0)
      if (!n || n <= 0) { Alert.alert(t('ui.invalidAmount'), 'Enter a positive amount'); return }
      setLoading(true)
      api.post('/bidding/bid', { loadId: load.id, amount: n, validityHours: 24 })
        .then(() => Alert.alert(t('ui.bidSubmitted'), 'The supplier will review your structured bid in the Decision Room.'))
        .catch((e) => Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed to bid'))
        .finally(() => setLoading(false))
    } }])
  }

  const date = new Date(load.date).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={[styles.back, { color: theme.mutedForeground }]}>← Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.foreground }]}>{t('loadDetail.title')}</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.priceRow}>
          <Text style={[styles.fare, { color: theme.foreground }, { fontVariant: ['tabular-nums'] }]}>
            {formatINR(load.fareEstimate)}
          </Text>
          <StatusChip label={load.status.replace('_', ' ')} tone={TONE[load.status]} />
        </View>
        <Text style={[styles.escrowNote, { color: theme.mutedForeground }]}>
          Escrow held by Wagon · released on delivery
        </Text>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <RouteRail from={load.pickupAddr} to={load.dropAddr} distanceKm={load.distanceKm} />
        </View>

        <Text style={[styles.sectionTitle, { color: theme.foreground }]}>{t('loadDetail.tripSpecs')}</Text>
        <View style={[styles.grid, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Spec label={t('loadDetail.weight')} value={formatWeight(load.weight)} />
          <Spec label={t('loadDetail.truckType')} value={load.truckType} />
          <Spec label={t('loadDetail.material')} value={load.material?.name ?? '—'} />
          <Spec label={t('loadDetail.trucks')} value={String(load.noOfTrucks)} />
        </View>

        <Text style={[styles.sectionTitle, { color: theme.foreground }]}>{t('loadDetail.schedule')}</Text>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Row label={t('loadDetail.pickup')} value={date} />
          <Row label={t('loadDetail.payment')} value={load.payLater ? 'Pay later' : 'Advance / booking'} />
          {load.description ? <Row label={t('loadDetail.notes')} value={load.description} /> : null}
        </View>
      </ScrollView>

      <View
        style={[
          styles.actionBar,
          { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, spacing.xl) },
          shadows.md,
        ]}
      >
        <Pressable
          style={[styles.saveBtn, { borderColor: saved ? theme.primary : theme.border }]}
          onPress={toggleSave}
        >
          <Text style={{ color: saved ? theme.primary : theme.mutedForeground, fontWeight: '700', fontSize: 14 }}>{saved ? '♥ Saved' : '♡ Save'}</Text>
        </Pressable>
        <Button
          label={accepted ? 'Accepted' : load.commercialModel === 'open_bidding' ? 'Submit bid' : 'Accept Load'}
          onPress={load.commercialModel === 'open_bidding' ? openBid : accept}
          disabled={accepted || loading || !canHaul}
          loading={loading}
        />
        {!accepted && (
          <Pressable
            style={[styles.rejectBtn, { borderColor: theme.danger + '55' }]}
            onPress={() =>
              Alert.alert(t('ui.rejectLoadQ'), 'Are you sure you want to pass on this load?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reject', style: 'destructive', onPress: onBack },
              ])
            }
          >
            <Text style={{ color: theme.danger, fontWeight: '700', fontSize: 15 }}>{t('loadDetail.reject')}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  )
}

function Spec({ label, value }: { label: string; value: string }) {
  const theme = useTheme()
  return (
    <View style={styles.spec}>
      <Text style={[styles.specLabel, { color: theme.mutedForeground }]}>{label}</Text>
      <Text style={[styles.specValue, { color: theme.foreground }]} numberOfLines={1}>{value}</Text>
    </View>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  const theme = useTheme()
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: theme.mutedForeground }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: theme.foreground }]}>{value}</Text>
    </View>
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
  back: { fontSize: 15, fontWeight: '600', width: 50 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  body: { padding: spacing.lg, paddingBottom: 120 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fare: { fontSize: 34, fontWeight: '800', letterSpacing: -0.02 },
  escrowNote: { fontSize: 13, marginTop: 2, marginBottom: spacing.lg },
  card: { borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, marginBottom: spacing.xl },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: spacing.sm, marginTop: spacing.xl },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  spec: { width: '50%', padding: spacing.sm },
  specLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  specValue: { fontSize: 15, fontWeight: '700', marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: spacing.lg },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  rejectBtn: { borderRadius: radius.md, borderWidth: 1, paddingVertical: spacing.md, alignItems: 'center' },
  saveBtn: { borderRadius: radius.md, borderWidth: 1, paddingVertical: spacing.md, alignItems: 'center' },
})
