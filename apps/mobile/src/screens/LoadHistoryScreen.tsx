import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable } from 'react-native'
import { useTheme, spacing, radius, formatINR } from '@wagon/design'
import { StatusChip, EmptyState, type StatusTone } from '@wagon/components'
import { api } from '../config'
import type { Load } from '@wagon/contracts'

interface Props {
  onBack: () => void
}

const TONE: Record<string, StatusTone> = {
  completed: 'success',
  cancelled: 'danger',
}

export function LoadHistoryScreen({ onBack }: Props) {
  const theme = useTheme()
  const [loads, setLoads] = useState<Load[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    api.get<{ loads: Load[] }>('/loads/history/mine').then((res) => setLoads(res.loads)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Load history</Text>
        <View style={{ width: 20 }} />
      </View>

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>Loading…</Text>
      ) : (
        <FlatList
          data={loads}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="No history" message="Completed and cancelled loads appear here" icon="🗂️" />}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.fare, { color: theme.foreground }, { fontVariant: ['tabular-nums'] }]}>{formatINR(item.fareEstimate)}</Text>
                <StatusChip label={item.status.replace('_', ' ')} tone={TONE[item.status]} />
              </View>
              <Text style={[styles.route, { color: theme.foreground }]}>{item.pickupAddr} → {item.dropAddr}</Text>
              <Text style={[styles.meta, { color: theme.mutedForeground }]}>
                {item.weight}t · {item.distanceKm} km · {new Date(item.date).toLocaleDateString('en-IN')}
                {item.cancelReason ? ` · Cancelled: ${item.cancelReason}` : ''}
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fare: { fontSize: 18, fontWeight: '800' },
  route: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 13 },
})
