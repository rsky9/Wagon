import { SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable } from 'react-native'
import { useTheme, spacing, radius, formatINR } from '@wagon/design'
import { WalletHeader, EmptyState } from '@wagon/components'
import { api } from '../config'

interface Entry {
  id: string
  type: string
  amount: number
  status: string
  route: string
  createdAt: string
}

interface Props {
  onBack: () => void
  onOpenBank?: () => void
  onOpenInvoices?: () => void
}

export function FinanceScreen({ onBack, onOpenBank, onOpenInvoices }: Props) {
  const theme = useTheme()
  const [entries, setEntries] = useState<Entry[]>([])
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<{ entries: Entry[]; balance: number }>('/payments/passbook').then((res) => { setEntries(res.entries); setBalance(res.balance) }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const earnings = entries.filter((e) => e.type === 'payout' && e.status === 'succeeded').reduce((s, e) => s + e.amount, 0)
  const pending = entries.filter((e) => e.status !== 'succeeded').reduce((s, e) => s + Math.abs(e.amount), 0)

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Finance</Text>
        <View style={{ width: 20 }} />
      </View>

      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <WalletHeader balance={balance} primaryLabel="Withdraw" onPrimary={onOpenBank} secondaryLabel="Statement" onSecondary={onOpenInvoices} />
            <View style={styles.statsRow}>
              <Stat label="Total earnings" value={formatINR(earnings)} color={theme.success} theme={theme} />
              <Stat label="Pending payout" value={formatINR(pending)} color={theme.warning} theme={theme} />
            </View>
            <Text style={[styles.sectionLabel, { color: theme.mutedForeground }]}>Settlements</Text>
            {loading && <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 20 }}>Loading…</Text>}
            {!loading && entries.length === 0 && <EmptyState title="No transactions yet" message="Payouts for delivered loads appear here" icon="₹" />}
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.iconBox, { backgroundColor: item.type === 'payout' ? theme.success + '1A' : theme.danger + '1A' }]}>
              <Text style={{ fontSize: 16 }}>{item.type === 'payout' ? '↓' : '↑'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: theme.foreground }]}>{item.type === 'payout' ? 'Payout' : 'Escrow'}</Text>
              <Text style={[styles.rowRoute, { color: theme.mutedForeground }]} numberOfLines={1}>{item.route}</Text>
              <Text style={[styles.rowStatus, { color: item.status === 'succeeded' ? theme.success : theme.warning }]}>{item.status}</Text>
            </View>
            <Text style={[styles.rowAmount, { color: item.type === 'payout' ? theme.success : theme.danger }, { fontVariant: ['tabular-nums'] }]}>
              {item.type === 'payout' ? '+' : '−'}{formatINR(Math.abs(item.amount))}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  )
}

function Stat({ label, value, color, theme }: { label: string; value: string; color: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={[styles.stat, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.statLabel, { color: theme.mutedForeground }]}>{label}</Text>
      <Text style={[styles.statValue, { color }, { fontVariant: ['tabular-nums'] }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  list: { padding: spacing.lg, gap: spacing.sm },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  stat: { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  statLabel: { fontSize: 12 },
  statValue: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  sectionLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.lg, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: spacing.md },
  iconBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowRoute: { fontSize: 12, marginTop: 1 },
  rowStatus: { fontSize: 12, textTransform: 'capitalize', marginTop: 1 },
  rowAmount: { fontSize: 15, fontWeight: '800' },
})
