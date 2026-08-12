import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius, formatINR } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'
import type { Load } from '@wagon/contracts'

interface Favorite {
  id: string
  load: Load
}

interface SavedSearch {
  id: string
  name: string
  query: Record<string, unknown> | null
  createdAt: string
}

interface Props {
  onBack: () => void
  onOpenLoad?: (load: Load) => void
  onRunSearch?: (query: string) => void
}

export function FavoritesScreen({ onBack, onOpenLoad, onRunSearch }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [searches, setSearches] = useState<SavedSearch[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetch = useCallback(() => {
    Promise.all([
      api.get<{ favorites: Favorite[] }>('/favorites'),
      api.get<{ searches: SavedSearch[] }>('/favorites/searches'),
    ]).then(([f, s]) => { setFavorites(f.favorites); setSearches(s.searches) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const unsave = (loadId: string) => {
    Alert.alert(t('ui.removeSavedLoad'), 'Remove this from your saved loads?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => api.request('DELETE', `/favorites/load/${loadId}`).then(() => fetch()).catch(() => {}) },
    ])
  }

  const deleteSearch = (id: string) => {
    api.request('DELETE', `/favorites/search/${id}`).then(() => fetch()).catch(() => {})
  }

  const hasSaved = favorites.length > 0 || searches.length > 0

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('favorites.title')}</Text>
        <View style={{ width: 20 }} />
      </View>

      <FlatList
        data={favorites}
        keyExtractor={(f) => f.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(); setRefreshing(false) }} tintColor={theme.primary} colors={[theme.primary]} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          searches.length > 0 ? (
            <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
              <Text style={[styles.section, { color: theme.foreground }]}>{t('favorites.savedSearches')}</Text>
              {searches.map((s) => (
                <View key={s.id} style={[styles.searchRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Pressable style={{ flex: 1 }} onPress={() => onRunSearch?.(typeof s.query?.q === 'string' ? s.query.q : '')}>
                    <Text style={[styles.searchName, { color: theme.foreground }]}>{s.name}</Text>
                  </Pressable>
                  <Pressable onPress={() => deleteSearch(s.id)} hitSlop={8}>
                    <Text style={{ color: theme.danger }}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>{t('common.loading')}</Text>
          : <EmptyState title={t("favorites.nothingYet")} message={t("favorites.hint")} icon="🔖" />
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Pressable style={{ flex: 1 }} onPress={() => onOpenLoad?.(item.load)}>
              <View style={styles.top}>
                <Text style={[styles.fare, { color: theme.foreground }]}>{formatINR(item.load.fareEstimate)}</Text>
                <Text style={[styles.date, { color: theme.mutedForeground }]}>{new Date(item.load.date).toLocaleDateString('en-IN')}</Text>
              </View>
              <Text style={[styles.route, { color: theme.foreground }]} numberOfLines={1}>{item.load.pickupAddr} → {item.load.dropAddr}</Text>
              <Text style={[styles.meta, { color: theme.mutedForeground }]}>{item.load.weight}t · {item.load.distanceKm} km</Text>
            </Pressable>
            <Pressable style={[styles.unsave, { borderColor: theme.border }]} onPress={() => unsave(item.load.id)}>
              <Text style={{ color: theme.mutedForeground, fontSize: 12, fontWeight: '700' }}>{t('common.remove')}</Text>
            </Pressable>
          </View>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  list: { padding: spacing.lg, gap: spacing.md },
  section: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  searchRow: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: spacing.md },
  searchName: { fontSize: 14, fontWeight: '600' },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fare: { fontSize: 18, fontWeight: '800' },
  date: { fontSize: 12 },
  route: { fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 12 },
  unsave: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
})
