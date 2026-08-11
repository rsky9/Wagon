import { SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, View, FlatList, Pressable, Alert } from 'react-native'
import { useTheme, spacing, radius, formatINR, formatWeight } from '@wagon/design'
import { StatusChip, EmptyState, type StatusTone } from '@wagon/components'
import { api } from '../config'
import type { Load } from '@wagon/contracts'
import { useI18n } from '@wagon/i18n'

interface Props {
  onBack: () => void
  onSelect: (load: Load) => void
  initialQuery?: string
}

const TONE: Record<string, StatusTone> = {
  posted: 'success',
  interested: 'warning',
  accepted: 'info',
  in_transit: 'brand',
  delivered: 'success',
  cancelled: 'danger',
}

export function SearchScreen({ onBack, onSelect, initialQuery }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [query, setQuery] = useState(initialQuery ?? '')
  const [results, setResults] = useState<Load[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)

  const saveSearch = () => {
    if (!query.trim()) { Alert.alert(t('ui.nothingToSave'), 'Type a search first'); return }
    Alert.prompt(t('ui.saveThisSearch'), 'Name it for quick access', [{ text: 'Cancel', style: 'cancel' }, { text: 'Save', onPress: (name?: string) => {
      api.post('/favorites/search', { name: name?.trim() || query.trim(), query: { q: query.trim() } })
        .then(() => Alert.alert(t('ui.saved'), 'Search saved — find it under Account → Saved'))
        .catch(() => Alert.alert(t('ui.error'), 'Failed to save'))
    } }])
  }

  useEffect(() => {
    if (!query.trim()) { setResults([]); setSearched(false); return }
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await api.get<{ items: Load[] }>(`/loads?q=${encodeURIComponent(query)}`)
        setResults(res.items)
        setSearched(true)
      } catch { setResults([]) } finally { setLoading(false) }
    }, 400)
    return () => clearTimeout(timer)
  }, [query])

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

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 40 }}>{t('search.searching')}</Text>
      ) : searched && results.length === 0 ? (
        <EmptyState title={t('search.noResults')} message={`No loads match "${query}"`} icon="🔍" />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.list}
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
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  searchInput: { flex: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15 },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fare: { fontSize: 18, fontWeight: '800' },
  route: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 13 },
})
