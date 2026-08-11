import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius, formatINR } from '@wagon/design'
import { EmptyState, StatusChip } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'

interface DecisionBid {
  id: string
  amount: number
  status: string
  transporterName: string
  rating: number
  tripsCount: number
  completedTrips: number
  cancelRate: number
  score: number
  advanceAmount?: number | null
  balanceAmount?: number | null
  pickupBy?: string | null
  etaHours?: number | null
}

interface DecisionSummary {
  totalBids: number
  shortlisted: number
  negotiating: number
  bestPrice: number | null
}

interface DecisionRoomData {
  load: { id: string; route: string; commercialModel: string; status: string }
  bids: DecisionBid[]
  summary: DecisionSummary
}

interface Props {
  loadId: string
  onBack: () => void
  onConfirmed: () => void
  onNegotiate?: () => void
}

export function DecisionRoomScreen({ loadId, onBack, onConfirmed, onNegotiate }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [data, setData] = useState<DecisionRoomData | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    api.get<DecisionRoomData>(`/bidding/load/${loadId}/decision-room`).then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [loadId])

  useEffect(() => { fetch() }, [fetch])

  const shortlist = (bidId: string) => {
    api.post(`/bidding/bid/${bidId}/shortlist`).then(() => { fetch() }).catch(() => Alert.alert(t('ui.error'), 'Failed to shortlist'))
  }

  const reject = (bidId: string) => {
    Alert.alert(t('ui.rejectBid'), 'This removes the bid from consideration.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => api.post(`/bidding/bid/${bidId}/reject`).then(() => fetch()).catch(() => {}) },
    ])
  }

  const counter = (bidId: string, current: number) => {
    Alert.prompt('Counteroffer', 'Enter your amount', [{ text: 'Cancel', style: 'cancel' }, { text: 'Send', onPress: (amount?: string) => {
      const n = Number(amount ?? 0)
      if (!n || n <= 0) { Alert.alert(t('ui.invalidAmount'), 'Enter a positive amount'); return }
      api.post(`/bidding/bid/${bidId}/counter`, { amount: n }).then(() => fetch()).catch(() => Alert.alert(t('ui.error'), 'Failed to send'))
    } }])
  }

  const confirm = (bidId: string, amount: number) => {
    Alert.alert(t('ui.proposeBooking'), `Send a booking proposal at ₹${amount.toLocaleString('en-IN')}? The transporter must confirm it.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Propose', onPress: () => api.post(`/bidding/load/${loadId}/confirm`, { bidId }).then(() => { Alert.alert(t('ui.proposed'), 'Booking proposal sent — waiting for transporter confirmation'); onConfirmed() }).catch((e) => Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed')) },
    ])
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('decisionRoom.title')}</Text>
        <View style={{ width: 20 }} />
      </View>

      <FlatList
        data={data?.bids ?? []}
        keyExtractor={(b) => b.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(); setRefreshing(false) }} tintColor={theme.primary} colors={[theme.primary]} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          data ? (
            <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.route, { color: theme.foreground }]}>{data.load.route}</Text>
              <View style={styles.summaryRow}>
                <Stat label={t('decisionRoom.bids')} value={data.summary.totalBids} theme={theme} />
                <Stat label={t('decisionRoom.shortlisted')} value={data.summary.shortlisted} theme={theme} />
                <Stat label={t('decisionRoom.negotiating')} value={data.summary.negotiating} theme={theme} />
                <Stat label={t('decisionRoom.bestPrice')} value={data.summary.bestPrice ? formatINR(data.summary.bestPrice) : '—'} theme={theme} small />
              </View>
              {onNegotiate && (
                <Pressable style={[styles.negBtn, { backgroundColor: theme.primary }]} onPress={onNegotiate}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{t('decisionRoom.timeline')}</Text>
                </Pressable>
              )}
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>{t('common.loading')}</Text>
          : <EmptyState title={t('decisionRoom.noBids')} message="Qualified transporters will submit structured bids here" icon="🤝" />
        }
        renderItem={({ item }) => (
          <View style={[styles.bidCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.bidTop}>
              <Text style={[styles.bidAmount, { color: theme.foreground }]}>{formatINR(item.amount)}</Text>
              <StatusChip label={item.status.replace('_', ' ')} tone={item.status === 'shortlisted' ? 'success' : item.status === 'negotiating' ? 'warning' : 'info'} />
            </View>
            <Text style={[styles.bidder, { color: theme.foreground }]}>{item.transporterName}</Text>
            <View style={styles.metrics}>
              <Metric label={t('decisionRoom.matchScore')} value={`${item.score}/100`} theme={theme} />
              <Metric label={t('decisionRoom.rating')} value={`${item.rating.toFixed(1)}★`} theme={theme} />
              <Metric label={t('decisionRoom.tripsDone')} value={`${item.completedTrips}/${item.tripsCount}`} theme={theme} />
              <Metric label={t('decisionRoom.advance')} value={item.advanceAmount ? formatINR(item.advanceAmount) : '—'} theme={theme} />
            </View>

            <View style={styles.actions}>
              <ActionBtn label={t('decisionRoom.shortlist')} tone="success" onPress={() => shortlist(item.id)} theme={theme} />
              <ActionBtn label={t('decisionRoom.counter')} tone="primary" onPress={() => counter(item.id, item.amount)} theme={theme} />
              <ActionBtn label={t('decisionRoom.confirm')} tone="brand" onPress={() => confirm(item.id, item.amount)} theme={theme} />
              <ActionBtn label={t('decisionRoom.reject')} tone="danger" onPress={() => reject(item.id)} theme={theme} />
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  )
}

function Stat({ label, value, theme, small }: { label: string; value: string | number; theme: ReturnType<typeof useTheme>; small?: boolean }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ color: theme.foreground, fontSize: small ? 13 : 16, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: theme.mutedForeground, fontSize: 11, marginTop: 1 }}>{label}</Text>
    </View>
  )
}

function Metric({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.muted, borderRadius: radius.sm, padding: spacing.sm, alignItems: 'center' }}>
      <Text style={{ color: theme.foreground, fontSize: 13, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: theme.mutedForeground, fontSize: 10, marginTop: 1 }}>{label}</Text>
    </View>
  )
}

function ActionBtn({ label, tone, onPress, theme }: { label: string; tone: 'success' | 'primary' | 'danger' | 'brand'; onPress: () => void; theme: ReturnType<typeof useTheme> }) {
  const bg = tone === 'success' ? theme.success : tone === 'danger' ? theme.danger : tone === 'brand' ? theme.primary : theme.muted
  const fg = tone === 'primary' ? theme.foreground : '#fff'
  return (
    <Pressable style={{ backgroundColor: bg, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, flex: 1, alignItems: 'center' }} onPress={onPress}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  list: { padding: spacing.lg, gap: spacing.md },
  summaryCard: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  route: { fontSize: 15, fontWeight: '800' },
  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  bidCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  bidTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bidAmount: { fontSize: 20, fontWeight: '800' },
  bidder: { fontSize: 14, fontWeight: '700' },
  metrics: { flexDirection: 'row', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  negBtn: { borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.md },
})
