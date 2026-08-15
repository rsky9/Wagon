import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert, TextInput, Modal, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius, formatINR } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { api } from '../config'
import { TrustBadge, LiveStateBadge, SectionHeader, MarketCard } from '../components/ui'
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
const KIND_ICON: Record<string, string> = {
  truck_capacity: '🚚',
  warehouse_space: '🏭',
  carrier_service: '🚢',
  forwarder_service: '📦',
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
  const [counts, setCounts] = useState<{ listings: number; requests: number; carriers: number; ai: number; partners: number; mine: number }>({ listings: 0, requests: 0, carriers: 0, ai: 0, partners: 0, mine: 0 })
  const [loading, setLoading] = useState(true)
  const [filterKind, setFilterKind] = useState('')
  const [searchOrigin, setSearchOrigin] = useState('')
  const [searchDest, setSearchDest] = useState('')
  const [carrierServices, setCarrierServices] = useState<Array<{ id: string; carrierOrg?: { name: string; verified: boolean } | null; vessel?: string | null; flight?: string | null; originRef?: string | null; destinationRef?: string | null; rate?: number | null; currency: string; availableSlots: number; totalSlots: number; status: string }>>([])
  const [partners, setPartners] = useState<Array<{ id: string; name: string; kind: string; baseUrl?: string | null; org?: { name: string; verified: boolean } | null }>>([])
  const [aiRecs, setAiRecs] = useState<AiRec[]>([])
  const [compareRequest, setCompareRequest] = useState<MarketRequest | null>(null)
  const [myQuotes, setMyQuotes] = useState<Array<{ id: string; amount?: number | null; currency: string; etaHours?: number | null; status: string; request: { id: string; kind: string; originRef?: string | null; destinationRef?: string | null; requesterOrg?: { name: string } | null } }>>([])

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

  // Decompose (build a plan) modal
  const [decomposeFor, setDecomposeFor] = useState<MarketRequest | null>(null)
  const [decomposeRoute, setDecomposeRoute] = useState('')

  // Carrier service publish modal
  const [showCarrier, setShowCarrier] = useState(false)
  const [carOrigin, setCarOrigin] = useState('')
  const [carDest, setCarDest] = useState('')
  const [carVessel, setCarVessel] = useState('')
  const [carOriginSearch, setCarOriginSearch] = useState('')
  const [carDestSearch, setCarDestSearch] = useState('')
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
      api.get<{ listings: MarketListing[] }>(`/market/listings${qs}`).then((r) => r.listings),
      api.get<{ requests: MarketRequest[] }>('/market/requests').then((r) => r.requests),
      api.get<{ requests: MineItem[] }>('/market/requests/mine').then((r) => { setMine(r.requests); return r.requests }).catch(() => [] as MineItem[]),
      api.get<{ services: typeof carrierServices }>(`/market/carrier-services${carOriginSearch || carDestSearch ? `?origin=${encodeURIComponent(carOriginSearch)}&destination=${encodeURIComponent(carDestSearch)}` : ''}`).then((r) => { setCarrierServices(r.services); return r.services }).catch(() => []),
      api.get<{ listings: MarketListing[] }>('/market/listings/mine').then((r) => { setMyListings(r.listings); return r.listings }).catch(() => [] as MarketListing[]),
      api.get<{ partners: typeof partners }>('/market/partners').then((r) => { setPartners(r.partners); return r.partners }).catch(() => []),
      api.get<{ recommendations: AiRec[] }>('/ai/recommendations/mine').then((r) => { setAiRecs(r.recommendations); return r.recommendations }).catch(() => [] as AiRec[]),
      api.get<{ quotes: typeof myQuotes }>('/market/quotes/mine').then((r) => { setMyQuotes(r.quotes); return r.quotes }).catch(() => []),
    ]).then(([listings, requests, mineRes, servicesRes, myListingsRes, partnersRes, aiRes, quotesRes]) => {
      setListings(listings)
      setRequests(requests)
      setCounts({
        listings: listings.length,
        requests: requests.length,
        carriers: servicesRes.length,
        ai: aiRes.length,
        partners: partnersRes.length,
        mine: myListingsRes.length + mineRes.length + quotesRes.length,
      })
    })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [filterKind, searchOrigin, searchDest, carOriginSearch, carDestSearch])
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

  const rejectQuote = (q: MarketQuote) => {
    setBusy(true)
    api.post(`/market/quotes/${q.id}/reject`)
      .then(() => { Alert.alert('Rejected', 'Quote rejected — others remain open'); fetch() })
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setBusy(false))
  }

  const withdrawQuote = (quoteId: string) => {
    setBusy(true)
    api.post(`/market/quotes/${quoteId}/withdraw`)
      .then(() => { Alert.alert('Withdrawn', 'Quote withdrawn'); fetch() })
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

  const decompose = (r: MarketRequest) => {
    setDecomposeFor(r)
    setDecomposeRoute('')
  }

  const submitDecompose = () => {
    const spec = decomposeRoute
    const legs = spec.split(/[;,]/).map((s) => {
      const [origin, destination, kind] = s.split('|').map((x) => x.trim())
      return origin ? { origin, destination: destination || undefined, kind: kind || undefined } : null
    }).filter(Boolean) as Array<{ origin: string; destination?: string; kind?: string }>
    if (legs.length === 0 || !decomposeFor) { Alert.alert('Route required', 'e.g. Mumbai|Mundra|transport'); return }
    setBusy(true)
    api.post<{ plan?: { ref: string; status: string; legs: unknown[]; cost?: number | null }; unsatisfiable?: boolean; note?: string }>(`/market/requests/${decomposeFor.id}/decompose`, { legs })
      .then((res) => {
        setDecomposeFor(null)
        if (res.unsatisfiable) { Alert.alert('Cannot assemble', res.note ?? 'One leg has no supply'); return }
        const p = res.plan!
        Alert.alert('Plan ready', `${p.ref} · ${p.status}\n${(p.legs as Array<{ mode: string; origin?: string }>).map((l) => `${l.mode} ${l.origin ?? ''}`).join(' → ')}\n₹${(p.cost ?? 0).toLocaleString('en-IN')}\nSelect it in Planning to book.`)
        fetch()
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
    <MarketCard
      key={l.id}
      icon={KIND_ICON[l.kind] ?? '🏪'}
      title={KIND_LABEL[l.kind] ?? l.kind}
      subtitle={`${l.originRef ?? l.city ?? '—'} → ${l.destinationRef ?? '—'}`}
      status={l.onMarketNow === false ? 'not now' : l.status}
      statusColor={l.onMarketNow === false ? theme.danger : theme.success}
    >
      <View style={styles.cardMid}>
        <Text style={[styles.price, { color: theme.foreground }]}>
          {l.price != null ? `${l.currency} ${l.price.toLocaleString('en-IN')}` : '—'}
        </Text>
        <LiveStateBadge onMarketNow={l.onMarketNow} fresh={l.fresh} claimRate={l.claimRate} />
      </View>
      <Text style={[styles.meta, { color: theme.mutedForeground }]}>
        {l.capacityAvailable ?? '—'} {l.capacityUnit}{l.equipment ? ` · ${l.equipment}` : ''}
        {l.availableFrom ? ` · from ${new Date(l.availableFrom).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}` : ''}
      </Text>
      <View style={styles.providerRow}>
        <Text style={[styles.meta, { color: theme.mutedForeground }]}>
          {l.providerOrg?.name ?? '—'} {l.providerOrg?.verified ? '✓' : ''}
        </Text>
        <TrustBadge rating={l.orgRating?.avg} completion={l.completionRate} />
      </View>
      <View style={styles.actions}>
        <Pressable style={[styles.actionBtn, { backgroundColor: '#F97316' }]} onPress={() => askProvider(l)}>
          <Text style={styles.actionText}>Ask</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, { backgroundColor: theme.success }]} onPress={() => rateOrg(l)}>
          <Text style={styles.actionText}>Rate</Text>
        </Pressable>
      </View>
    </MarketCard>
  )

  const renderRequest = (r: MarketRequest, withQuotes = false) => (
    <MarketCard
      key={r.id}
      icon={KIND_ICON[r.kind] ?? '📢'}
      title={`${r.kind} demand`}
      subtitle={`${r.originRef ?? r.city ?? '—'} → ${r.destinationRef ?? '—'}`}
      status={r.status}
      statusColor={r.status === 'open' ? theme.success : theme.warning}
    >
      <View style={styles.cardMid}>
        <Text style={[styles.price, { color: theme.foreground }]}>
          {r.budget ? `${r.currency} ${r.budget.toLocaleString('en-IN')}` : '—'}
        </Text>
        <Text style={[styles.meta, { color: theme.mutedForeground }]}>
          {r.capacityNeeded ?? '—'} {r.capacityUnit}
        </Text>
      </View>
      {!withQuotes && (
        <View style={styles.providerRow}>
          <Text style={[styles.meta, { color: theme.mutedForeground }]}>{r.requesterOrg?.name ?? '—'}</Text>
          <TrustBadge rating={r.requesterRating} completion={r.requesterCompletion} />
        </View>
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
        {!withQuotes && r.status === 'open' && (
          <Pressable style={[styles.actionBtn, { backgroundColor: '#8B5CF6' }]} onPress={() => decompose(r)}>
            <Text style={styles.actionText}>Plan</Text>
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
                <>
                  <Pressable style={[styles.smallBtn, { backgroundColor: theme.success }]} onPress={() => acceptQuote(q)}>
                    <Text style={styles.actionText}>Accept</Text>
                  </Pressable>
                  <Pressable style={[styles.smallBtn, { backgroundColor: theme.danger }]} onPress={() => rejectQuote(q)}>
                    <Text style={styles.actionText}>Reject</Text>
                  </Pressable>
                </>
              )}
            </View>
          ))}
        </View>
      )}
    </MarketCard>
  )

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Marketplace</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {canPublishCarrier && (
            <Pressable onPress={() => setShowCarrier(true)} hitSlop={8}><Text style={{ color: '#F97316', fontSize: 14, fontWeight: '800' }}>🚢</Text></Pressable>
          )}
          <Pressable onPress={() => setShowRequest(true)} hitSlop={8}><Text style={{ color: '#F97316', fontSize: 14, fontWeight: '800' }}>+ Need</Text></Pressable>
        </View>
      </View>

      {/* Action-first publish strip */}
      <View style={[styles.publishStrip, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Pressable style={[styles.publishBtn, { backgroundColor: '#F97316' }]} onPress={() => setShowListing(true)}>
          <Text style={styles.publishBtnText}>+ Offer supply</Text>
        </Pressable>
        <Pressable style={[styles.publishBtn, { backgroundColor: theme.foreground }]} onPress={() => setShowRequest(true)}>
          <Text style={[styles.publishBtnText, { color: theme.background }]}>+ Post a need</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {([
          ['listings', 'Supply'],
          ['requests', 'Demand'],
          ['carriers', 'Carriers'],
          ['ai', 'AI'],
          ['partners', 'Partners'],
          ['mine', 'My market'],
        ] as [Tab, string][]).map(([k, label]) => (
          <Pressable key={k} style={[styles.tabBtn, tab === k && { backgroundColor: '#F97316' }]} onPress={() => setTab(k)}>
            <Text style={{ color: tab === k ? '#fff' : theme.mutedForeground, fontWeight: '800', fontSize: 12 }}>{label}</Text>
            <View style={[styles.tabCount, { backgroundColor: tab === k ? 'rgba(255,255,255,0.25)' : theme.muted }]}>
              <Text style={{ color: tab === k ? '#fff' : theme.mutedForeground, fontSize: 10, fontWeight: '800' }}>{counts[k] ?? 0}</Text>
            </View>
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
            <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <TextInput style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="From (port)" placeholderTextColor={theme.mutedForeground} value={carOriginSearch} onChangeText={setCarOriginSearch} />
                <TextInput style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="To (port)" placeholderTextColor={theme.mutedForeground} value={carDestSearch} onChangeText={setCarDestSearch} />
              </View>
              <Pressable style={[styles.actionBtn, { backgroundColor: '#8B5CF6' }]} onPress={recommendCarriers}>
                <Text style={styles.actionText}>🤖 AI carrier picks</Text>
              </Pressable>
            </View>
          }
          ListEmptyComponent={loading ? undefined : <EmptyState title="No carrier schedules" message="Carriers publish vessel/flight space here" icon="🚢" />}
          renderItem={({ item }) => (
            <MarketCard
              key={item.id}
              icon="🚢"
              title={item.vessel ?? item.flight ?? 'Carrier service'}
              subtitle={`${item.originRef ?? '—'} → ${item.destinationRef ?? '—'}`}
              status={item.status}
              statusColor={item.status === 'sold_out' ? theme.danger : theme.success}
            >
              <View style={styles.cardMid}>
                <Text style={[styles.price, { color: theme.foreground }]}>
                  {item.rate != null ? `${item.currency} ${item.rate.toLocaleString('en-IN')}` : '—'}
                </Text>
                <View style={styles.slotPill}>
                  <Text style={{ color: theme.foreground, fontSize: 12, fontWeight: '800' }}>{item.availableSlots}/{item.totalSlots} slots</Text>
                </View>
              </View>
            </MarketCard>
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
            <MarketCard
              key={item.id}
              icon="🤝"
              title={item.name}
              subtitle={item.org?.name ?? 'Partner'}
              status={item.org?.verified ? 'verified' : undefined}
              statusColor={theme.success}
            >
              <Text style={[styles.meta, { color: theme.mutedForeground }]}>{item.kind}{item.baseUrl ? ` · ${item.baseUrl}` : ''}</Text>
            </MarketCard>
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
            <MarketCard
              key={item.id}
              icon="🤖"
              title={`${item.agent} agent`}
              subtitle={item.summary}
              status={item.status}
              statusColor={item.status === 'proposed' ? theme.warning : theme.success}
            >
              {item.score != null && (
                <Text style={{ color: theme.foreground, fontWeight: '800', fontSize: 15 }}>Score: {item.score.toFixed(2)}</Text>
              )}
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
            </MarketCard>
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
          data={[{ type: 'requests' as const }, { type: 'quotes' as const }, { type: 'supply' as const }]}
          keyExtractor={(i) => i.type}
          renderItem={({ item }) => item.type === 'requests' ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.foreground }]}>My requests ({mine.length})</Text>
              {mine.length === 0
                ? <EmptyState title="No requests yet" message="Your requests and their quotes appear here" icon="📋" />
                : mine.map((m) => renderRequest(m.request, true))}
            </View>
          ) : item.type === 'quotes' ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.foreground }]}>My quotes ({myQuotes.length})</Text>
              {myQuotes.length === 0
                ? <EmptyState title="No quotes sent" message="Quotes you submit appear here" icon="🧾" />
                : myQuotes.map((q) => (
                  <MarketCard
                    key={q.id}
                    icon="🧾"
                    title={`${q.request.kind} · ${q.amount != null ? `${q.currency} ${q.amount.toLocaleString('en-IN')}` : '—'}`}
                    subtitle={`${q.request.originRef ?? '—'} → ${q.request.destinationRef ?? '—'} · ${q.etaHours ?? '—'}h · ${q.request.requesterOrg?.name ?? '—'}`}
                    status={q.status}
                    statusColor={q.status === 'submitted' ? theme.warning : theme.success}
                  >
                    {q.status === 'submitted' && (
                      <Pressable style={[styles.actionBtn, { backgroundColor: theme.danger }]} onPress={() => withdrawQuote(q.id)}>
                        <Text style={styles.actionText}>Withdraw</Text>
                      </Pressable>
                    )}
                  </MarketCard>
                ))}
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.foreground }]}>My supply ({myListings.length})</Text>
              {myListings.length === 0
                ? <EmptyState title="No supply published" message="Tap + Offer to publish capacity" icon="🏪" />
                : myListings.map((l) => (
                  <MarketCard
                    key={l.id}
                    icon={KIND_ICON[l.kind] ?? '🏪'}
                    title={KIND_LABEL[l.kind] ?? l.kind}
                    subtitle={`${l.originRef ?? l.city ?? '—'} → ${l.destinationRef ?? '—'}`}
                    status={l.status}
                    statusColor={l.status === 'live' ? theme.success : theme.warning}
                  >
                    <View style={styles.cardMid}>
                      <Text style={[styles.price, { color: theme.foreground }]}>
                        {l.price != null ? `${l.currency} ${l.price.toLocaleString('en-IN')}` : '—'}
                      </Text>
                      <Pressable style={[styles.actionBtn, { backgroundColor: l.status === 'live' ? theme.warning : theme.success }]} onPress={() => toggleListing(l)}>
                        <Text style={styles.actionText}>{l.status === 'live' ? 'Pause' : 'Resume'}</Text>
                      </Pressable>
                    </View>
                  </MarketCard>
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

      {/* Decompose (build a multi-party plan) modal */}
      <Modal visible={!!decomposeFor} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.foreground }]}>Build a plan · {decomposeFor?.kind}</Text>
            <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>
              {decomposeFor?.originRef ?? decomposeFor?.city ?? '—'} → {decomposeFor?.destinationRef ?? '—'}
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]}
              placeholder="Legs: Origin|Dest|kind (e.g. Mumbai|Mundra|transport, Mundra|Singapore|carrier)"
              placeholderTextColor={theme.mutedForeground}
              multiline
              value={decomposeRoute}
              onChangeText={setDecomposeRoute}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: theme.muted }]} onPress={() => setDecomposeFor(null)}><Text style={{ color: theme.foreground, fontWeight: '700' }}>Cancel</Text></Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#8B5CF6' }]} onPress={submitDecompose} disabled={busy}><Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? 'Planning…' : 'Assemble plan'}</Text></Pressable>
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
  publishStrip: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  publishBtn: { flex: 1, borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center' },
  publishBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  tabs: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  tabBtn: { flex: 1, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center', gap: 2, backgroundColor: 'rgba(128,128,128,0.1)' },
  tabCount: { borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: 'center' },
  filters: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, flexWrap: 'wrap' },
  filterChip: { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: 'rgba(128,128,128,0.4)' },
  filterActive: { backgroundColor: '#F97316', borderColor: '#F97316' },
  list: { padding: spacing.lg, gap: spacing.lg },
  cardMid: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.xs },
  providerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  slotPill: { borderRadius: radius.full, backgroundColor: 'rgba(128,128,128,0.12)', paddingHorizontal: spacing.sm, paddingVertical: 3 },
  meta: { fontSize: 13 },
  price: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  section: { gap: spacing.lg },
  sectionTitle: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionBtn: { flex: 1, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center', marginTop: spacing.xs },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  smallBtn: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  quoteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, paddingTop: spacing.sm },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, padding: spacing.xl, gap: spacing.sm, maxHeight: '88%' },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  input: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, fontSize: 14 },
  half: { flex: 1 },
  modalBtn: { borderRadius: radius.md, padding: spacing.md, flex: 1, alignItems: 'center' },
})
