import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, ScrollView, Pressable, Alert, Modal, TextInput, KeyboardAvoidingView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { api } from '../config'
import type { Shipment, ShipmentLeg, Plan, ForwardOrder, CargoUnit } from '@wagon/contracts'
import { alertPrompt } from '../components/Prompt'
import { showActionSheet } from '../components/ActionSheet'
interface Detail extends Shipment {
  legs: ShipmentLeg[]
  plans: Plan[]
  forwardOrder?: ForwardOrder | null
}

interface SourceLoad {
  id: string
  pickupAddr: string
  dropAddr: string
  status: string
  date: string
}

interface Props {
  shipmentId: string
  onBack: () => void
  onOpenLoad?: (loadId: string) => void
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#94A3B8', planned: '#F59E0B', booked: '#3B82F6', in_transit: '#8B5CF6',
  delivered: '#10B981', closed: '#64748B', cancelled: '#EF4444',
}

export function ShipmentDetailScreen({ shipmentId, onBack, onOpenLoad }: Props) {
  const theme = useTheme()
  const [shipment, setShipment] = useState<Detail | null>(null)
  const [sourceLoad, setSourceLoad] = useState<SourceLoad | null>(null)
  const [cargo, setCargo] = useState<CargoUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [coverPlanId, setCoverPlanId] = useState<string | null>(null)
  const [coverValue, setCoverValue] = useState('')

  const fetch = useCallback(() => {
    setError(null)
    api.get<{ shipment: Detail; sourceLoad: SourceLoad | null }>(`/foundation/shipments/${shipmentId}`)
      .then((r) => { setShipment(r.shipment); setSourceLoad(r.sourceLoad ?? null) })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load shipment'))
    api.get<{ units: CargoUnit[] }>(`/foundation/shipments/${shipmentId}/cargo`)
      .then((r) => setCargo(r.units))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [shipmentId])
  useEffect(() => { fetch() }, [fetch])

  const action = (label: string, fn: () => Promise<unknown>, successMsg: string) => {
    fn().then(() => { Alert.alert('Done', successMsg); fetch() }).catch((e) => Alert.alert('Error', e.message))
  }

  const proposePlan = () => {
    alertPrompt('Propose plan', 'Est. cost (₹) per leg', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Propose', onPress: (cost?: string) => {
        const c = cost ? Number(cost) : NaN
        if (!c || c <= 0) { Alert.alert('Valid cost required'); return }
        // Derive route from the shipment's first leg (real addresses), not
        // placeholder text that would poison tracking/claims.
        const first = shipment?.legs?.[0]
        const origin = first?.pickupAddr?.trim() || 'Origin'
        const destination = first?.dropAddr?.trim() || 'Destination'
        if (origin === 'Origin' || destination === 'Destination') {
          Alert.alert('Missing route', 'Add origin/destination to the shipment before proposing a plan.')
          return
        }
        action('propose', () => api.post('/planning/plans', {
          shipmentId,
          legs: [{ mode: 'road', origin, destination, cost: c, etaHours: 24 }],
        }), 'Plan proposed')
      } },
    ])
  }
  const createOrder = () => {
    alertPrompt('Create forward order', 'Sell amount (₹)',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Create', onPress: (sell?: string) => {
          const s = Number(sell)
          if (!s || s <= 0) { Alert.alert('Valid amount required'); return }
          action('order', () => api.post('/forwarding/orders', { shipmentId, buyAmount: s * 0.8, sellAmount: s }), 'Forward order created')
        } },
      ],
      'numeric',
    )
  }
  const quoteCover = (planId: string) => {
    setCoverPlanId(planId)
    setCoverValue('')
  }

  const submitCover = () => {
    if (!coverPlanId) return
    const v = Number(coverValue)
    if (!v || v <= 0) { Alert.alert('Valid value required'); return }
    setLoading(true)
    api.post<{ quote: { premium: number; coverage: number; band: string; risk: number } }>(`/finance/plans/${coverPlanId}/cover-quote`, { declaredValue: v })
      .then((r) => {
        setCoverPlanId(null)
        // Issue the policy directly — the premium is billed via a settlement.
        const policyRef = `PLCY-${Date.now().toString(36).toUpperCase()}`
        Alert.alert('Cover quote', `Coverage ₹${r.quote.coverage.toLocaleString('en-IN')}\nPremium ₹${r.quote.premium.toLocaleString('en-IN')} · ${r.quote.band} risk (${(r.quote.risk * 100).toFixed(0)}%)`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Accept & issue policy', onPress: () => {
            action('cover', () => api.post(`/finance/plans/${coverPlanId}/cover-accept`, { declaredValue: v, policyRef }), 'Policy issued')
          } },
        ])
      })
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => { setLoading(false); fetch() })
  }

  const fileClaim = () => {
    alertPrompt('File claim', 'Claim amount (₹)',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'File', onPress: (amt?: string) => {
          const a = Number(amt)
          if (!a || a <= 0) { Alert.alert('Valid amount required'); return }
          action('claim', () => api.post('/finance/claims', { shipmentId, reason: 'damage', amount: a }), 'Claim filed')
        } },
      ],
      'numeric',
    )
  }
  const bookCarrier = () => {
    // Real carrier selection: pick a live market service, then book it against
    // the shipment (never a placeholder POST without a carrierId).
    setLoading(true)
    api.get<{ services: Array<{ id: string; carrierOrg: { name: string } | null; vessel?: string | null; flight?: string | null; originRef?: string | null; destinationRef?: string | null; rate?: number | null; currency: string; availableSlots: number }> }>('/market/carrier-services')
      .then((res) => {
        if (res.services.length === 0) {
          Alert.alert('No carriers', 'No carrier services available on the market to book')
          return
        }
        showActionSheet({
          title: 'Book a carrier',
          message: `${res.services.length} service(s) available on the market`,
          options: res.services.map((svc) => ({
            text: `${svc.carrierOrg?.name ?? 'Carrier'} · ${svc.vessel ?? svc.flight ?? 'service'} · ${svc.originRef ?? '—'}→${svc.destinationRef ?? '—'} · ${svc.rate != null ? `${svc.currency} ${svc.rate}` : '—'} (${svc.availableSlots} slots)`,
            onPress: () => action('book', () => api.post(`/market/carrier-services/${svc.id}/book`), 'Carrier booked'),
          })),
        })
      })
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setLoading(false))
  }

  const legTransition = (legId: string, event: 'departed' | 'arrived') => {
    action(event, () => api.post(`/foundation/legs/${legId}/transition`, { event }), `${event === 'departed' ? 'Departed' : 'Arrived'} recorded`)
  }

  const failLeg = (legId: string) => {
    alertPrompt('Fail leg', 'Reason (e.g. breakdown, customs hold)', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Fail + re-plan', onPress: (reason?: string) => {
        if (!reason?.trim()) { Alert.alert('Reason required'); return }
        setLoading(true)
        api.post<{ rePlan?: { plan?: { ref?: string; legs?: Array<{ mode: string; carrier?: string; cost?: number }> }; sourcedFromMarket?: boolean } }>(`/foundation/legs/${legId}/transition`, { event: 'failed', reason: reason.trim() })
          .then((r) => {
            const rp = r.rePlan
            if (rp?.plan) {
              const first = (rp.plan.legs ?? [])[0]
              Alert.alert('Re-planned', `${rp.sourcedFromMarket ? 'Sourced from the marketplace' : 'Fallback route'}\n${first?.mode ?? ''} · ${first?.carrier ?? ''}\n₹${(first?.cost ?? 0).toLocaleString('en-IN')}`)
            } else {
              Alert.alert('Leg failed', 'No plan re-plan available')
            }
          })
          .catch((e) => Alert.alert('Error', e.message))
          .finally(() => { setLoading(false); fetch() })
      } },
    ])
  }

  const addCargo = () => {
    alertPrompt('Add cargo unit', 'Weight (kg)', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Add', onPress: (w?: string) => {
        action('cargo', () => api.post(`/foundation/shipments/${shipmentId}/cargo`, { kind: 'package', weightKg: w ? Number(w) : undefined }), 'Cargo unit added')
      } },
    ])
  }

  const splitCargo = (unit: CargoUnit) => {
    alertPrompt('Split cargo unit', 'Two parts (kg, e.g. 1000,2000)', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Split', onPress: (parts?: string) => {
        const nums = (parts ?? '').split(',').map((p) => ({ weightKg: Number(p.trim()) })).filter((p) => p.weightKg > 0)
        if (nums.length < 2) { Alert.alert('Need 2+ parts'); return }
        action('split', () => api.post(`/foundation/cargo/${unit.id}/split`, { parts: nums }), 'Cargo split')
      } },
    ])
  }

  const advanceContainer = (unit: CargoUnit) => {
    const evts: Array<{ label: string; event: string }> = [
      { label: 'Gate in', event: 'gated_in' },
      { label: 'Loaded (STUF)', event: 'loaded' },
      { label: 'Discharged (STRP)', event: 'discharged' },
      { label: 'Returned (GTOT)', event: 'returned' },
    ]
    showActionSheet({
      title: `Container · ${unit.status}`,
      message: 'Advance container lifecycle',
      options: evts.map((e) => ({
        text: e.label,
        onPress: () => action('container', () => api.post(`/foundation/cargo/${unit.id}/container`, { event: e.event }), 'Container updated'),
      })),
    })
  }

  if (error && !shipment) {
    return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Shipment</Text>
        <View style={{ width: 20 }} />
      </View>
      <View style={{ padding: spacing.xl, gap: spacing.md }}>
        <Text style={{ color: theme.foreground, fontWeight: '800' }}>Could not load shipment</Text>
        <Text style={{ color: theme.mutedForeground }}>{error}</Text>
        <Pressable style={[styles.smallBtn, { backgroundColor: '#F97316', alignSelf: 'flex-start' }]} onPress={() => { setLoading(true); fetch() }}>
          <Text style={styles.smallBtnText}>Retry</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  }

  if (loading || !shipment) {
    return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 80 }}>Loading…</Text>
    </SafeAreaView>
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]} numberOfLines={1}>{shipment.commodity ?? 'Shipment'}</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.cardTop}>
            <Text style={[styles.ref, { color: theme.foreground }]}>{shipment.ref}</Text>
            <Text style={[styles.chip, { color: STATUS_COLORS[shipment.status] ?? theme.warning, borderColor: STATUS_COLORS[shipment.status] ?? theme.warning }]}>{shipment.status}</Text>
          </View>
          <Text style={[styles.meta, { color: theme.mutedForeground }]}>
            {shipment.mode} · {shipment.weightKg ? `${shipment.weightKg} kg` : '—'} · {shipment.value ? `₹${shipment.value.toLocaleString('en-IN')}` : '—'} · {shipment.pieces ?? '—'} pcs
          </Text>
        </View>

        {sourceLoad && (
          <Pressable style={[styles.card, { backgroundColor: 'rgba(249,115,22,0.08)', borderColor: '#F97316' }]} onPress={() => onOpenLoad?.(sourceLoad.id)}>
            <View style={styles.cardTop}>
              <Text style={[styles.cardTitle, { color: theme.foreground }]}>🚚 From load · {sourceLoad.status}</Text>
              <Text style={{ color: '#F97316', fontWeight: '800', fontSize: 14 }}>Open →</Text>
            </View>
            <Text style={[styles.meta, { color: theme.mutedForeground }]}>
              {sourceLoad.pickupAddr} → {sourceLoad.dropAddr}
            </Text>
          </Pressable>
        )}

        <Text style={[styles.sectionTitle, { color: theme.foreground }]}>Legs ({shipment.legs.length})</Text>
        {shipment.legs.map((l, i) => (
          <View key={l.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.foreground }]}>{i + 1}. {l.mode}</Text>
            <Text style={[styles.meta, { color: theme.mutedForeground }]}>
              {l.pickupAddr ?? '—'} → {l.dropAddr ?? '—'} · {l.distanceKm ? `${l.distanceKm} km` : ''} · {l.status}
            </Text>
            {l.departedAt && <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>Departed {new Date(l.departedAt).toLocaleString()}</Text>}
            {l.arrivedAt && <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>Arrived {new Date(l.arrivedAt).toLocaleString()}</Text>}
            {(l.status === 'planned' || l.status === 'booked' || l.status === 'in_transit') && (
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                {(l.status === 'planned' || l.status === 'booked') && (
                  <Pressable style={[styles.smallBtn, { backgroundColor: '#F97316' }]} onPress={() => legTransition(l.id, 'departed')}>
                    <Text style={styles.smallBtnText}>Depart</Text>
                  </Pressable>
                )}
                {l.status === 'in_transit' && (
                  <Pressable style={[styles.smallBtn, { backgroundColor: theme.success }]} onPress={() => legTransition(l.id, 'arrived')}>
                    <Text style={styles.smallBtnText}>Arrive</Text>
                  </Pressable>
                )}
                {(l.status === 'planned' || l.status === 'booked' || l.status === 'in_transit') && (
                  <Pressable style={[styles.smallBtn, { backgroundColor: theme.danger }]} onPress={() => failLeg(l.id)}>
                    <Text style={styles.smallBtnText}>Fail ↻</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        ))}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm }}>
          <Text style={[styles.sectionTitle, { color: theme.foreground }]}>Cargo ({cargo.length})</Text>
          <Pressable onPress={addCargo} hitSlop={8}><Text style={{ color: '#F97316', fontSize: 13, fontWeight: '800' }}>+ Add</Text></Pressable>
        </View>
        {cargo.map((u) => (
          <View key={u.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.cardTop}>
              <Text style={[styles.cardTitle, { color: theme.foreground }]}>{u.ref} · {u.kind}</Text>
              <Text style={[styles.chip, { color: theme.warning, borderColor: theme.warning }]}>{u.status}</Text>
            </View>
            <Text style={[styles.meta, { color: theme.mutedForeground }]}>
              {u.weightKg ? `${u.weightKg} kg` : '—'} · {u.equipment ?? '—'} {u.parent ? `· from ${u.parent.ref}` : ''}
            </Text>
            {!u.parent && (
              <Pressable style={[styles.smallBtn, { backgroundColor: '#8B5CF6', alignSelf: 'flex-start', marginTop: spacing.sm }]} onPress={() => splitCargo(u)}>
                <Text style={styles.smallBtnText}>Split</Text>
              </Pressable>
            )}
            {(u.kind === 'container' || u.kind === 'teu') && (
              <Pressable style={[styles.smallBtn, { backgroundColor: '#2563EB', alignSelf: 'flex-start', marginTop: spacing.sm }]} onPress={() => advanceContainer(u)}>
                <Text style={styles.smallBtnText}>Container ⚙️</Text>
              </Pressable>
            )}
          </View>
        ))}

        <Text style={[styles.sectionTitle, { color: theme.foreground }]}>Plans ({shipment.plans.length})</Text>
        {shipment.plans.map((p) => (
          <View key={p.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.cardTop}>
              <Text style={[styles.cardTitle, { color: theme.foreground }]}>{p.ref} · {p.source}</Text>
              <Text style={[styles.chip, { color: p.status === 'selected' ? theme.success : theme.warning, borderColor: p.status === 'selected' ? theme.success : theme.warning }]}>{p.status}</Text>
            </View>
            <Text style={[styles.meta, { color: theme.mutedForeground }]}>₹{(p.cost ?? 0).toLocaleString('en-IN')} · {(p.etaHours ?? '—')}h · risk {p.riskScore}</Text>
            <Pressable style={[styles.smallBtn, { backgroundColor: '#0EA5E9', alignSelf: 'flex-start', marginTop: spacing.sm }]} onPress={() => quoteCover(p.id)}>
              <Text style={styles.smallBtnText}>Insure this plan</Text>
            </Pressable>
          </View>
        ))}

        {shipment.forwardOrder && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.foreground }]}>Forward order</Text>
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.cardTitle, { color: theme.foreground }]}>{shipment.forwardOrder.ref}</Text>
              <Text style={[styles.meta, { color: theme.mutedForeground }]}>
                {shipment.forwardOrder.status} · Buy ₹{(shipment.forwardOrder.buyAmount ?? 0).toLocaleString('en-IN')} · Sell ₹{(shipment.forwardOrder.sellAmount ?? 0).toLocaleString('en-IN')}
              </Text>
            </View>
          </>
        )}

        <Text style={[styles.sectionTitle, { color: theme.foreground }]}>Actions</Text>
        <View style={styles.actions}>
          {[
            { label: '🗺️ Propose plan', fn: proposePlan },
            { label: '🧾 Forward order', fn: createOrder },
            { label: '⚖️ File claim', fn: fileClaim },
            { label: '🚢 Book carrier', fn: bookCarrier },
          ].map((a) => (
            <Pressable key={a.label} style={[styles.actionBtn, { backgroundColor: '#F97316' }]} onPress={a.fn}>
              <Text style={styles.actionText}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Insure plan modal */}
      <Modal visible={!!coverPlanId} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} behavior="padding">
          <View style={[styles.modalWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={{ color: theme.foreground, fontWeight: '800', fontSize: 18 }}>Insure this plan</Text>
            <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>Declared cargo value (₹)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]}
              placeholder="e.g. 500000"
              placeholderTextColor={theme.mutedForeground}
              keyboardType="numeric"
              value={coverValue}
              onChangeText={setCoverValue}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable style={[styles.smallBtn, { backgroundColor: theme.muted }]} onPress={() => setCoverPlanId(null)}><Text style={styles.smallBtnText}>Cancel</Text></Pressable>
              <Pressable style={[styles.smallBtn, { backgroundColor: '#0EA5E9' }]} onPress={submitCover}><Text style={styles.smallBtnText}>Quote</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800', flex: 1, marginHorizontal: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  ref: { fontSize: 14, fontWeight: '800', flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  chip: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2, textTransform: 'uppercase' },
  meta: { fontSize: 13 },
  sectionTitle: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionBtn: { borderRadius: radius.md, padding: spacing.md, paddingHorizontal: spacing.lg },
  smallBtn: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  smallBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  modalWrap: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, padding: spacing.xl, gap: spacing.md },
  input: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, fontSize: 14 },
})
