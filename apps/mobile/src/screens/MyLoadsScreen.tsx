import { useEffect, useState, useCallback } from 'react'
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  RefreshControl,
  Alert,
  TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius, formatINR, formatWeight } from '@wagon/design'
import { StatusChip, EmptyState, FeedSkeleton, type StatusTone } from '@wagon/components'
import { api } from '../config'
import { AppLogo } from '../components/AppLogo'
import type { Load } from '@wagon/contracts'
import { useI18n } from '@wagon/i18n'

interface Props {
  onPostLoad: () => void
  onSelectLoad: (id: string) => void
  onOpenDecisionRoom: (loadId: string) => void
  onOpenResponses?: () => void
  onOpenBookings?: () => void
  embedded?: boolean
}

const TONE: Record<string, StatusTone> = {
  posted: 'info',
  paused: 'neutral',
  interested: 'warning',
  accepted: 'success',
  in_transit: 'brand',
  delivered: 'success',
  completed: 'success',
  cancelled: 'danger',
}

export function MyLoads({ onPostLoad, onSelectLoad, onOpenDecisionRoom, onOpenResponses, onOpenBookings, embedded = false }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [loads, setLoads] = useState<Load[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const fetchLoads = useCallback(async () => {
    setError(null)
    try {
      const params = new URLSearchParams({ mine: 'true' })
      if (query.trim()) params.set('q', query.trim())
      const res = await api.get<{ items: Load[] }>(`/loads?${params.toString()}`)
      setLoads(res.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load your loads')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [query])

  useEffect(() => {
    fetchLoads()
  }, [fetchLoads])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchLoads()
  }, [fetchLoads])

  const manageLoad = (load: Load) => {
    const actions: Array<{ text: string; onPress: () => void; style?: 'destructive' }> = []
    if (load.status === 'posted' || load.status === 'interested') {
      actions.push({
        text: 'Reschedule',
        onPress: () => {
          const opts: Array<{ text: string; onPress: () => void }> = [
            { text: 'Tomorrow', onPress: () => { const d = new Date(); d.setDate(d.getDate() + 1); api.patch(`/loads/${load.id}/reschedule`, { date: d.toISOString(), pickupDate: d.toISOString() }).then(fetchLoads).catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'Could not reschedule')) } },
            { text: 'In 2 days', onPress: () => { const d = new Date(); d.setDate(d.getDate() + 2); api.patch(`/loads/${load.id}/reschedule`, { date: d.toISOString(), pickupDate: d.toISOString() }).then(fetchLoads).catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'Could not reschedule')) } },
            { text: 'This week', onPress: () => { const d = new Date(); d.setDate(d.getDate() + 7); api.patch(`/loads/${load.id}/reschedule`, { date: d.toISOString(), pickupDate: d.toISOString() }).then(fetchLoads).catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'Could not reschedule')) } },
          ]
          Alert.alert('Reschedule pickup', `Move ${load.pickupAddr.split(',')[0]} → ${load.dropAddr.split(',')[0]} to a new date?`, [...opts, { text: 'Cancel', style: 'cancel' } as const])
        },
      })
      actions.push({ text: 'Pause', onPress: () => { api.patch(`/loads/${load.id}/pause`).then(fetchLoads).catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'Could not pause load')) } })
      actions.push({
        text: 'Cancel',
        style: 'destructive' as const,
        onPress: () => {
          Alert.alert(t('ui.cancelLoad'), 'Why are you cancelling?', [
            { text: 'Back', style: 'cancel' },
            { text: 'No trucks available', onPress: () => { api.patch(`/loads/${load.id}/cancel`, { reason: 'No trucks available' }).then(fetchLoads).catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'Could not cancel')) } },
            { text: 'Rates too high', onPress: () => { api.patch(`/loads/${load.id}/cancel`, { reason: 'Rates too high' }).then(fetchLoads).catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'Could not cancel')) } },
            { text: 'Requirement changed', onPress: () => { api.patch(`/loads/${load.id}/cancel`, { reason: 'Requirement changed' }).then(fetchLoads).catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'Could not cancel')) } },
          ])
        },
      })
    }
    if (load.status === 'paused') {
      actions.push({ text: 'Reopen', onPress: () => { api.patch(`/loads/${load.id}/reopen`).then(fetchLoads).catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'Could not reopen')) } })
    }
    if (load.status === 'posted' || load.status === 'interested') {
      actions.push({ text: 'Decision Room', onPress: () => onOpenDecisionRoom(load.id) })
      if (onOpenResponses) {
        actions.push({ text: 'Responses', onPress: onOpenResponses })
      }
      if (onOpenBookings) {
        actions.push({ text: 'Bookings', onPress: onOpenBookings })
      }
    }
    if (load.status === 'delivered') {
      actions.push({ text: 'Complete', onPress: () => { api.patch(`/loads/${load.id}/complete`).then(fetchLoads).catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'Could not complete')) } })
    }
    if (load.status === 'accepted' || load.status === 'in_transit') {
      actions.push({ text: 'Pay booking / track →', onPress: () => onSelectLoad(load.id) })
    }
    if (actions.length === 0) return
    Alert.alert(`Manage ${load.pickupAddr.split(',')[0]} → ${load.dropAddr.split(',')[0]}`, undefined, [...actions, { text: 'Close', style: 'cancel' }])
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={embedded ? ['bottom', 'left', 'right'] : undefined}>
      {!embedded && (
        <View style={[styles.header, { backgroundColor: theme.background }]}>
          <View>
            <AppLogo height={28} />
            <Text style={[styles.sub, { color: theme.mutedForeground }]}>Supplier</Text>
          </View>
        </View>
      )}

      <View style={styles.toolbar}>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('myLoads.title')}</Text>
      </View>

      <TextInput
        style={[styles.searchBar, { backgroundColor: theme.muted, color: theme.foreground, borderColor: theme.border }]}
        placeholder="Search your loads by route…"
        placeholderTextColor={theme.mutedForeground}
        value={query}
        onChangeText={setQuery}
      />

      {error && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}

      {loading ? (
        <FeedSkeleton />
      ) : (
        <FlatList
          data={loads}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              title={t('myLoads.noLoads')}
              message="Post your first load and trucks will come to you"
              actionLabel={t('myLoads.post')}
              onAction={onPostLoad}
              icon="📦"
            />
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => onSelectLoad(item.id)}>
              <LoadRow load={item} onAction={() => manageLoad(item)} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  )
}

