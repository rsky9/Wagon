import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { api } from '../config'
import type { Plan, Shipment } from '@wagon/contracts'

interface Props {
  onBack: () => void
}

interface PlanRow extends Plan {
  shipment?: Shipment
}

export function PlanningScreen({ onBack }: Props) {
  const theme = useTheme()
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [shipmentId, setShipmentId] = useState('')
  const [mode, setMode] = useState('road')
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [cost, setCost] = useState('')
  const [eta, setEta] = useState('')
  const [proposing, setProposing] = useState(false)

  const fetch = useCallback(() => {
    api.get<{ plans: PlanRow[] }>('/planning/plans').then((r) => setPlans(r.plans)).catch(() => {}).finally(() => setLoading(false))
  }, [])
  useEffect(() => { fetch() }, [fetch])

  const propose = () => {
    if (!shipmentId.trim() || !cost.trim()) { Alert.alert('Shipment id and cost required'); return }
    if (!origin.trim() || !destination.trim()) { Alert.alert('Origin & destination required'); return }
    setProposing(true)
    api.post<{ plan: Plan }>('/planning/plans', {
      shipmentId: shipmentId.trim(),
      legs: [{ mode, origin: origin.trim(), destination: destination.trim(), cost: Number(cost), etaHours: eta ? Number(eta) : 24 }],
    }).then(() => { setShipmentId(''); setOrigin(''); setDestination(''); setCost(''); setEta(''); fetch() })
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setProposing(false))
  }

  const act = (planId: string, action: 'select' | 'decline') => {
    const path = action === 'select' ? 'select' : 'decline'
    api.post(`/planning/plans/${planId}/${path}`).then(() => fetch()).catch((e) => Alert.alert('Error', e.message))
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Multimodal Planning</Text>
        <View style={{ width: 20 }} />
      </View>

      <FlatList
        contentContainerStyle={styles.list}
        data={plans}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <View style={[styles.form, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.formTitle, { color: theme.foreground }]}>Propose a plan</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Shipment id" placeholderTextColor={theme.mutedForeground} value={shipmentId} onChangeText={setShipmentId} />
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Origin (city)" placeholderTextColor={theme.mutedForeground} value={origin} onChangeText={setOrigin} />
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Destination (city)" placeholderTextColor={theme.mutedForeground} value={destination} onChangeText={setDestination} />
            <View style={styles.row}>
              {['road', 'rail', 'ocean', 'air'].map((m) => (
                <Pressable key={m} style={[styles.kindChip, mode === m && styles.kindActive]} onPress={() => setMode(m)}>
                  <Text style={[styles.kindText, { color: mode === m ? '#fff' : theme.foreground }]}>{m}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.row}>
              <TextInput style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Cost (₹)" placeholderTextColor={theme.mutedForeground} keyboardType="numeric" value={cost} onChangeText={setCost} />
              <TextInput style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="ETA (h)" placeholderTextColor={theme.mutedForeground} keyboardType="numeric" value={eta} onChangeText={setEta} />
            </View>
            <Pressable style={[styles.createBtn, { backgroundColor: '#F97316' }]} onPress={propose} disabled={proposing}>
              <Text style={styles.createBtnText}>{proposing ? 'Proposing…' : '+ Propose plan'}</Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={!loading ? <EmptyState title="No plans yet" message="Propose a route above" icon="🗺️" /> : undefined}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.cardTop}>
              <Text style={[styles.cardTitle, { color: theme.foreground }]}>{item.ref}</Text>
              <Text style={[styles.chip, { color: item.status === 'selected' ? theme.success : item.status === 'declined' ? theme.danger : theme.warning, borderColor: item.status === 'selected' ? theme.success : item.status === 'declined' ? theme.danger : theme.warning }]}>{item.status}</Text>
            </View>
            <Text style={[styles.meta, { color: theme.mutedForeground }]}>
              {item.source} · ₹{(item.cost ?? 0).toLocaleString('en-IN')} · {item.etaHours ?? '—'}h · risk {item.riskScore}
            </Text>
            <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>
              {(item.legs as { mode: string }[])?.map((l) => l.mode).join(' → ')}
            </Text>
            {item.status === 'proposed' && (
              <View style={styles.actions}>
                <Pressable style={[styles.actionBtn, { backgroundColor: theme.success }]} onPress={() => act(item.id, 'select')}>
                  <Text style={styles.actionText}>Select</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, { backgroundColor: theme.danger }]} onPress={() => act(item.id, 'decline')}>
                  <Text style={styles.actionText}>Decline</Text>
                </Pressable>
              </View>
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
  form: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.sm },
  formTitle: { fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  half: { flex: 1 },
  input: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, fontSize: 14 },
  kindChip: { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: 'rgba(128,128,128,0.4)' },
  kindActive: { backgroundColor: '#F97316', borderColor: '#F97316' },
  kindText: { fontSize: 12, fontWeight: '700' },
  createBtn: { borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  chip: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2, textTransform: 'uppercase' },
  meta: { fontSize: 13 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: { borderRadius: radius.md, padding: spacing.sm, flex: 1, alignItems: 'center' },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 13 },
})
