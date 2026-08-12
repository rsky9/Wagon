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

type Tab = 'listings' | 'requests' | 'carriers' | 'mine' | 'partners' | 'ai'

interface AiRec {
  id: string
  agent: string
  entityType: string
  summary: string
  score?: number | null
  status: string
  createdAt: string
  output?: unknown
}

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

export function MarketScreen({ onBack, capabilities = [] }: Props) {
  const theme = useTheme()
  const [tab, setTab] = useState<Tab>('listings')
  const [listings, setListings] = useState<MarketListing[]>([])
  const [myListings, setMyListings] = useState<MarketListing[]>([])
  const [requests, setRequests] = useState<MarketRequest[]>([])
  const [mine, setMine] = useState<MineItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filterKind, setFilterKind] = useState('')
  const [searchOrigin, setSearchOrigin] = useState('')
  const [searchDest, setSearchDest] = useState('')
  const [carrierServices, setCarrierServices] = useState<Array<{ id: string; carrierOrg?: { name: string; verified: boolean } | null; vessel?: string | null; flight?: string | null; originRef?: string | null; destinationRef?: string | null; rate?: number | null; currency: string; availableSlots: number; totalSlots: number; status: string }>>([])
  const [partners, setPartners] = useState<Array<{ id: string; name: string; kind: string; baseUrl?: string | null; org?: { name: string; verified: boolean } | null }>>([])
  const [aiRecs, setAiRecs] = useState<AiRec[]>([])
  const [compareRequest, setCompareRequest] = useState<MarketRequest | null>(null)

  const canPublishCarrier = capabilities.includes('carrier')

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
  const [quoteEta, setQuoteEta] = useState('')

  // Carrier service publish modal
  const [showCarrier, setShowCarrier] = useState(false)
  const [carOrigin, setCarOrigin] = useState('')
  const [carDest, setCarDest] = useState('')
  const [carVessel, setCarVessel] = useState('')
  const [carSlots, setCarSlots] = useState('')
  const [carRate, setCarRate] = useState('')

  const [busy, setBusy] = useState(false)

  const fetch = useCallback(() => {
    const params = new URLSearchParams()
    if (filterKind) params.set('kind', filterKind)
    if (searchOrigin) params.set('origin', searchOrigin)
    if (searchDest) params.set('destination', searchDest)
    const qs = params.toString() ? `?${params.toString()}` : ''
    Promise.all([
      api.get<{ listings: MarketListing[] }>(`/market/listings${qs}`),
      api.get<{ requests: MarketRequest[] }>('/market/requests'),
      api.get<{ requests: MineItem[] }>('/market/requests/mine').then((r) => setMine(r.requests)).catch(() => {}),
      api.get<{ services: typeof carrierServices }>('/market/carrier-services').then((r) => setCarrierServices(r.services)).catch(() => {}),
      api.get<{ listings: MarketListing[] }>('/market/listings/mine').then((r) => setMyListings(r.listings)).catch(() => {}),
      api.get<{ partners: typeof partners }>('/market/partners').then((r) => setPartners(r.partners)).catch(() => {}),
      api.get<{ recommendations: AiRec[] }>('/ai/recommendations/mine').then((r) => setAiRecs(r.recommendations)).catch(() => {}),
    ]).then(([l, r]) => { setListings(l.listings); setRequests(r.requests) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filterKind, searchOrigin, searchDest])
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
    api.post(`/market/requests/${quoteFor.id}/quotes`, { amount: Number(quoteAmount), etaHours: quoteEta ? Number(quoteEta) : undefined })
      .then(() => { setQuoteFor(null); setQuoteAmount(''); setQuoteEta(''); Alert.alert('Quote sent', 'The requester can now review your quote'); fetch() })
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setBusy(false))
  }

  const publishCarrier = () => {
    if (!carOrigin || !carDest) { Alert.alert('Origin and destination required'); return }
    setBusy(true)
    api.post('/market/carrier-services', {
      originRef: carOrigin.trim(),
      destinationRef: carDest.trim(),
      mode: 'ocean',
      vessel: carVessel.trim() || undefined,
      totalSlots: carSlots ? Number(carSlots) : 1,
      rate: carRate ? Number(carRate) : undefined,
    }).then(() => { setShowCarrier(false); setCarOrigin(''); setCarDest(''); setCarVessel(''); setCarSlots(''); setCarRate(''); fetch() })
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setBusy(false))
  }

  const acceptQuote = (q: MarketQuote) => {    setBusy(true)
    api.post(`/market/quotes/${q.id}/accept`)
      .then(() => { Alert.alert('Accepted', 'Request booked — settle the payment in Finance to release'); fetch() })
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

  const recommendCarriers = () => {
    Alert.prompt('AI carrier pick', 'Origin (port/city)', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Next', onPress: (origin?: string) => {
        Alert.prompt('Destination (port/city)', 'Where to?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Recommend', onPress: (dest?: string) => {
            setBusy(true)
            api.post<{ services: Array<{ id: string; vessel?: string | null; flight?: string | null; rate?: number | null; currency: string; availableSlots: number; score: number }> }>('/ai/carrier', { originRef: origin, destinationRef: dest })
              .then((res) => {
                if (res.services.length === 0) { Alert.alert('No services', 'No carrier services on this lane yet'); return }
                Alert.alert('AI carrier picks', res.services.slice(0, 5).map((s, i) => `${i + 1}. ${s.vessel ?? s.flight ?? 'service'} · ${s.rate != null ? `${s.currency} ${s.rate}` : '—'} · ${s.availableSlots} slots · score ${s.score.toFixed(2)}`).join('\n'))
                fetch()
              })
              .catch((e) => Alert.alert('Error', e.message))
              .finally(() => setBusy(false))
          } },
        ])
      } },
    ])
  }

  const askProvider = (l: MarketListing) => {
    Alert.alert('Ask this provider', `Request their ${KIND_LABEL[l.kind] ?? l.kind}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Ask', onPress: () => {
        setBusy(true)
        api.post(`/market/listings/${l.id}/request`, { originRef: l.originRef ?? undefined, destinationRef: l.destinationRef ?? undefined, city: l.city ?? undefined })
          .then(() => { Alert.alert('Request sent', 'The provider has been notified'); fetch() })
          .catch((e) => Alert.alert('Error', e.message))
          .finally(() => setBusy(false))
      } },
    ])
  }

  const rateOrg = (l: MarketListing) => {
    Alert.prompt('Rate this provider', `Score 1-5 for ${l.providerOrg?.name ?? 'provider'} (${KIND_LABEL[l.kind] ?? l.kind})`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Rate', onPress: (score?: string) => {
        const axis = ({ truck_capacity: 'transporter', warehouse_space: 'warehouse', carrier_service: 'carrier', forwarder_service: 'forwarder' } as Record<string, string>)[l.kind] ?? 'supplier'
        api.post('/market/ratings', { subjectOrgId: l.providerOrgId, axis, score: Number(score) })
          .then(() => Alert.alert('Rated', 'Thanks for the feedback'))
          .catch((e) => Alert.alert('Error', e.message))
      } },
    ])
  }

  const toggleListing = (l: MarketListing) => {
    setBusy(true)
    api.patch(`/market/listings/${l.id}/status`, { status: l.status === 'live' ? 'paused' : 'live' })
      .then(() => fetch())
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setBusy(false))
  }

  const aiAction = (rec: AiRec, status: 'accepted' | 'dismissed') => {
    setBusy(true)
    api.patch(`/ai/recommendations/${rec.id}/status`, { status })
      .then(() => fetch())
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
        <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>
          {l.providerOrg?.name ?? '—'} · ★ {l.orgRating?.avg ? l.orgRating.avg.toFixed(1) : 'new'}
          {l.completionRate != null ? ` · ${l.completionRate}% done` : ''}
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable style={[styles.actionBtn, { backgroundColor: '#F97316' }]} onPress={() => askProvider(l)}>
          <Text style={styles.actionText}>Ask</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, { backgroundColor: theme.success }]} onPress={() => rateOrg(l)}>
          <Text style={styles.actionText}>Rate</Text>
        </Pressable>
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
      {!withQuotes && (
        <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>
          {r.requesterOrg?.name ?? '—'} · ★ {r.requesterRating ? r.requesterRating.toFixed(1) : 'new'}
          {r.requesterCompletion != null ? ` · ${r.requesterCompletion}% done` : ''}
        </Text>
      )}
      <View style={styles.actions}>
        {withQuotes && r.status !== 'open' && (
          <Pressable style={[styles.actionBtn, { backgroundColor: '#F97316' }]} onPress={() => runMatch(r)}>
            <Text style={styles.actionText}>Match</Text>
          </Pressable>
        )}
        {withQuotes && r.quotes && r.quotes.length > 0 && (
          <Pressable style={[styles.actionBtn, { backgroundColor: '#8B5CF6' }]} onPress={() => setCompareRequest(r)}>
            <Text style={styles.actionText}>Compare ({r.quotes.length})</Text>
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
          {canPublishCarrier && (
            <Pressable onPress={() => setShowCarrier(true)} hitSlop={8}><Text style={{ color: '#F97316', fontSize: 14, fontWeight: '800' }}>🚢 Publish</Text></Pressable>
          )}
          <Pressable onPress={() => setShowListing(true)} hitSlop={8}><Text style={{ color: '#F97316', fontSize: 14, fontWeight: '800' }}>+ Offer</Text></Pressable>
          <Pressable onPress={() => setShowRequest(true)} hitSlop={8}><Text style={{ color: '#F97316', fontSize: 14, fontWeight: '800' }}>+ Need</Text></Pressable>
        </View>
      </View>

      <View style={styles.tabs}>
        {([['listings', 'Supply'], ['requests', 'Demand'], ['carriers', 'Carriers'], ['ai', 'AI picks'], ['partners', 'Partners'], ['mine', 'My market']] as [Tab, string][]).map(([k, label]) => (
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
          <View style={{ flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md }}>
            <TextInput style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="From (city)" placeholderTextColor={theme.mutedForeground} value={searchOrigin} onChangeText={setSearchOrigin} />
            <TextInput style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="To (city)" placeholderTextColor={theme.mutedForeground} value={searchDest} onChangeText={setSearchDest} />
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

      {tab === 'carriers' && (
        <FlatList
          contentContainerStyle={styles.list}
          data={carrierServices}
          keyExtractor={(s) => s.id}
          ListHeaderComponent={
            <Pressable style={[styles.actionBtn, { backgroundColor: '#8B5CF6', marginBottom: spacing.sm }]} onPress={recommendCarriers}>
              <Text style={styles.actionText}>🤖 AI carrier picks</Text>
            </Pressable>
          }
          ListEmptyComponent={loading ? undefined : <EmptyState title="No carrier schedules" message="Carriers publish vessel/flight space here" icon="🚢" />}
          renderItem={({ item }) => (
            <View key={item.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.cardTitle, { color: theme.foreground }]}>{item.vessel ?? item.flight ?? 'Carrier service'}</Text>
                {item.carrierOrg?.verified && <Text style={[styles.verified, { color: theme.success }]}>✓ verified</Text>}
              </View>
              <Text style={[styles.meta, { color: theme.mutedForeground }]}>
                {item.originRef ?? '—'} → {item.destinationRef ?? '—'} · {item.availableSlots}/{item.totalSlots} slots
              </Text>
              <Text style={[styles.price, { color: theme.foreground }]}>{item.rate != null ? `${item.currency} ${item.rate.toLocaleString('en-IN')}` : '—'}</Text>
            </View>
          )}
        />
      )}

      {tab === 'partners' && (
        <FlatList
          contentContainerStyle={styles.list}
          data={partners}
          keyExtractor={(p) => p.id}
          ListEmptyComponent={loading ? undefined : <EmptyState title="No partners yet" message="Integration partners join the network here" icon="🤝" />}
          renderItem={({ item }) => (
            <View key={item.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.cardTitle, { color: theme.foreground }]}>{item.name}</Text>
                {item.org?.verified && <Text style={[styles.verified, { color: theme.success }]}>✓ verified</Text>}
              </View>
              <Text style={[styles.meta, { color: theme.mutedForeground }]}>{item.kind} · {item.org?.name ?? '—'} · {item.baseUrl ?? '—'}</Text>
            </View>
          )}
        />
      )}

      {tab === 'ai' && (
        <FlatList
          contentContainerStyle={styles.list}
          data={aiRecs}
          keyExtractor={(r) => r.id}
          ListEmptyComponent={loading ? undefined : <EmptyState title="No AI picks yet" message="Run match/carrier agents to get recommendations" icon="🤖" />}
          renderItem={({ item }) => (
            <View key={item.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.cardTitle, { color: theme.foreground }]}>{item.agent} agent</Text>
                <Text style={[styles.chip, { color: item.status === 'proposed' ? theme.warning : theme.success, borderColor: item.status === 'proposed' ? theme.warning : theme.success }]}>{item.status}</Text>
              </View>
              <Text style={[styles.meta, { color: theme.mutedForeground }]}>{item.summary}</Text>
              {item.score != null && <Text style={{ color: theme.foreground, fontWeight: '700' }}>Score: {item.score.toFixed(2)}</Text>}
              {item.status === 'proposed' && (
                <View style={styles.actions}>
                  <Pressable style={[styles.actionBtn, { backgroundColor: theme.success }]} onPress={() => aiAction(item, 'accepted')}>
                    <Text style={styles.actionText}>Accept</Text>
                  </Pressable>
                  <Pressable style={[styles.actionBtn, { backgroundColor: theme.danger }]} onPress={() => aiAction(item, 'dismissed')}>
                    <Text style={styles.actionText}>Dismiss</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        />
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
          data={[{ type: 'requests' as const }, { type: 'supply' as const }]}
          keyExtractor={(i) => i.type}
          renderItem={({ item }) => item.type === 'requests' ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.foreground }]}>My requests ({mine.length})</Text>
              {mine.length === 0
                ? <EmptyState title="No requests yet" message="Your requests and their quotes appear here" icon="📋" />
                : mine.map((m) => renderRequest(m.request, true))}
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.foreground }]}>My supply ({myListings.length})</Text>
              {myListings.length === 0
                ? <EmptyState title="No supply published" message="Tap + Offer to publish capacity" icon="🏪" />
                : myListings.map((l) => (
                  <View key={l.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <View style={styles.cardTop}>
                      <Text style={[styles.cardTitle, { color: theme.foreground }]}>{KIND_LABEL[l.kind] ?? l.kind}</Text>
                      <Text style={[styles.chip, { color: l.status === 'live' ? theme.success : theme.warning, borderColor: l.status === 'live' ? theme.success : theme.warning }]}>{l.status}</Text>
                    </View>
                    <Text style={[styles.meta, { color: theme.mutedForeground }]}>
                      {l.originRef ?? l.city ?? '—'} → {l.destinationRef ?? '—'} · {l.price != null ? `${l.currency} ${l.price.toLocaleString('en-IN')}` : '—'}
                    </Text>
                    <View style={styles.actions}>
                      <Pressable style={[styles.actionBtn, { backgroundColor: l.status === 'live' ? theme.warning : theme.success }]} onPress={() => toggleListing(l)}>
                        <Text style={styles.actionText}>{l.status === 'live' ? 'Pause' : 'Resume'}</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
            </View>
          )}
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
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="ETA (hours)" placeholderTextColor={theme.mutedForeground} keyboardType="numeric" value={quoteEta} onChangeText={setQuoteEta} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: theme.muted }]} onPress={() => setQuoteFor(null)}><Text style={{ color: theme.foreground, fontWeight: '700' }}>Cancel</Text></Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#F97316' }]} onPress={submitQuote} disabled={busy}><Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? 'Sending…' : 'Send quote'}</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Quote comparison modal */}
      <Modal visible={!!compareRequest} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.foreground }]}>Compare quotes · {compareRequest?.kind}</Text>
            <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>
              {compareRequest?.originRef ?? compareRequest?.city ?? '—'} → {compareRequest?.destinationRef ?? '—'}
            </Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {(compareRequest?.quotes ?? []).slice().sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0)).map((q, idx) => (
                <View key={q.id} style={[styles.quoteRow, { borderTopColor: theme.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.foreground, fontWeight: '700' }}>
                      #{idx + 1} {q.providerOrg?.name ?? 'Provider'} · {q.amount != null ? `${q.currency} ${q.amount.toLocaleString('en-IN')}` : '—'} · {q.etaHours ?? '—'}h
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
            </ScrollView>
            <Pressable style={[styles.modalBtn, { backgroundColor: theme.muted }]} onPress={() => setCompareRequest(null)}>
              <Text style={{ color: theme.foreground, fontWeight: '700' }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Carrier service publish modal */}
      <Modal visible={showCarrier} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.foreground }]}>Publish carrier service</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Origin (port/city)" placeholderTextColor={theme.mutedForeground} value={carOrigin} onChangeText={setCarOrigin} />
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Destination (port/city)" placeholderTextColor={theme.mutedForeground} value={carDest} onChangeText={setCarDest} />
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Vessel / flight" placeholderTextColor={theme.mutedForeground} value={carVessel} onChangeText={setCarVessel} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TextInput style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Slots" placeholderTextColor={theme.mutedForeground} keyboardType="numeric" value={carSlots} onChangeText={setCarSlots} />
              <TextInput style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Rate (₹)" placeholderTextColor={theme.mutedForeground} keyboardType="numeric" value={carRate} onChangeText={setCarRate} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: theme.muted }]} onPress={() => setShowCarrier(false)}><Text style={{ color: theme.foreground, fontWeight: '700' }}>Cancel</Text></Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#F97316' }]} onPress={publishCarrier} disabled={busy}><Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? 'Publishing…' : 'Publish'}</Text></Pressable>
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
  section: { gap: spacing.md },
  sectionTitle: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
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
