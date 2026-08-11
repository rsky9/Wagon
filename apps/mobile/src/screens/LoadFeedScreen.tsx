import { useEffect, useState, useCallback } from 'react'
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme, spacing, formatINR, formatWeight, timeAgo } from '@wagon/design'
import { LoadCard, StatusChip, FeedSkeleton, EmptyState, type StatusTone } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'
import { AppLogo } from '../components/AppLogo'
import type { LoadFilters } from './FiltersScreen'
import type { Load } from '@wagon/contracts'

const CACHE_KEY = 'wagon_load_feed'

interface Props {
  onSelect: (load: Load) => void
  onOpenTrips: () => void
  onOpenKyc: () => void
  filters?: LoadFilters
  onOpenFilters: () => void
  /** Render without the app header (used when embedded in a parent with its own header). */
  embedded?: boolean
}

type Filter = 'all' | 'open' | 'container' | 'trailer'

const TONE: Record<string, StatusTone> = {
  posted: 'success',
  interested: 'warning',
  accepted: 'info',
  in_transit: 'brand',
  delivered: 'success',
  cancelled: 'danger',
}

export function LoadFeedScreen({ onSelect, onOpenTrips, onOpenKyc, filters, onOpenFilters, embedded = false }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [filter, setFilter] = useState<Filter>('all')
  const [loads, setLoads] = useState<Load[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchLoads = useCallback(async () => {
    setError(null)
    try {
      const params: string[] = []
      if (filter !== 'all') params.push(`truckType=${filter}`)
      if (filters?.truckType) params.push(`truckType=${filters.truckType}`)
      if (filters?.modelId) params.push(`modelId=${filters.modelId}`)
      if (filters?.materialId) params.push(`materialId=${filters.materialId}`)
      if (filters?.minWeight !== undefined) params.push(`minWeight=${filters.minWeight}`)
      if (filters?.maxWeight !== undefined) params.push(`maxWeight=${filters.maxWeight}`)
      const qs = params.length ? `?${params.join('&')}` : ''
      const res = await api.get<{ items: Load[] }>(`/loads${qs}`)
      setLoads(res.items)
      setOffline(false)
      setLastUpdated(new Date())
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(res.items)).catch(() => {})
    } catch (e) {
      setOffline(true)
      const cached = await AsyncStorage.getItem(CACHE_KEY).catch(() => null)
      if (cached) {
        setLoads(JSON.parse(cached))
        setError('Offline — showing cached loads')
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load loads')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [filter, filters])

  useEffect(() => {
    fetchLoads()
  }, [fetchLoads])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    fetchLoads()
  }, [fetchLoads])

  const tabDefs: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'container', label: 'Container' },
    { key: 'trailer', label: 'Trailer' },
  ]

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={embedded ? ['bottom', 'left', 'right'] : undefined}>
      {!embedded && (
        <View style={[styles.header, { backgroundColor: theme.background }]}>
          <View>
            <AppLogo height={28} />
            <Text style={[styles.greeting, { color: theme.mutedForeground }]}>
              Find your next load
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable style={[styles.iconBtn, { backgroundColor: theme.muted }]} onPress={onOpenFilters}>
              <Text style={{ fontSize: 15 }}>⚙️</Text>
            </Pressable>
            <Pressable style={[styles.iconBtn, { backgroundColor: theme.muted }]} onPress={onOpenKyc}>
              <Text style={{ fontSize: 17 }}>🛡️</Text>
            </Pressable>
            <Pressable style={[styles.iconBtn, { backgroundColor: theme.muted }]} onPress={onOpenTrips}>
              <Text style={{ fontSize: 17 }}>🧭</Text>
            </Pressable>
          </View>
        </View>
      )}

      {offline && (
        <View style={[styles.offlineBar, { backgroundColor: theme.warning + '22' }]}>
          <Text style={{ color: theme.warning, fontSize: 13, fontWeight: '700' }}>
            Offline — showing cached data
          </Text>
        </View>
      )}

      <View style={[styles.tabs, { borderBottomColor: theme.border }]}>
        {tabDefs.map((f) => (
          <Pressable key={f.key} style={styles.tab} onPress={() => setFilter(f.key)}>
            <Text
              style={[
                styles.tabText,
                { color: theme.mutedForeground },
                filter === f.key && { color: theme.primary, fontWeight: '800' },
              ]}
            >
              {f.label}
            </Text>
            {filter === f.key && <View style={[styles.tabIndicator, { backgroundColor: theme.primary }]} />}
          </Pressable>
        ))}
      </View>

      {lastUpdated && !offline && (
        <Text style={[styles.lastUpdated, { color: theme.mutedForeground }]}>
          Updated {timeAgo(lastUpdated.toISOString())}
        </Text>
      )}

      {loading ? (
        <FeedSkeleton />
      ) : (
        <FlatList
          data={loads}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              title={t("market.noLoads")}
              message={t("market.noLoadsHint")}
              actionLabel={t("common.refresh")}
              onAction={fetchLoads}
            />
          }
          renderItem={({ item }) => (
            <LoadCard
              from={item.pickupAddr}
              to={item.dropAddr}
              distanceKm={item.distanceKm}
              fare={item.fareEstimate}
              matchScore={(item as Load & { matchScore?: number }).matchScore}
              status={<StatusChip label={item.status.replace('_', ' ')} tone={TONE[item.status]} />}
              meta={[
                formatWeight(item.weight),
                `${item.material?.name ?? '—'}`,
                new Date(item.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
              ]}
              footer={`${item.noOfTrucks} truck${item.noOfTrucks > 1 ? 's' : ''} needed`}
              onPress={() => onSelect(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
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
  greeting: { fontSize: 13, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  offlineBar: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, alignItems: 'center' },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm },
  tabText: { fontSize: 14, fontWeight: '600' },
  tabIndicator: { position: 'absolute', bottom: -1, width: 28, height: 3, borderRadius: 2 },
  lastUpdated: { fontSize: 12, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, textAlign: 'right' },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: 100 },
})
