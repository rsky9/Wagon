import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert, TextInput, Modal, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { api } from '../config'
import type { MarketListing, MarketRequest, MarketQuote } from '@wagon/contracts'

interface Props {
  onBack: () => void
  capabilities?: string[]
}

type Tab = 'listings' | 'requests' | 'mine'

const KIND_LABEL: Record<string, string> = {
  truck_capacity: 'Truck capacity',
  warehouse_space: 'Warehouse space',
  carrier_service: 'Carrier space',
  forwarder_service: 'Forwarder service',
}
const REQ_KINDS = ['transport', 'warehouse', 'forwarding', 'carrier', 'insurance']

interface MineItem {
  request: MarketRequest
  quotes: MarketQuote[]
}

export function MarketScreen({ onBack }: Props) {
  const theme = useTheme()
  const [tab, setTab] = useState<Tab>('listings')
  const [listings, setListings] = useState<MarketListing[]>([])
  const [requests, setRequests] = useState<MarketRequest[]>([])
  const [mine, setMine] = useState<MineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filterKind, setFilterKind] = useState('')

  // Listing publish modal
  const [showListing, setShowListing] = useState(false)
  const [listKind, setListKind] = useState('truck_capacity')
  const [listOrigin, setListOrigin] = useState('')
  const [listDest, setListDest] = useState('')
  const [listCity, setListCity] = useState('')
  const [listCap, setListCap] = useState('')
  const [listPrice, setListPrice] = useState('')

  // Request post modal
  const [showRequest, setShowRequest] = useState(false)
  const [reqKind, setReqKind] = useState('warehouse')
  const [reqOrigin, setReqOrigin] = useState('')
  const [reqDest, setReqDest] = useState('')
  const [reqCity, setReqCity] = useState('')
  const [reqCap, setReqCap] = useState('')
  const [reqBudget, setReqBudget] = useState('')

  // Quote modal
  const [quoteFor, setQuoteFor] = useState<MarketRequest | null>(null)
  const [quoteAmount, setQuoteAmount] = useState('')

  const [busy, setBusy] = useState(false)

  const fetch = useCallback(() => {
    const q = filterKind ? `?kind=${filterKind}` : ''
    Promise.all([
      api.get<{ listings: MarketListing[] }>(`/market/listings${q}`),
      api.get<{ requests: MarketRequest[] }>('/market/requests'),
      api.get<{ requests: MineItem[] }>('/market/requests/mine').then((r) => setMine(r.requests)).catch(() => {}),
    ]).then(([l, r]) => { setListings(l.listings); setRequests(r.requests) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filterKind])
  useEffect(() => { fetch() }, [fetch])

  const postListing = () => {
    if (!listOrigin && !listCity) { Alert.alert('Origin or city required'); return }
    setBusy(true)
    api.post('/market/listings', {
      kind: listKind,
      originRef: listOrigin.trim() || undefined,
      destinationRef: listDest.trim() || undefined,
      city: listCity.trim() || undefined,
      capacityAvailable: listCap ? Number(listCap) : undefined,
      capacityUnit: listKind === 'warehouse_space' ? 'm3' : 'kg',
      price: listPrice ? Number(listPrice) : undefined,
    }).then(() => { setShowListing(false); setListOrigin(''); setListDest(''); setListCity(''); setListCap(''); setListPrice(''); fetch() })
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setBusy(false))
  }

  const postRequest = () => {
    if (!reqOrigin && !reqCity) { Alert.alert('Origin or city required'); return }
    setBusy(true)
    api.post('/market/requests', {
      kind: reqKind,
      originRef: reqOrigin.trim() || undefined,
      destinationRef: reqDest.trim() || undefined,
      city: reqCity.trim() || undefined,
      capacityNeeded: reqCap ? Number(reqCap) : undefined,
      budget: reqBudget ? Number(reqBudget) : undefined,
    }).then(() => { setShowRequest(false); setReqOrigin(''); setReqDest(''); setReqCity(''); setReqCap(''); setReqBudget(''); fetch() })
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setBusy(false))
  }

  const submitQuote = () => {
    if (!quoteFor || !quoteAmount) { Alert.alert('Amount required'); return }
    setBusy(true)
    api.post(`/market/requests/${quoteFor.id}/quotes`, { amount: Number(quoteAmount) })
      .then(() => { setQuoteFor(null); setQuoteAmount(''); Alert.alert('Quote sent', 'The requester can now review your quote'); fetch() })
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setBusy(false))
  }

  const acceptQuote = (q: MarketQuote) => {
    setBusy(true)
    api.post(`/market/quotes/${q.id}/accept`)
      .then(() => { Alert.alert('Accepted', 'Request booked'); fetch() })
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setBusy(false))
  }

  const runMatch = (r: MarketRequest) => {
    setBusy(true)
    api.get<{ matches: MarketListing[] }>(`/market/requests/${r.id}/match`)
      .then((res) => {
        if (res.matches.length === 0) { Alert.alert('No matches', 'No live listings fit this request'); return }
        Alert.alert('Best matches', res.matches.slice(0, 3).map((m) => `${KIND_LABEL[m.kind] ?? m.kind} · ${m.originRef ?? m.city ?? '—'}→${m.destinationRef ?? '—'} · ${m.price ?? '—'} ${m.currency}`).join('\n'))
      })
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setBusy(false))
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
        <Text style={[styles.price, { color: theme.foreground }]}>{l.price != null ? `${l.currency} ${l.price.toLocaleString('en-IN')}` : '—'}</Text>
        <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>{l.providerOrg?.name ?? '—'} · ★ {l.orgRating?.avg ? l.orgRating.avg.toFixed(1) : 'new'}</Text>
      </View>
    </View>
  )

  const renderRequest = (r: MarketRequest, withQuotes = false) => (
    <View key={r.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardTop}>
        <Text style={[styles.cardTitle, { color: theme.foreground }]}>{r.kind} demand</Text>
        <Text style={[styles.chip, { color: r.status === 'open' ? theme.success : theme.warning, borderColor: r.status === 'open' ? theme.success : theme.warning }]}>{r.status}</Text>
      </View>
      <Text style={[styles.meta, { color: theme.mutedForeground }]}>
        {r.originRef ?? r.city ?? '—'} → {r.destinationRef ?? '—'} · {r.capacityNeeded ?? '—'} {r.capacityUnit} · {r.budget ? `${r.currency} ${r.budget.toLocaleString('en-IN')}` : '—'}
      </Text>
      <View style={styles.actions}>
        {withQuotes && r.status !== 'open' && (
          <Pressable style={[styles.actionBtn, { backgroundColor: '#F97316' }]} onPress={() => runMatch(r)}>
            <Text style={styles.actionText}>Match</Text>
          </Pressable>
        )}
        {!withQuotes && r.status === 'open' && (
          <Pressable style={[styles.actionBtn, { backgroundColor: '#F97316' }]} onPress={() => setQuoteFor(r)}>
            <Text style={styles.actionText}>Quote</Text>
          </Pressable>
        )}
      </View>
      {withQuotes && r.quotes && r.quotes.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          {r.quotes.map((q) => (
            <View key={q.id} style={[styles.quoteRow, { borderTopColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.foreground, fontWeight: '700' }}>
                  {q.providerOrg?.name ?? 'Provider'} · {q.amount != null ? `${q.currency} ${q.amount.toLocaleString('en-IN')}` : '—'} · {q.etaHours ?? '—'}h
                </Text>
                <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>{q.status}</Text>
              </View>
              {q.status === 'submitted' && (
                <Pressable style={[styles.smallBtn, { backgroundColor: theme.success }]} onPress={() => acceptQuote(q)}>
                  <Text style={styles.actionText}>Accept</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  )

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Marketplace</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Pressable onPress={() => setShowListing(true)} hitSlop={8}><Text style={{ color: '#F97316', fontSize: 14, fontWeight: '800' }}>+ Offer</Text></Pressable>
          <Pressable onPress={() => setShowRequest(true)} hitSlop={8}><Text style={{ color: '#F97316', fontSize: 14, fontWeight: '800' }}>+ Need</Text></Pressable>
        </View>
      </View>

      <View style={styles.tabs}>
        {([['listings', 'Supply'], ['requests', 'Demand'], ['mine', 'My market']] as [Tab, string][]).map(([k, label]) => (
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
                <Text style={{ color: filterKind === k ? '#fff' : theme.foreground, fontSize: 12, fontWeight: '700' }}>{k === '' ? 'All' : (KIND_LABEL[k] ?? k)}</Text>
              </Pressable>
            ))}
          </View>
          <FlatList
            contentContainerStyle={styles.list}
            data={listings}
            keyExtractor={(l) => l.id}
            ListEmptyComponent={loading ? undefined : <EmptyState title="No supply listed" message="Tap + Offer to publish capacity" icon="📦" />}
            renderItem={({ item }) => renderListing(item)}
          />
        </>
      )}

      {tab === 'requests' && (
        <FlatList
          contentContainerStyle={styles.list}
          data={requests}
          keyExtractor={(r) => r.id}
          ListEmptyComponent={loading ? undefined : <EmptyState title="No open demand" message="Tap + Need to post a request" icon="📢" />}
          renderItem={({ item }) => renderRequest(item)}
        />
      )}

      {tab === 'mine' && (
        <FlatList
          contentContainerStyle={styles.list}
          data={mine}
          keyExtractor={(m) => m.request.id}
          ListEmptyComponent={loading ? undefined : <EmptyState title="Nothing yet" message="Your requests and their quotes appear here" icon="📋" />}
          renderItem={({ item }) => renderRequest(item.request, true)}
        />
      )}

      {/* Publish listing modal */}
      <Modal visible={showListing} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <ScrollView style={[styles.modal, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.foreground }]}>Publish supply</Text>
            <View style={styles.filters}>
              {Object.keys(KIND_LABEL).map((k) => (
                <Pressable key={k} style={[styles.filterChip, listKind === k && styles.filterActive]} onPress={() => setListKind(k)}>
                  <Text style={{ color: listKind === k ? '#fff' : theme.foreground, fontSize: 12, fontWeight: '700' }}>{KIND_LABEL[k]}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Origin (city)" placeholderTextColor={theme.mutedForeground} value={listOrigin} onChangeText={setListOrigin} />
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Destination (city)" placeholderTextColor={theme.mutedForeground} value={listDest} onChangeText={setListDest} />
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Or city (e.g. Pune)" placeholderTextColor={theme.mutedForeground} value={listCity} onChangeText={setListCity} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TextInput style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Capacity" placeholderTextColor={theme.mutedForeground} keyboardType="numeric" value={listCap} onChangeText={setListCap} />
              <TextInput style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Price (₹)" placeholderTextColor={theme.mutedForeground} keyboardType="numeric" value={listPrice} onChangeText={setListPrice} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: theme.muted }]} onPress={() => setShowListing(false)}><Text style={{ color: theme.foreground, fontWeight: '700' }}>Cancel</Text></Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#F97316' }]} onPress={postListing} disabled={busy}><Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? 'Publishing…' : 'Publish'}</Text></Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Post request modal */}
      <Modal visible={showRequest} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <ScrollView style={[styles.modal, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.foreground }]}>Post a need</Text>
            <View style={styles.filters}>
              {REQ_KINDS.map((k) => (
                <Pressable key={k} style={[styles.filterChip, reqKind === k && styles.filterActive]} onPress={() => setReqKind(k)}>
                  <Text style={{ color: reqKind === k ? '#fff' : theme.foreground, fontSize: 12, fontWeight: '700' }}>{k}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Origin (city)" placeholderTextColor={theme.mutedForeground} value={reqOrigin} onChangeText={setReqOrigin} />
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Destination (city)" placeholderTextColor={theme.mutedForeground} value={reqDest} onChangeText={setReqDest} />
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Or city (e.g. Pune)" placeholderTextColor={theme.mutedForeground} value={reqCity} onChangeText={setReqCity} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TextInput style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Capacity (kg)" placeholderTextColor={theme.mutedForeground} keyboardType="numeric" value={reqCap} onChangeText={setReqCap} />
              <TextInput style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Budget (₹)" placeholderTextColor={theme.mutedForeground} keyboardType="numeric" value={reqBudget} onChangeText={setReqBudget} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: theme.muted }]} onPress={() => setShowRequest(false)}><Text style={{ color: theme.foreground, fontWeight: '700' }}>Cancel</Text></Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#F97316' }]} onPress={postRequest} disabled={busy}><Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? 'Posting…' : 'Post'}</Text></Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Quote modal */}
      <Modal visible={!!quoteFor} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.foreground }]}>Quote on {quoteFor?.kind} demand</Text>
            <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>
              {quoteFor?.originRef ?? quoteFor?.city ?? '—'} → {quoteFor?.destinationRef ?? '—'}
            </Text>
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Amount (₹)" placeholderTextColor={theme.mutedForeground} keyboardType="numeric" value={quoteAmount} onChangeText={setQuoteAmount} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: theme.muted }]} onPress={() => setQuoteFor(null)}><Text style={{ color: theme.foreground, fontWeight: '700' }}>Cancel</Text></Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#F97316' }]} onPress={submitQuote} disabled={busy}><Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? 'Sending…' : 'Send quote'}</Text></Pressable>
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
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: { borderRadius: radius.md, padding: spacing.sm, alignItems: 'center', marginTop: spacing.xs },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  smallBtn: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  quoteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, paddingTop: spacing.sm },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, padding: spacing.xl, gap: spacing.sm },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  input: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, fontSize: 14 },
  half: { flex: 1 },
  modalBtn: { borderRadius: radius.md, padding: spacing.md, flex: 1, alignItems: 'center' },
})
