import { SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, View, FlatList, Pressable, Alert, ScrollView } from 'react-native'
import { useTheme, spacing, radius, formatINR, formatWeight } from '@wagon/design'
import { StatusChip, EmptyState, type StatusTone } from '@wagon/components'
import { api } from '../config'
import type { Load } from '@wagon/contracts'
import { useI18n } from '@wagon/i18n'
import { alertPrompt } from '../components/Prompt'
interface Props {
  onBack: () => void
  onSelect: (load: Load) => void
  initialQuery?: string
  onOpenMarket?: () => void
}

const TONE: Record<string, StatusTone> = {
  posted: 'success',
  interested: 'warning',
  accepted: 'info',
  in_transit: 'brand',
  delivered: 'success',
  cancelled: 'danger',
}

type Scope = 'loads' | 'capacity' | 'shipments'

const KIND_LABEL: Record<string, string> = {
  truck_capacity: 'Truck capacity',
  warehouse_space: 'Warehouse space',
  carrier_service: 'Carrier service',
  forwarder_service: 'Forwarder service',
  transport: 'Transport',
  warehouse: 'Warehouse',
  forwarding: 'Forwarding',
  carrier: 'Carrier',
  insurance: 'Insurance',
}

const LOAD_SORTS: Array<{ key: string; label: string }> = [
  { key: 'newest', label: 'Newest' },
  { key: 'cheapest', label: 'Cheapest' },
  { key: 'priciest', label: 'Priciest' },
  { key: 'nearest', label: 'Nearest' },
  { key: 'lightest', label: 'Lightest' },
  { key: 'heaviest', label: 'Heaviest' },
]

const MARKET_SORTS: Array<{ key: string; label: string }> = [
  { key: 'newest', label: 'Newest' },
  { key: 'cheapest', label: 'Cheapest' },
  { key: 'priciest', label: 'Priciest' },
  { key: 'capacity', label: 'Most capacity' },
]

