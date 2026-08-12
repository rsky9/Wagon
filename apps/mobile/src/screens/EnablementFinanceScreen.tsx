import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { api } from '../config'
import type { Claim, Settlement, InsurancePolicy, Shipment } from '@wagon/contracts'

interface Props {
  onBack: () => void
}

export function EnablementFinanceScreen({ onBack }: Props) {
  const theme = useTheme()
  const [claims, setClaims] = useState<Claim[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [policies, setPolicies] = useState<InsurancePolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [shipmentId, setShipmentId] = useState('')
  const [reason, setReason] = useState('damage')
  const [amount, setAmount] = useState('')
  const [filing, setFiling] = useState(false)

  const fetch = useCallback(() => {
    Promise.all([
      api.get<{ claims: Claim[] }>('/finance/claims'),
      api.get<{ settlements: Settlement[] }>('/finance/settlements'),
      api.get<{ policies: InsurancePolicy[] }>('/finance/policies'),
    ]).then(([c, st, p]) => { setClaims(c.claims); setSettlements(st.settlements); setPolicies(p.policies) }).catch(() => {}).finally(() => setLoading(false))
  }, [])
  useEffect(() => { fetch() }, [fetch])

  const fileClaim = () => {
    if (!shipmentId.trim()) { Alert.alert('Shipment id required'); return }
    setFiling(true)
    api.post<{ claim: Claim }>('/finance/claims', { shipmentId: shipmentId.trim(), reason, amount: amount ? Number(amount) : undefined })
      .then(() => { setShipmentId(''); setAmount(''); fetch() })
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setFiling(false))
  }

  const firstShipment = claims[0]?.shipmentId

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Finance & Risk</Text>
        <View style={{ width: 20 }} />
      </View>

      <FlatList
        contentContainerStyle={styles.list}
        data={[{ k: 'claims' as const }, { k: 'settlements' as const }, { k: 'policies' as const }]}
        keyExtractor={(i) => i.k}
        ListHeaderComponent={
          <View style={[styles.form, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.formTitle, { color: theme.foreground }]}>File a claim</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]}
              placeholder={firstShipment ? `Shipment id (${firstShipment.slice(-6)})` : 'Shipment id'} placeholderTextColor={theme.mutedForeground}
              value={shipmentId} onChangeText={setShipmentId}
            />
            <View style={styles.row}>
              {['loss', 'damage', 'delay', 'other'].map((r) => (
                <Pressable key={r} style={[styles.reasonChip, reason === r && styles.reasonActive]} onPress={() => setReason(r)}>
                  <Text style={[styles.reasonText, { color: reason === r ? '#fff' : theme.foreground }]}>{r}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]}
              placeholder="Amount (₹)" placeholderTextColor={theme.mutedForeground} keyboardType="numeric"
              value={amount} onChangeText={setAmount}
            />
            <Pressable style={[styles.createBtn, { backgroundColor: '#F97316' }]} onPress={fileClaim} disabled={filing}>
              <Text style={styles.createBtnText}>{filing ? 'Filing…' : '+ File claim'}</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.foreground }]}>
              {item.k === 'claims' ? `Claims (${claims.length})` : item.k === 'settlements' ? `Settlements (${settlements.length})` : `Insurance (${policies.length})`}
            </Text>
            {item.k === 'claims' && (claims.length === 0
              ? <EmptyState title="No claims" message="File a claim above" icon="⚖️" />
              : claims.map((c) => (
                <View key={c.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.cardTop}>
                    <Text style={[styles.cardTitle, { color: theme.foreground }]}>{c.reason} · ₹{(c.amount ?? 0).toLocaleString('en-IN')}</Text>
                    <Text style={[styles.chip, { color: c.status === 'approved' ? theme.success : c.status === 'rejected' ? theme.danger : theme.warning, borderColor: c.status === 'approved' ? theme.success : c.status === 'rejected' ? theme.danger : theme.warning }]}>{c.status}</Text>
                  </View>
                  <Text style={[styles.meta, { color: theme.mutedForeground }]}>Shipment {c.shipmentId.slice(-6)}</Text>
                </View>
              )))}
            {item.k === 'settlements' && (settlements.length === 0
              ? <EmptyState title="No settlements" message="Settlements appear here" icon="💸" />
              : settlements.map((st) => (
                <View key={st.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.cardTop}>
                    <Text style={[styles.cardTitle, { color: theme.foreground }]}>{st.type} · ₹{(st.amount ?? 0).toLocaleString('en-IN')}</Text>
                    <Text style={[styles.chip, { color: st.status === 'cleared' ? theme.success : theme.warning, borderColor: st.status === 'cleared' ? theme.success : theme.warning }]}>{st.status}</Text>
                  </View>
                </View>
              )))}
            {item.k === 'policies' && (policies.length === 0
              ? <EmptyState title="No policies" message="Insurance policies appear here" icon="🛡️" />
              : policies.map((p) => (
                <View key={p.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.cardTop}>
                    <Text style={[styles.cardTitle, { color: theme.foreground }]}>{p.policyRef}</Text>
                    <Text style={[styles.chip, { color: theme.success, borderColor: theme.success }]}>{p.status}</Text>
                  </View>
                  <Text style={[styles.meta, { color: theme.mutedForeground }]}>Coverage ₹{(p.coverage ?? 0).toLocaleString('en-IN')}</Text>
                </View>
              )))}
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
  list: { padding: spacing.lg, gap: spacing.xl },
  form: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  formTitle: { fontSize: 15, fontWeight: '800' },
  input: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, fontSize: 14 },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  reasonChip: { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: 'rgba(128,128,128,0.4)' },
  reasonActive: { backgroundColor: '#F97316', borderColor: '#F97316' },
  reasonText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  createBtn: { borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  chip: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2, textTransform: 'uppercase' },
  meta: { fontSize: 13 },
})
