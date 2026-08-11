import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius, formatINR } from '@wagon/design'
import { WalletHeader, EmptyState } from '@wagon/components'
import { api } from '../config'

interface PassbookEntry {
  id: string
  tripId: string
  loadId: string
  route: string
  type: string
  amount: number
  status: string
  createdAt: string
}

interface WalletTx {
  id: string
  kind: string
  amount: number
  note?: string | null
  createdAt: string
}

interface Props {
  onBack: () => void
  onOpenBank?: () => void
  onOpenInvoices?: () => void
}

export function PassbookScreen({ onBack, onOpenBank, onOpenInvoices }: Props) {
  const theme = useTheme()
  const [entries, setEntries] = useState<PassbookEntry[]>([])
  const [balance, setBalance] = useState(0)
  const [cashback, setCashback] = useState(0)
  const [walletTxs, setWalletTxs] = useState<WalletTx[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<{ entries: PassbookEntry[]; balance: number }>('/payments/passbook'),
      api.get<{ balance: number; transactions: WalletTx[] }>('/payments/wallet').catch(() => ({ balance: 0, transactions: [] })),
    ])
      .then(([pb, w]) => {
        setEntries(pb.entries)
        setBalance(pb.balance)
        setCashback(w.balance)
        setWalletTxs(w.transactions)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load passbook'))
      .finally(() => setLoading(false))
  }, [])

  const pending = entries.filter((e) => e.status !== 'succeeded')

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={[styles.back, { color: theme.mutedForeground }]}>←</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.foreground }]}>Passbook</Text>
        <View style={{ width: 30 }} />
      </View>

      <FlatList
        data={entries.length ? ['__header__', ...entries] : []}
        keyExtractor={(item, idx) => (item === '__header__' ? '__header__' : (item as PassbookEntry).id ?? String(idx))}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.top}>
            <WalletHeader
              balance={balance}
              primaryLabel="Withdraw"
              secondaryLabel="Statement"
              onPrimary={() => Alert.alert('Withdraw', 'Withdrawals are released after each delivered trip payout. Your available balance settles automatically.', [{ text: 'OK' }])}
              onSecondary={() => {
                setLoading(true)
                api
                  .get<{ entries: PassbookEntry[]; balance: number }>('/payments/passbook')
                  .then((res) => { setEntries(res.entries); setBalance(res.balance) })
                  .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load passbook'))
                  .finally(() => setLoading(false))
              }}
            />
            {cashback > 0 && (
              <View style={[styles.cashback, { backgroundColor: theme.card, borderColor: theme.primary + '44' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cashbackLabel, { color: theme.mutedForeground }]}>Wagon Cash · rewards</Text>
                  <Text style={[styles.cashbackAmount, { color: theme.foreground }]}>
                    {formatINR(cashback)}
                  </Text>
                  {walletTxs.length > 0 && (
                    <Text style={[styles.cashbackSub, { color: theme.mutedForeground }]} numberOfLines={1}>
                      {walletTxs[0].note ?? 'Earned from quests & trip cashback'}
                    </Text>
                  )}
                </View>
                <Text style={{ fontSize: 26 }}>🎁</Text>
              </View>
            )}
            {pending.length > 0 && (
              <View style={[styles.pending, { backgroundColor: theme.warning + '22', borderColor: theme.warning + '44' }]}>
                <Text style={{ color: theme.warning, fontWeight: '700', fontSize: 14 }}>
                  ⏳ {pending.length} payout{pending.length > 1 ? 's' : ''} processing
                </Text>
              </View>
            )}
            {onOpenBank && (
              <Pressable style={[styles.bankRow, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={onOpenBank}>
                <Text style={{ fontSize: 18 }}>🏦</Text>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={[styles.bankTitle, { color: theme.foreground }]}>Bank & payouts</Text>
                  <Text style={[styles.bankSub, { color: theme.mutedForeground }]}>Manage your payout account</Text>
                </View>
                <Text style={{ color: theme.mutedForeground }}>›</Text>
              </Pressable>
            )}
            {onOpenInvoices && (
              <Pressable style={[styles.bankRow, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={onOpenInvoices}>
                <Text style={{ fontSize: 18 }}>🧾</Text>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={[styles.bankTitle, { color: theme.foreground }]}>Invoices</Text>
                  <Text style={[styles.bankSub, { color: theme.mutedForeground }]}>GST & TDS breakups</Text>
                </View>
                <Text style={{ color: theme.mutedForeground }}>›</Text>
              </Pressable>
            )}
            <Text style={[styles.sectionLabel, { color: theme.mutedForeground }]}>Transactions</Text>
            {loading && <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: spacing.xl }}>Loading…</Text>}
            {error && <Text style={{ color: theme.danger, textAlign: 'center', marginTop: spacing.xl }}>{error}</Text>}
            {!loading && entries.length === 0 && (
              <EmptyState
                title="No transactions yet"
                message="Your payouts for delivered loads will show here"
                actionLabel="Browse loads"
                onAction={onBack}
              />
            )}
          </View>
        }
        renderItem={({ item }) => {
          if (item === '__header__') return null
          return <EntryRow entry={item as PassbookEntry} />
        }}
      />
    </SafeAreaView>
  )
}

function EntryRow({ entry }: { entry: PassbookEntry }) {
  const theme = useTheme()
  const isCredit = entry.amount > 0
  const isPending = entry.status !== 'succeeded'
  return (
    <View style={[styles.entry, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={[styles.entryIcon, { backgroundColor: isCredit ? theme.success + '1A' : theme.danger + '1A' }]}>
        <Text style={{ fontSize: 16 }}>{isCredit ? '↓' : isPending ? '⏳' : '↑'}</Text>
      </View>
      <View style={styles.entryBody}>
        <Text style={[styles.entryTitle, { color: theme.foreground }]}>
          {entry.type === 'payout' ? 'Payout' : entry.type === 'escrow' ? 'Escrow payment' : 'Refund'}
        </Text>
        <Text style={[styles.entryRoute, { color: theme.mutedForeground }]} numberOfLines={1}>
          {entry.route}
        </Text>
      </View>
      <View style={styles.entryRight}>
        <Text
          style={[
            styles.entryAmount,
            { color: isCredit ? theme.success : theme.danger },
            { fontVariant: ['tabular-nums'] },
          ]}
        >
          {isCredit ? '+' : '−'}{formatINR(Math.abs(entry.amount))}
        </Text>
        <Text style={[styles.entryStatus, { color: isPending ? theme.warning : theme.mutedForeground }]}>
          {entry.status}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  back: { fontSize: 20, fontWeight: '600', width: 30 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  list: { padding: spacing.lg, paddingBottom: 100 },
  top: { gap: spacing.lg },
  pending: { borderRadius: radius.md, padding: spacing.md, borderWidth: 1 },
  cashback: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  cashbackLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  cashbackAmount: { fontSize: 26, fontWeight: '800', marginTop: 2 },
  cashbackSub: { fontSize: 12, marginTop: 3 },
  sectionLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm },
  bankRow: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  bankTitle: { fontSize: 15, fontWeight: '700' },
  bankSub: { fontSize: 12, marginTop: 1 },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  entryIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  entryBody: { flex: 1 },
  entryTitle: { fontSize: 15, fontWeight: '700' },
  entryRoute: { fontSize: 12, marginTop: 1 },
  entryRight: { alignItems: 'flex-end' },
  entryAmount: { fontSize: 15, fontWeight: '800' },
  entryStatus: { fontSize: 12, textTransform: 'capitalize', marginTop: 1 },
})