export function SearchScreen({ onBack, onSelect, onOpenMarket, initialQuery }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [query, setQuery] = useState(typeof initialQuery === 'string' ? initialQuery : '')
  const [scope, setScope] = useState<Scope>('loads')
  const [kind, setKind] = useState('')
  const [sort, setSort] = useState('newest')
  const [results, setResults] = useState<Load[]>([])
  const [marketResults, setMarketResults] = useState<Array<{ id: string; kind: string; title: string; sub: string; price?: number | null; status: string }>>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)

  const saveSearch = () => {
    if (!query.trim()) { Alert.alert(t('ui.nothingToSave'), 'Type a search first'); return }
    alertPrompt(t('ui.saveThisSearch'), 'Name it for quick access', [{ text: 'Cancel', style: 'cancel' }, { text: 'Save', onPress: (name?: string) => {
      api.post('/favorites/search', { name: name?.trim() || query.trim(), query: { q: query.trim() } })
        .then(() => Alert.alert(t('ui.saved'), 'Search saved — find it under Account → Saved'))
        .catch(() => Alert.alert(t('ui.error'), 'Failed to save'))
    } }])
  }

  useEffect(() => {
    if (scope === 'loads') {
      setResults([])
    } else {
      setMarketResults([])
    }
    if (!query.trim()) { setSearched(false); return }
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        if (scope === 'loads') {
          const params = new URLSearchParams({ q: query.trim(), sort })
          if (kind) params.set('truckType', kind)
          const res = await api.get<{ items: Load[] }>(`/loads?${params.toString()}`)
          setResults(res.items)
        } else if (scope === 'capacity') {
          const params = new URLSearchParams({ q: query.trim(), sort })
          if (kind) params.set('kind', kind)
          const res = await api.get<{ listings: Array<{ id: string; kind: string; originRef?: string | null; destinationRef?: string | null; city?: string | null; price?: number | null; currency: string; status: string }> }>(`/market/listings?${params.toString()}`)
          setMarketResults((res.listings ?? []).map((l) => ({
            id: l.id,
            kind: KIND_LABEL[l.kind] ?? l.kind,
            title: `${l.originRef ?? l.city ?? '—'} → ${l.destinationRef ?? '—'}`,
            sub: KIND_LABEL[l.kind] ?? l.kind,
            price: l.price,
            status: l.status,
          })))
        } else {
          const params = new URLSearchParams({ q: query.trim(), sort })
          if (kind) params.set('kind', kind)
          const res = await api.get<{ requests: Array<{ id: string; kind: string; originRef?: string | null; destinationRef?: string | null; city?: string | null; budget?: number | null; currency: string; status: string }> }>(`/market/requests?${params.toString()}`)
          setMarketResults((res.requests ?? []).map((r) => ({
            id: r.id,
            kind: KIND_LABEL[r.kind] ?? r.kind,
            title: `${r.originRef ?? r.city ?? '—'} → ${r.destinationRef ?? '—'}`,
            sub: KIND_LABEL[r.kind] ?? r.kind,
            price: r.budget,
            status: r.status,
          })))
        }
        setSearched(true)
      } catch { setMarketResults([]); setResults([]) } finally { setLoading(false) }
    }, 350)
    return () => clearTimeout(timer)
  }, [query, scope, kind, sort])

  const kinds = scope === 'loads'
    ? [['', 'All'], ['open', 'Open'], ['container', 'Container'], ['trailer', 'Trailer']] as const
    : [['', 'All'], ...Object.entries(KIND_LABEL)] as [string, string][]

  const sorts = scope === 'loads' ? LOAD_SORTS : MARKET_SORTS

  const nothing = scope === 'loads' ? results.length === 0 : marketResults.length === 0

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <TextInput
          style={[styles.searchInput, { backgroundColor: theme.muted, color: theme.foreground }]}
          placeholder={t('search.placeholder')}
          placeholderTextColor={theme.mutedForeground}
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
        <Pressable onPress={saveSearch} hitSlop={8}>
          <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 14 }}>{t('search.save')}</Text>
        </Pressable>
      </View>

      {/* Scope switcher */}
      <View style={[styles.scopeRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {([['loads', 'Loads'], ['capacity', 'Capacity'], ['shipments', 'Shipments']] as [Scope, string][]).map(([k, label]) => (
          <Pressable key={k} style={[styles.scopeBtn, scope === k && { backgroundColor: theme.primary }]} onPress={() => { setScope(k); setKind(''); setSort('newest'); setSearched(false) }}>
            <Text style={[styles.scopeLabel, { color: scope === k ? '#fff' : theme.mutedForeground }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {(scope === 'capacity' || scope === 'shipments') && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
          {kinds.map(([k, label]) => (
            <Pressable key={k} onPress={() => setKind(k)} style={[styles.chip, { backgroundColor: kind === k ? theme.primary : theme.card, borderColor: kind === k ? theme.primary : theme.border }]}>
              <Text style={[styles.chipText, { color: kind === k ? '#fff' : theme.mutedForeground }]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Sort selector */}
      <View style={[styles.chipRow, { marginTop: spacing.sm }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.lg }}>
          {sorts.map((s) => (
            <Pressable key={s.key} onPress={() => setSort(s.key)} style={[styles.chip, { backgroundColor: sort === s.key ? theme.primary : theme.card, borderColor: sort === s.key ? theme.primary : theme.border }]}>
              <Text style={[styles.chipText, { color: sort === s.key ? '#fff' : theme.mutedForeground }]}>{s.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 40 }}>{t('search.searching')}</Text>
      ) : searched && nothing ? (
        <EmptyState title={t('search.noResults')} message={`No ${scope} match "${query}"`} icon="🔍" />
      ) : scope === 'loads' ? (
        <FlatList
          data={results}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => onSelect(item)}>
              <View style={styles.cardTop}>
                <Text style={[styles.fare, { color: theme.foreground }, { fontVariant: ['tabular-nums'] }]}>{formatINR(item.fareEstimate)}</Text>
                <StatusChip label={item.status.replace('_', ' ')} tone={TONE[item.status]} />
              </View>
              <Text style={[styles.route, { color: theme.foreground }]}>{item.pickupAddr} → {item.dropAddr}</Text>
              <Text style={[styles.meta, { color: theme.mutedForeground }]}>{formatWeight(item.weight)} · {item.distanceKm} km · {item.material?.name ?? '—'}</Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={marketResults}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={onOpenMarket ? () => onOpenMarket() : undefined}>
              <View style={styles.cardTop}>
                <Text style={[styles.fare, { color: theme.foreground }]}>{item.price != null ? formatINR(item.price) : '—'}</Text>
                <StatusChip label={item.status.replace('_', ' ')} tone={TONE[item.status] ?? 'info'} />
              </View>
              <Text style={[styles.route, { color: theme.foreground }]}>{item.title}</Text>
              <Text style={[styles.meta, { color: theme.mutedForeground }]}>{item.sub} · {onOpenMarket ? 'Tap to view in marketplace ›' : 'View in marketplace to quote'}</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  searchInput: { flex: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15 },
  scopeRow: { flexDirection: 'row', margin: spacing.lg, marginBottom: spacing.sm, borderRadius: radius.lg, borderWidth: 1, padding: 4, gap: 4 },
  scopeBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md },
  scopeLabel: { fontSize: 13, fontWeight: '800' },
  chipRow: { flexGrow: 0 },
  chip: { borderRadius: radius.full, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 6 },
  chipText: { fontSize: 12, fontWeight: '700' },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fare: { fontSize: 18, fontWeight: '800' },
  route: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 13 },
})
