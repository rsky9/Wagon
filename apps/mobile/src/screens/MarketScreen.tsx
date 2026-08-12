import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert, TextInput, Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { api } from '../config'
import type { MarketListing, MarketRequest } from '@wagon/contracts'

interface Props {
  onBack: () => void
  capabilities?: string[]
}

type Tab = 'listings' | 'requests' | 'carriers'

const KIND_LABEL: Record<string, string> = {
  truck_capacity: 'Truck capacity',
  warehouse_space: 'Warehouse space',
  carrier_service: 'Carrier space',
  forwarder_service: 'Forwarder service',
}

export function MarketScreen({ onBack, capabilities = [] }: Props) {
  const theme = useTheme()
  const [tab, setTab] = useState<Tab>('listings')
  const [listings, setListings] = useState<MarketListing[]>([])
  const [requests, setRequests] = useState<MarketRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filterKind, setFilterKind] = useState('')
  const [posting, setPosting] = useState(false)
  const [reqKind, setReqKind] = useState('warehouse')
  const [reqOrigin, setReqOrigin] = useState('')
  const [reqDest, setReqDest] = useState('')
  const [reqCity, setReqCity] = useState('')
  const [reqCapacity, setReqCapacity] = useState('')
  const [reqBudget, setReqBudget] = useState('')

  const fetch = useCallback(() => {
    const q = filterKind ? `?kind=${filterKind}` : ''
    Promise.all([
      api.get<{ listings: MarketListing[] }>(`/market/listings${q}`),
      api.get<{ requests: MarketRequest[] }>('/market/requests'),
    ]).then(([l, r]) => { setListings(l.listings); setRequests(r.requests) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filterKind])
  useEffect(() => { fetch() }, [fetch])

  const postRequest = () => {
    if (!reqOrigin && !reqCity) { Alert.alert('Origin or city required'); return }
    setPosting(true)
    api.post('/market/requests', {
      kind: reqKind,
      originRef: reqOrigin.trim() || undefined,
      destinationRef: reqDest.trim() || undefined,
      city: reqCity.trim() || undefined,
      capacityNeeded: reqCapacity ? Number(reqCapacity) : undefined,
      budget: reqBudget ? Number(reqBudget) : undefined,
    }).then(() => { setPosting(false); setReqOrigin(''); setReqDest(''); setReqCity(''); setReqCapacity(''); setReqBudget(''); fetch() })
      .catch((e) => { setPosting(false); Alert.alert('Error', e.message) })
  }

  const renderListing = (l: MarketListing) => (
    <View key={l.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardTop}>
        <Text style={[styles.cardTitle, { color: theme.foreground }]}>{KIND_LABEL[l.kind] ?? l.kind}</Text>
        {l.providerOrg?.verified && <Text style={[styles.verified, { color: theme.success }]}>✓ verified</Text>}
      </View>
      <Text style={[styles.meta, { color: theme.mutedForeground }]}>
        {l.originRef ?? l.city ?? '—'} → {l.destinationRef ?? '—'} · {l.equipment ?? '—'} · {l.capacityAvailable ?? '—'} {l.capacityUnit}
      </Text>
      <View style={styles.cardTop}>
        <Text style={[styles.price, { color: theme.foreground }]}>
          {l.price != null ? `${l.currency} ${l.price.toLocaleString('en-IN')}` : '—'}
        </Text>
        <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>
          {l.providerOrg?.name ?? '—'} · ★ {l.orgRating?.avg ? l.orgRating.avg.toFixed(1) : 'new'}
        </Text>
      </View>
    </View>
  )

  const renderRequest = (r: MarketRequest) => (
    <View key={r.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardTop}>
        <Text style={[styles.cardTitle, { color: theme.foreground }]}>{r.kind} demand</Text>
        <Text style={[styles.chip, { color: theme.warning, borderColor: theme.warning }]}>{r.status}</Text>
      </View>
      <Text style={[styles.meta, { color: theme.mutedForeground }]}>
        {r.originRef ?? r.city ?? '—'} → {r.destinationRef ?? '—'} · {r.capacityNeeded ?? '—'} {r.capacityUnit} · budget {r.budget ? `${r.currency} ${r.budget.toLocaleString('en-IN')}` : '—'}
      </Text>
      <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>{r.requesterOrg?.name ?? '—'} · {r.quotes?.length ?? 0} quotes</Text>
    </View>
  )

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Marketplace</Text>
        <Pressable onPress={() => setPosting(true)} hitSlop={8}><Text style={{ color: '#F97316', fontSize: 14, fontWeight: '800' }}>+ Need</Text></Pressable>
      </View>

      <View style={styles.tabs}>
        {([['listings', 'Supply'], ['requests', 'Demand']] as [Tab, string][]).map(([k, label]) => (
          <Pressable key={k} style={[styles.tabBtn, tab === k && { backgroundColor: '#F97316' }]} onPress={() => setTab(k)}>
            <Text style={{ color: tab === k ? '#fff' : theme.mutedForeground, fontWeight: '800', fontSize: 13 }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'listings' && (
        <>
          <View style={styles.filters}>
            {['', 'truck_capacity', 'warehouse_space', 'carrier_service', 'forwarder_service'].map((k) => (
              <Pressable key={k} style={[styles.filterChip, filterKind === k && styles.filterActive]} onPress={() => setFilterKind(k)}>
                <Text style={{ color: filterKind === k ? '#fff' : theme.foreground, fontSize: 12, fontWeight: '700' }}>
                  {k === '' ? 'All' : (KIND_LABEL[k] ?? k)}
                </Text>
              </Pressable>
            ))}
          </View>
          <FlatList
            contentContainerStyle={styles.list}
            data={listings}
            keyExtractor={(l) => l.id}
            ListEmptyComponent={loading ? undefined : <EmptyState title="No supply listed" message="Providers publish capacity here" icon="📦" />}
            renderItem={({ item }) => renderListing(item)}
          />
        </>
      )}

      {tab === 'requests' && (
        <FlatList
          contentContainerStyle={styles.list}
          data={requests}
          keyExtractor={(r) => r.id}
          ListEmptyComponent={loading ? undefined : <EmptyState title="No open demand" message="Requests for every capability appear here" icon="📢" />}
          renderItem={({ item }) => renderRequest(item)}
        />
      )}

      <Modal visible={posting} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.foreground }]}>Post a need</Text>
            <View style={styles.filters}>
              {['warehouse', 'forwarding', 'carrier', 'insurance', 'transport'].map((k) => (
                <Pressable key={k} style={[styles.filterChip, reqKind === k && styles.filterActive]} onPress={() => setReqKind(k)}>
                  <Text style={{ color: reqKind === k ? '#fff' : theme.foreground, fontSize: 12, fontWeight: '700' }}>{k}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Origin (city)" placeholderTextColor={theme.mutedForeground} value={reqOrigin} onChangeText={setReqOrigin} />
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Destination (city)" placeholderTextColor={theme.mutedForeground} value={reqDest} onChangeText={setReqDest} />
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Or specific city (e.g. Pune)" placeholderTextColor={theme.mutedForeground} value={reqCity} onChangeText={setReqCity} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TextInput style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Capacity (kg)" placeholderTextColor={theme.mutedForeground} keyboardType="numeric" value={reqCapacity} onChangeText={setReqCapacity} />
              <TextInput style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Budget (₹)" placeholderTextColor={theme.mutedForeground} keyboardType="numeric" value={reqBudget} onChangeText={setReqBudget} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: theme.muted }]} onPress={() => setPosting(false)}><Text style={{ color: theme.foreground, fontWeight: '700' }}>Cancel</Text></Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#F97316' }]} onPress={postRequest}><Text style={{ color: '#fff', fontWeight: '800' }}>Post</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  tabs: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  tabBtn: { flex: 1, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center', backgroundColor: 'rgba(128,128,128,0.1)' },
  filters: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, flexWrap: 'wrap' },
  filterChip: { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: 'rgba(128,128,128,0.4)' },
  filterActive: { backgroundColor: '#F97316', borderColor: '#F97316' },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  verified: { fontSize: 12, fontWeight: '700' },
  meta: { fontSize: 13 },
  price: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  chip: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2, textTransform: 'uppercase' },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, padding: spacing.xl, gap: spacing.sm },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  input: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, fontSize: 14 },
  half: { flex: 1 },
  modalBtn: { borderRadius: radius.md, padding: spacing.md, flex: 1, alignItems: 'center' },
})
