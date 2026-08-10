import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius, formatINR } from '@wagon/design'
import { StatusChip, EmptyState, type StatusTone } from '@wagon/components'
import { api } from '../config'
import type { Load } from '@wagon/contracts'

interface MyBid {
  id: string
  amount: number
  status: string
  advanceAmount?: number | null
  balanceAmount?: number | null
  pickupBy?: string | null
  etaHours?: number | null
  createdAt: string
  load: Load
}

interface Props {
  onBack: () => void
  onOpenLoad?: (load: Load) => void
}

const TONE: Record<string, StatusTone> = {
  pending: 'info',
  shortlisted: 'success',
  negotiating: 'warning',
  accepted: 'success',
  booking_pending: 'brand',
  rejected: 'danger',
  withdrawn: 'warning',
  expired: 'warning',
}

export function MyBidsScreen({ onBack, onOpenLoad }: Props) {
  const theme = useTheme()
  const [bids, setBids] = useState<MyBid[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetch = useCallback(() => {
    api.get<{ bids: MyBid[] }>('/bidding/mine').then((res) => setBids(res.bids)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const withdraw = (bid: MyBid) => {
    Alert.alert('Withdraw bid?', `Remove your bid of ${formatINR(bid.amount)}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: () => api.post(`/bidding/bid/${bid.id}/withdraw`).then(() => { Alert.alert('Withdrawn', 'Bid removed'); fetch() }).catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'Failed')) },
    ])
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>My bids</Text>
        <View style={{ width: 20 }} />
      </View>

      <FlatList
        data={bids}
        keyExtractor={(b) => b.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(); setRefreshing(false) }} tintColor={theme.primary} colors={[theme.primary]} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>Loading…</Text>
          : <EmptyState title="No bids yet" message="Loads you bid on will appear here" icon="🤝" />
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Pressable onPress={() => onOpenLoad?.(item.load)}>
              <View style={styles.top}>
                <Text style={[styles.amount, { color: theme.foreground }]}>{formatINR(item.amount)}</Text>
                <StatusChip label={item.status.replace('_', ' ')} tone={TONE[item.status]} />
              </View>
              <Text style={[styles.route, { color: theme.foreground }]} numberOfLines={1}>{item.load.pickupAddr} → {item.load.dropAddr}</Text>
              <Text style={[styles.meta, { color: theme.mutedForeground }]}>
                {item.load.weight}t · {item.load.distanceKm} km
                {item.advanceAmount ? ` · Advance ${formatINR(item.advanceAmount)}` : ''}
                {item.pickupBy ? ` · Pickup by ${item.pickupBy}` : ''}
              </Text>
              <Text style={[styles.time, { color: theme.mutedForeground }]}>Bid {new Date(item.createdAt).toLocaleDateString('en-IN')}</Text>
            </Pressable>
            {(item.status === 'pending' || item.status === 'shortlisted') && (
              <Pressable style={[styles.withdraw, { borderColor: theme.danger + '55' }]} onPress={() => withdraw(item)}>
                <Text style={{ color: theme.danger, fontWeight: '700', fontSize: 13 }}>Withdraw bid</Text>
              </Pressable>
            )}
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
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontSize: 18, fontWeight: '800' },
  route: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12 },
  time: { fontSize: 11, opacity: 0.8 },
  withdraw: { borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center', marginTop: spacing.xs },
})
