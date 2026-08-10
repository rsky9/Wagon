import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, ScrollView, Pressable, Alert, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius, formatINR } from '@wagon/design'
import { Button, EmptyState, StatusChip, type StatusTone } from '@wagon/components'
import { api } from '../config'

interface Offer {
  id: string
  fromRole: string
  amount: number
  conditions?: string | null
  validityHours: number
  status: string
  createdAt: string
}

interface Bid {
  id: string
  amount: number
  status: string
}

interface TimelineData {
  load: { id: string; route: string }
  offers: Offer[]
  bids: Bid[]
}

interface Props {
  loadId: string
  onBack: () => void
}

const TONE: Record<string, StatusTone> = {
  offered: 'info',
  accepted: 'success',
  rejected: 'danger',
  expired: 'warning',
}

export function NegotiationScreen({ loadId, onBack }: Props) {
  const theme = useTheme()
  const [data, setData] = useState<TimelineData | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    api.get<TimelineData>(`/bidding/load/${loadId}/timeline`).then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [loadId])

  useEffect(() => { fetch() }, [fetch])

  const respond = (offer: Offer, action: 'accept' | 'reject' | 'counter') => {
    if (action === 'counter') {
      Alert.prompt('Counteroffer', 'Enter amount, then conditions after a | (e.g. 39000 | pickup before 8:30 AM)', [{ text: 'Cancel', style: 'cancel' }, { text: 'Send', onPress: (raw?: string) => {
        const [amtPart, condPart] = (raw ?? '').split('|')
        const n = Number(amtPart?.trim() ?? 0)
        if (!n || n <= 0) { Alert.alert('Invalid', 'Enter a positive amount'); return }
        api.post(`/bidding/offer/${offer.id}/respond`, { action: 'counter', amount: n, conditions: condPart?.trim() || undefined })
          .then(() => { Alert.alert('Sent', 'Counteroffer submitted'); fetch() })
          .catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'Failed'))
      } }])
      return
    }
    api.post(`/bidding/offer/${offer.id}/respond`, { action })
      .then(() => { Alert.alert(action === 'accept' ? 'Accepted' : 'Rejected', action === 'accept' ? 'Terms agreed' : 'Offer declined'); fetch() })
      .catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'Failed'))
  }

  const pending = data?.offers.filter((o) => o.status === 'offered') ?? []
  const history = data?.offers ?? []

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Negotiation</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(); setRefreshing(false) }} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        {data && (
          <Text style={[styles.route, { color: theme.mutedForeground }]}>{data.load.route}</Text>
        )}

        {loading ? (
          <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>Loading…</Text>
        ) : (
          <>
            {pending.length > 0 && (
              <>
                <Text style={[styles.section, { color: theme.foreground }]}>Respond to offer</Text>
                {pending.map((o) => (
                  <View key={o.id} style={[styles.offerCard, { backgroundColor: theme.card, borderColor: theme.primary + '55' }]}>
                    <View style={styles.offerTop}>
                      <Text style={[styles.amount, { color: theme.foreground }]}>{formatINR(o.amount)}</Text>
                      <StatusChip label={o.fromRole === 'supplier' ? 'Supplier offer' : 'Your offer'} tone="info" />
                    </View>
                    {o.conditions ? <Text style={[styles.conditions, { color: theme.mutedForeground }]}>Condition: {o.conditions}</Text> : null}
                    <Text style={[styles.validity, { color: theme.mutedForeground }]}>Valid {o.validityHours}h · {new Date(o.createdAt).toLocaleString('en-IN')}</Text>
                    <View style={styles.actions}>
                      <Button label="Accept" onPress={() => respond(o, 'accept')} />
                      <Button label="Counter" variant="secondary" onPress={() => respond(o, 'counter')} />
                      <Button label="Decline" variant="destructive" onPress={() => respond(o, 'reject')} />
                    </View>
                  </View>
                ))}
              </>
            )}

            <Text style={[styles.section, { color: theme.foreground }]}>Negotiation timeline</Text>
            {history.length === 0 ? (
              <EmptyState title="No offers yet" message="Counteroffers will appear here as a timeline" icon="🤝" />
            ) : (
              history.map((o, i) => (
                <View key={o.id} style={styles.timelineRow}>
                  <View style={styles.timelineLeft}>
                    <View style={[styles.timelineDot, { backgroundColor: o.status === 'accepted' ? theme.success : o.status === 'rejected' ? theme.danger : theme.primary }]} />
                    {i < history.length - 1 && <View style={[styles.timelineLine, { backgroundColor: theme.border }]} />}
                  </View>
                  <View style={[styles.timelineCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.offerTop}>
                      <Text style={[styles.amount, { color: theme.foreground }]}>{formatINR(o.amount)}</Text>
                      <StatusChip label={o.status} tone={TONE[o.status]} />
                    </View>
                    <Text style={[styles.meta, { color: theme.mutedForeground }]}>
                      {o.fromRole === 'supplier' ? 'Supplier' : 'Transporter'} · {new Date(o.createdAt).toLocaleString('en-IN')}
                    </Text>
                    {o.conditions ? <Text style={[styles.conditions, { color: theme.mutedForeground }]}>If: {o.conditions}</Text> : null}
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  route: { fontSize: 13 },
  section: { fontSize: 16, fontWeight: '800', marginTop: spacing.sm },
  offerCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  offerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amount: { fontSize: 20, fontWeight: '800' },
  conditions: { fontSize: 13 },
  validity: { fontSize: 12 },
  meta: { fontSize: 12 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  timelineRow: { flexDirection: 'row', gap: spacing.md },
  timelineLeft: { alignItems: 'center', width: 14 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, zIndex: 2 },
  timelineLine: { width: 2, flex: 1, marginVertical: 2 },
  timelineCard: { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: 2, marginBottom: spacing.xs },
})
