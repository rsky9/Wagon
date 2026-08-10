import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert } from 'react-native'
import { useTheme, spacing, radius, formatWeight } from '@wagon/design'
import { StatusChip, EmptyState } from '@wagon/components'
import { api } from '../config'

interface TruckRow {
  id: string
  truckNo: string
  type: string
  activeStatus: boolean
  origin?: string
  driver?: { name: string; mobile: string } | null
}

interface Props {
  onBack: () => void
  onAdd: () => void
}

export function MyTrucksScreen({ onBack, onAdd }: Props) {
  const theme = useTheme()
  const [trucks, setTrucks] = useState<TruckRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    api.get<{ trucks: TruckRow[] }>('/trucks').then((res) => setTrucks(res.trucks)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const remove = (id: string, truckNo: string) => {
    Alert.alert('Remove truck', `Remove ${truckNo}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await api.request('DELETE', `/trucks/${id}`).catch(() => {}); fetch() } },
    ])
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>My Trucks</Text>
        <Pressable onPress={onAdd}>
          <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 22 }}>+</Text>
        </Pressable>
      </View>

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>Loading…</Text>
      ) : (
        <FlatList
          data={trucks}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState title="No trucks yet" message="Add your first truck to start taking loads" actionLabel="Add truck" onAction={onAdd} icon="🚛" />
          }
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.truckNo, { color: theme.foreground }]}>{item.truckNo}</Text>
                <StatusChip label={item.activeStatus ? 'Active' : 'Inactive'} tone={item.activeStatus ? 'success' : 'neutral'} />
              </View>
              <View style={styles.metaRow}>
                <Meta label="Type" value={item.type} theme={theme} />
                <Meta label="Origin" value={item.origin ?? '—'} theme={theme} />
                <Meta label="Driver" value={item.driver?.name ?? 'Unassigned'} theme={theme} />
              </View>
              <Pressable onPress={() => remove(item.id, item.truckNo)} hitSlop={8} style={{ alignSelf: 'flex-end' }}>
                <Text style={{ color: theme.danger, fontSize: 13 }}>Remove</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  )
}

function Meta({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.metaLabel, { color: theme.mutedForeground }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: theme.foreground }]} numberOfLines={1}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  truckNo: { fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  metaRow: { flexDirection: 'row', gap: spacing.md },
  metaLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { fontSize: 14, fontWeight: '600', marginTop: 1 },
})