function LoadRow({ load, onAction }: { load: Load; onAction: () => void }) {
  const theme = useTheme()
  const { t } = useI18n()
  const date = new Date(load.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return (
    <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <View style={styles.cardTop}>
        <Text style={[styles.fare, { color: theme.foreground }, { fontVariant: ['tabular-nums'] }]}>
          {formatINR(load.fareEstimate)}
        </Text>
        <StatusChip label={load.status.replace('_', ' ')} tone={TONE[load.status]} />
      </View>
      <Text style={[styles.route, { color: theme.foreground }]}>
        {load.pickupAddr} → {load.dropAddr}
      </Text>
      <View style={styles.metaRow}>
        <Meta label={t('myLoads.date')} value={date} theme={theme} />
        <Meta label={t('myLoads.weight')} value={formatWeight(load.weight)} theme={theme} />
        <Meta label={t('myLoads.trucks')} value={String(load.noOfTrucks)} theme={theme} />
      </View>
      {onAction && (
        <View style={styles.actionRow}>
          <Pressable onPress={onAction} style={[styles.actionBtn, { borderColor: theme.border }]}>
            <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '700' }}>{t('myLoads.manage')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

function Meta({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View>
      <Text style={[styles.metaLabel, { color: theme.mutedForeground }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: theme.foreground }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  logo: { fontSize: 24, fontWeight: '800', letterSpacing: -0.02 },
  sub: { fontSize: 13 },
  toolbar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  title: { fontSize: 20, fontWeight: '800' },
  searchBar: {
    borderRadius: radius.full,
    borderWidth: 1,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: 120 },
  card: { borderRadius: radius.xl, padding: spacing.lg, borderWidth: 1, gap: spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fare: { fontSize: 20, fontWeight: '800', letterSpacing: -0.02 },
  route: { fontSize: 15, fontWeight: '700' },
  metaRow: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.xs },
  metaLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { fontSize: 14, fontWeight: '600', marginTop: 1 },
  actionRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.sm },
  actionBtn: { borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  error: { textAlign: 'center', padding: spacing.md },
})
