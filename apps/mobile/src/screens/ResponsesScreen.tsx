import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable } from 'react-native'
import { useTheme, spacing, radius, formatINR, timeAgo } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { api } from '../config'

interface ResponseRow {
  quoteId: string
  loadId: string
  route: string
  amount: number
  status: string
  createdAt: string
}

interface Props {
  onBack: () => void
  onSelectLoad: (loadId: string) => void
}

export function ResponsesScreen({ onBack, onSelectLoad }: Props) {
  const theme = useTheme()
  const [responses, setResponses] = useState<ResponseRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    api.get<{ responses: ResponseRow[] }>('/loads/responses/mine').then((res) => setResponses(res.responses)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Responses</Text>
        <View style={{ width: 20 }} />
      </View>

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>Loading…</Text>
      ) : (
        <FlatList
          data={responses}
          keyExtractor={(r) => r.quoteId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="No responses yet" message="When transporters quote on your loads, they'll appear here" icon="📨" />}
          renderItem={({ item }) => (
            <Pressable style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => onSelectLoad(item.loadId)}>
              <View style={styles.cardTop}>
                <Text style={[styles.amount, { color: theme.primary }, { fontVariant: ['tabular-nums'] }]}>{formatINR(item.amount)}</Text>
                <View style={[styles.badge, { backgroundColor: item.status === 'pending' ? theme.warning + '1A' : theme.success + '1A' }]}>
                  <Text style={{ color: item.status === 'pending' ? theme.warning : theme.success, fontSize: 12, fontWeight: '700' }}>{item.status}</Text>
                </View>
              </View>
              <Text style={[styles.route, { color: theme.foreground }]}>{item.route}</Text>
              <Text style={[styles.time, { color: theme.mutedForeground }]}>Quoted {timeAgo(item.createdAt)}</Text>
            </Pressable>
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
  amount: { fontSize: 20, fontWeight: '800' },
  badge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  route: { fontSize: 15, fontWeight: '700' },
  time: { fontSize: 12 },
})
