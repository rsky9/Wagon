import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { api } from '../config'
import type { ForwardOrder, Consolidation } from '@wagon/contracts'

interface Props {
  onBack: () => void
  onOpenOrders: () => void
}

export function ForwardingScreen({ onBack, onOpenOrders }: Props) {
  const theme = useTheme()
  const [orders, setOrders] = useState<ForwardOrder[]>([])
  const [consolidations, setConsolidations] = useState<Consolidation[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    Promise.all([
      api.get<{ orders: ForwardOrder[] }>('/forwarding/orders'),
      api.get<{ consolidations: Consolidation[] }>('/forwarding/consolidations'),
    ]).then(([o, c]) => { setOrders(o.orders); setConsolidations(c.consolidations) }).catch(() => {}).finally(() => setLoading(false))
  }, [])
  useEffect(() => { fetch() }, [fetch])

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Forwarding</Text>
        <Pressable onPress={onOpenOrders} hitSlop={8}><Text style={{ color: '#F97316', fontSize: 14, fontWeight: '800' }}>+ Order</Text></Pressable>
      </View>

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>Loading…</Text>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={[{ type: 'orders' as const }, { type: 'consolidations' as const }]}
          keyExtractor={(i) => i.type}
          renderItem={({ item }) => (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.foreground }]}>
                {item.type === 'orders' ? `Forward orders (${orders.length})` : `Consolidations (${consolidations.length})`}
              </Text>
              {item.type === 'orders'
                ? orders.length === 0
                  ? <EmptyState title="No orders" message="Add a forward order to start" icon="🧾" />
                  : orders.map((o) => (
                    <View key={o.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                      <View style={styles.cardTop}>
                        <Text style={[styles.cardTitle, { color: theme.foreground }]}>{o.ref}</Text>
                        <Text style={[styles.chip, { color: theme.warning, borderColor: theme.warning }]}>{o.status}</Text>
                      </View>
                      <Text style={[styles.meta, { color: theme.mutedForeground }]}>
                        Buy ₹{(o.buyAmount ?? 0).toLocaleString('en-IN')} · Sell ₹{(o.sellAmount ?? 0).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  ))
                : consolidations.length === 0
                  ? <EmptyState title="No consolidations" message="Group orders into LCL shipments" icon="📦" />
                  : consolidations.map((c) => (
                    <View key={c.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                      <View style={styles.cardTop}>
                        <Text style={[styles.cardTitle, { color: theme.foreground }]}>{c.ref}</Text>
                        <Text style={[styles.chip, { color: theme.success, borderColor: theme.success }]}>{c.status}</Text>
                      </View>
                      <Text style={[styles.meta, { color: theme.mutedForeground }]}>
                        {c.origin ?? '—'} → {c.destination ?? '—'} · {c.equipment ?? '—'} · {c.cargoWeightKg ?? 0} kg
                      </Text>
                    </View>
                  ))}
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
  list: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  chip: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2, textTransform: 'uppercase' },
  meta: { fontSize: 13 },
})
