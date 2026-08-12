import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, ScrollView, Pressable, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { api } from '../config'
import type { Shipment, ShipmentLeg, Plan, ForwardOrder } from '@wagon/contracts'

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
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    api.get<{ shipment: Detail; sourceLoad: SourceLoad | null }>(`/foundation/shipments/${shipmentId}`)
      .then((r) => { setShipment(r.shipment); setSourceLoad(r.sourceLoad ?? null) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [shipmentId])
  useEffect(() => { fetch() }, [fetch])

  const action = (label: string, fn: () => Promise<unknown>, successMsg: string) => {
    fn().then(() => { Alert.alert('Done', successMsg); fetch() }).catch((e) => Alert.alert('Error', e.message))
  }

  const proposePlan = () => {
    action('propose', () => api.post('/planning/plans', {
      shipmentId,
      legs: [{ mode: 'road', origin: 'Origin', destination: 'Destination', cost: 1000, etaHours: 24 }],
    }), 'Plan proposed')
  }
  const createOrder = () => {
    action('order', () => api.post('/forwarding/orders', { shipmentId, buyAmount: 1000, sellAmount: 1200 }), 'Forward order created')
  }
  const fileClaim = () => {
    action('claim', () => api.post('/finance/claims', { shipmentId, reason: 'damage', amount: 1000 }), 'Claim filed')
  }
  const bookCarrier = () => {
    Alert.alert('Book carrier', 'Enter carrier org id', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Book', onPress: () => {
        // Use the first forward order's forwarder as a placeholder; real picker in Forwarding flow.
        action('book', () => api.post('/forwarding/bookings', { shipmentId, bookingRef: `BK-${Date.now()}` }), 'Booking requested')
      } },
    ])
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
  actionText: { color: '#fff', fontWeight: '800', fontSize: 14 },
})
