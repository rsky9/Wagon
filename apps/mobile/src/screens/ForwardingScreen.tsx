import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert, TextInput, Modal } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { api } from '../config'
import type { ForwardOrder, Consolidation, Shipment } from '@wagon/contracts'

interface Props {
  onBack: () => void
  onOpenShipments: () => void
}

export function ForwardingScreen({ onBack, onOpenShipments }: Props) {
  const theme = useTheme()
  const [orders, setOrders] = useState<ForwardOrder[]>([])
  const [consolidations, setConsolidations] = useState<Consolidation[]>([])
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'order' | 'consolidate' | null>(null)
  const [shipmentId, setShipmentId] = useState('')
  const [buyAmount, setBuyAmount] = useState('')
  const [sellAmount, setSellAmount] = useState('')
  const [consolidationId, setConsolidationId] = useState('')
  const [carrierId, setCarrierId] = useState('')
  const [busy, setBusy] = useState(false)

  const fetch = useCallback(() => {
    Promise.all([
      api.get<{ orders: ForwardOrder[] }>('/forwarding/orders'),
      api.get<{ consolidations: Consolidation[] }>('/forwarding/consolidations'),
      api.get<{ shipments: Shipment[] }>('/foundation/shipments'),
    ]).then(([o, c, s]) => { setOrders(o.orders); setConsolidations(c.consolidations); setShipments(s.shipments) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { fetch() }, [fetch])

  const createOrder = () => {
    if (!shipmentId) { Alert.alert('Pick a shipment'); return }
    setBusy(true)
    api.post('/forwarding/orders', {
      shipmentId,
      buyAmount: buyAmount ? Number(buyAmount) : undefined,
      sellAmount: sellAmount ? Number(sellAmount) : undefined,
    }).then(() => { setModal(null); setShipmentId(''); setBuyAmount(''); setSellAmount(''); fetch() })
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setBusy(false))
  }

  const setMargin = (orderId: string) => {
    Alert.prompt('Set margin', 'Sell amount', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Set', onPress: (sell?: string) => {
        api.post(`/forwarding/orders/${orderId}/margin`, { buyAmount: orders.find((o) => o.id === orderId)?.buyAmount ?? 0, sellAmount: Number(sell) })
          .then(() => fetch()).catch((e) => Alert.alert('Error', e.message))
      } },
    ])
  }

  const createConsolidation = () => {
    const orderIds = orders.filter((o) => o.status === 'intake' || o.status === 'consolidated').map((o) => o.id)
    if (orderIds.length === 0) { Alert.alert('No orders', 'Create forward orders first'); return }
    setBusy(true)
    api.post('/forwarding/consolidations', { mode: 'ocean', orderIds })
      .then(() => { setModal(null); fetch() })
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setBusy(false))
  }

  const markReady = (id: string) => {
    api.post(`/forwarding/consolidations/${id}/ready`).then(() => fetch()).catch((e) => Alert.alert('Error', e.message))
  }

  const bookConsolidation = (id: string) => {
    // Discover live carrier services on the market and let the forwarder pick one.
    api.get<{ services: Array<{ id: string; carrierOrg: { name: string } | null; vessel?: string | null; flight?: string | null; originRef?: string | null; destinationRef?: string | null; rate?: number | null; currency: string; availableSlots: number }> }>('/market/carrier-services')
      .then((res) => {
        if (res.services.length === 0) {
          Alert.prompt('Book consolidation', 'Carrier org id', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Book', onPress: (cid?: string) => {
              api.post(`/forwarding/consolidations/${id}/book`, { carrierId: cid?.trim() })
                .then(() => fetch()).catch((e) => Alert.alert('Error', e.message))
            } },
          ])
          return
        }
        const labels = res.services.map((svc, i) => `${i + 1}. ${svc.carrierOrg?.name ?? 'Carrier'} · ${svc.vessel ?? svc.flight ?? 'service'} · ${svc.originRef ?? '—'}→${svc.destinationRef ?? '—'} · ${svc.rate != null ? `${svc.currency} ${svc.rate}` : '—'} (${svc.availableSlots} slots)`)
        Alert.alert('Pick a carrier service', labels.join('\n'), [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Use carrier id', onPress: () => {
            Alert.prompt('Book consolidation', 'Carrier org id', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Book', onPress: (cid?: string) => {
                api.post(`/forwarding/consolidations/${id}/book`, { carrierId: cid?.trim() })
                  .then(() => fetch()).catch((e) => Alert.alert('Error', e.message))
              } },
            ])
          } },
          ...res.services.map((svc, i) => ({
            text: `Book #${i + 1}`,
            onPress: () => {
              api.post(`/market/carrier-services/${svc.id}/book`)
                .then(() => { Alert.alert('Booked', 'Carrier space booked'); fetch() })
                .catch((e) => Alert.alert('Error', e.message))
            },
          })),
        ])
      })
      .catch(() => Alert.alert('Error', 'Could not load carrier services'))
  }

  const renderOrderCard = (o: ForwardOrder) => (
    <View key={o.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardTop}>
        <Text style={[styles.cardTitle, { color: theme.foreground }]}>{o.ref}</Text>
        <Text style={[styles.chip, { color: theme.warning, borderColor: theme.warning }]}>{o.status}</Text>
      </View>
      <Text style={[styles.meta, { color: theme.mutedForeground }]}>
        Buy ₹{(o.buyAmount ?? 0).toLocaleString('en-IN')} · Sell ₹{(o.sellAmount ?? 0).toLocaleString('en-IN')}
      </Text>
      {o.status === 'intake' && (
        <Pressable style={[styles.actionBtn, { backgroundColor: theme.warning }]} onPress={() => setMargin(o.id)}>
          <Text style={styles.actionText}>Set margin</Text>
        </Pressable>
      )}
    </View>
  )

  const renderConsolidationCard = (c: Consolidation) => (
    <View key={c.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardTop}>
        <Text style={[styles.cardTitle, { color: theme.foreground }]}>{c.ref}</Text>
        <Text style={[styles.chip, { color: c.status === 'booked' ? theme.success : theme.warning, borderColor: c.status === 'booked' ? theme.success : theme.warning }]}>{c.status}</Text>
      </View>
      <Text style={[styles.meta, { color: theme.mutedForeground }]}>
        {c.origin ?? '—'} → {c.destination ?? '—'} · {c.equipment ?? '—'} · {c.cargoWeightKg ?? 0} kg
      </Text>
      {c.status === 'grouping' && (
        <Pressable style={[styles.actionBtn, { backgroundColor: '#F97316' }]} onPress={() => markReady(c.id)}>
          <Text style={styles.actionText}>Mark ready</Text>
        </Pressable>
      )}
      {c.status === 'ready' && (
        <Pressable style={[styles.actionBtn, { backgroundColor: '#F97316' }]} onPress={() => bookConsolidation(c.id)}>
          <Text style={styles.actionText}>Book with carrier</Text>
        </Pressable>
      )}
    </View>
  )

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Forwarding</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Pressable onPress={() => setModal('order')} hitSlop={8}><Text style={{ color: '#F97316', fontSize: 14, fontWeight: '800' }}>+ Order</Text></Pressable>
          <Pressable onPress={() => setModal('consolidate')} hitSlop={8}><Text style={{ color: '#F97316', fontSize: 14, fontWeight: '800' }}>+ LCL</Text></Pressable>
        </View>
      </View>

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>Loading…</Text>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={[{ type: 'orders' as const }, { type: 'consolidations' as const }]}
          keyExtractor={(i) => i.type}
          renderItem={({ item }) => (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.foreground }]}>
                {item.type === 'orders' ? `Forward orders (${orders.length})` : `Consolidations (${consolidations.length})`}
              </Text>
              {item.type === 'orders'
                ? orders.length === 0
                  ? <EmptyState title="No orders" message="Tap + Order to create one" icon="🧾" />
                  : orders.map(renderOrderCard)
                : consolidations.length === 0
                  ? <EmptyState title="No consolidations" message="Tap + LCL to group your orders" icon="📦" />
                  : consolidations.map(renderConsolidationCard)}
            </View>
          )}
        />
      )}

      <Modal visible={modal === 'order'} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.foreground }]}>Create forward order</Text>
            <Text style={[styles.meta, { color: theme.mutedForeground }]}>Pick a shipment:</Text>
            {shipments.map((s) => (
              <Pressable key={s.id} style={[styles.shipOption, shipmentId === s.id && { backgroundColor: 'rgba(249,115,22,0.15)' }]} onPress={() => setShipmentId(s.id)}>
                <Text style={{ color: theme.foreground, fontWeight: shipmentId === s.id ? '800' : '500' }}>{s.commodity ?? 'Untitled'} · {s.ref}</Text>
              </Pressable>
            ))}
            {shipments.length === 0 && (
              <Pressable onPress={() => { setModal(null); onOpenShipments() }}>
                <Text style={{ color: '#F97316', marginTop: spacing.sm }}>No shipments — create one first →</Text>
              </Pressable>
            )}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <TextInput style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Buy ₹" placeholderTextColor={theme.mutedForeground} keyboardType="numeric" value={buyAmount} onChangeText={setBuyAmount} />
              <TextInput style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Sell ₹" placeholderTextColor={theme.mutedForeground} keyboardType="numeric" value={sellAmount} onChangeText={setSellAmount} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: theme.muted }]} onPress={() => setModal(null)}><Text style={{ color: theme.foreground, fontWeight: '700' }}>Cancel</Text></Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#F97316' }]} onPress={createOrder} disabled={busy}><Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? 'Creating…' : 'Create'}</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={modal === 'consolidate'} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.foreground }]}>New LCL consolidation</Text>
            <Text style={[styles.meta, { color: theme.mutedForeground }]}>
              Groups {orders.filter((o) => o.status === 'intake' || o.status === 'consolidated').length} order(s) into one ocean shipment.
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: theme.muted }]} onPress={() => setModal(null)}><Text style={{ color: theme.foreground, fontWeight: '700' }}>Cancel</Text></Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#F97316' }]} onPress={createConsolidation} disabled={busy}><Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? 'Creating…' : 'Create'}</Text></Pressable>
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
  list: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: 6 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  chip: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2, textTransform: 'uppercase' },
  meta: { fontSize: 13 },
  actionBtn: { borderRadius: radius.md, padding: spacing.sm, alignItems: 'center', marginTop: spacing.xs },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, padding: spacing.xl, gap: spacing.sm },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  shipOption: { borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: 'rgba(128,128,128,0.3)' },
  input: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, fontSize: 14 },
  half: { flex: 1 },
  modalBtn: { borderRadius: radius.md, padding: spacing.md, flex: 1, alignItems: 'center' },
})
