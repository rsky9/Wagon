import { SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'
import { api } from '../config'

interface RateCardRow {
  modelId: string
  type: string
  model: string
  capacities: number[]
  pricePerKm: number
}

interface Props {
  onBack: () => void
}

export function RateCardScreen({ onBack }: Props) {
  const theme = useTheme()
  const [cards, setCards] = useState<RateCardRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<{ rateCards: RateCardRow[] }>('/reference/rate-cards').then((res) => setCards(res.rateCards)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const grouped = {
    open: cards.filter((c) => c.type === 'open'),
    container: cards.filter((c) => c.type === 'container'),
    trailer: cards.filter((c) => c.type === 'trailer'),
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Rate Card</Text>
        <View style={{ width: 20 }} />
      </View>

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>Loading…</Text>
      ) : (
        <FlatList
          data={['open', 'container', 'trailer']}
          keyExtractor={(t) => t}
          contentContainerStyle={styles.list}
          renderItem={({ item: type }) => {
            const rows = grouped[type as keyof typeof grouped]
            if (rows.length === 0) return null
            return (
              <View style={styles.group}>
                <Text style={[styles.groupLabel, { color: theme.mutedForeground }]}>{type.toUpperCase()}</Text>
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  {rows.map((r, i) => (
                    <View key={r.modelId} style={[styles.row, i > 0 && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.model, { color: theme.foreground }]}>{r.model}</Text>
                        <Text style={[styles.capacity, { color: theme.mutedForeground }]}>{r.capacities.join(', ')} t</Text>
                      </View>
                      <View style={styles.priceBox}>
                        <Text style={[styles.price, { color: theme.primary }, { fontVariant: ['tabular-nums'] }]}>₹{r.pricePerKm}</Text>
                        <Text style={[styles.perKm, { color: theme.mutedForeground }]}>/km</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  list: { padding: spacing.lg },
  group: { marginBottom: spacing.xl },
  groupLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 1, marginBottom: spacing.sm },
  card: { borderRadius: radius.xl, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  model: { fontSize: 16, fontWeight: '700' },
  capacity: { fontSize: 12, marginTop: 1 },
  priceBox: { alignItems: 'flex-end' },
  price: { fontSize: 18, fontWeight: '800' },
  perKm: { fontSize: 11 },
})
