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
import { StatusChip, EmptyState, FeedSkeleton, type StatusTone } from '@wagon/components'
import { api } from '../config'
import { AppLogo } from '../components/AppLogo'
import type { Load } from '@wagon/contracts'
import { useI18n } from '@wagon/i18n'

interface Props {
  onPostLoad: () => void
  onLogout: () => void
  onSelectLoad: (loadId: string) => void
  onOpenKyc: () => void
  onOpenDecisionRoom: (loadId: string) => void
  /** Render without the app header (used when embedded in a parent with its own header). */
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

export function MyLoads({ onPostLoad, onLogout, onSelectLoad, onOpenKyc, onOpenDecisionRoom, embedded = false }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [loads, setLoads] = useState<Load[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLoads = useCallback(async () => {
    setError(null)
    try {
      const res = await api.get<{ items: Load[] }>('/loads')
      setLoads(res.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load your loads')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

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
      actions.push({ text: 'Pause', onPress: () => { api.patch(`/loads/${load.id}/pause`).then(fetchLoads).catch(() => {}) } })
      actions.push({
        text: 'Cancel',
        style: 'destructive' as const,
        onPress: () => {
          Alert.alert('Cancel this load?', 'Why are you cancelling?', [
            { text: 'Back', style: 'cancel' },
            { text: 'No trucks available', onPress: () => { api.patch(`/loads/${load.id}/cancel`, { reason: 'No trucks available' }).then(fetchLoads).catch(() => {}) } },
            { text: 'Rates too high', onPress: () => { api.patch(`/loads/${load.id}/cancel`, { reason: 'Rates too high' }).then(fetchLoads).catch(() => {}) } },
            { text: 'Requirement changed', onPress: () => { api.patch(`/loads/${load.id}/cancel`, { reason: 'Requirement changed' }).then(fetchLoads).catch(() => {}) } },
          ])
        },
      })
    }
    if (load.status === 'paused') {
      actions.push({ text: 'Reopen', onPress: () => { api.patch(`/loads/${load.id}/reopen`).then(fetchLoads).catch(() => {}) } })
    }
    if (load.status === 'posted' || load.status === 'interested') {
      actions.push({ text: 'Decision Room', onPress: () => onOpenDecisionRoom(load.id) })
    }
    if (load.status === 'delivered') {
      actions.push({ text: 'Complete', onPress: () => { api.patch(`/loads/${load.id}/complete`).then(fetchLoads).catch(() => {}) } })
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
          <View style={styles.headerActions}>
            <Pressable style={[styles.iconBtn, { backgroundColor: theme.muted }]} onPress={onOpenKyc}>
              <Text style={{ fontSize: 17 }}>🛡️</Text>
            </Pressable>
            <Pressable style={[styles.iconBtn, { backgroundColor: theme.muted }]} onPress={onLogout}>
              <Text style={{ fontSize: 15 }}>⎋</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.toolbar}>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('myLoads.title')}</Text>
      </View>

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
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  toolbar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  title: { fontSize: 20, fontWeight: '800' },
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
