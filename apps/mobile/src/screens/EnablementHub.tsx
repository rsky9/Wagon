import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { api } from '../config'
import type { Shipment, ForwardOrder, Claim, Plan } from '@wagon/contracts'

interface Props {
  onOpen: (screen: 'shipments' | 'forwarding' | 'planning' | 'finance' | 'storage' | 'global') => void
}

interface Stat {
  key: string
  label: string
  value: number
  icon: string
}

interface Section {
  key: string
  title: string
  subtitle: string
  icon: string
  count: number
  screen: Props['onOpen'] extends (s: infer S) => void ? S : never
}

export function EnablementHub({ onOpen }: Props) {
  const theme = useTheme()
  const [shipments, setShipments] = useState(0)
  const [orders, setOrders] = useState(0)
  const [claims, setClaims] = useState(0)
  const [plans, setPlans] = useState(0)

  useEffect(() => {
    api.get<{ shipments: Shipment[] }>('/foundation/shipments').then((r) => setShipments(r.shipments.length)).catch(() => {})
    api.get<{ orders: ForwardOrder[] }>('/forwarding/orders').then((r) => setOrders(r.orders.length)).catch(() => {})
    api.get<{ claims: Claim[] }>('/finance/claims').then((r) => setClaims(r.claims.length)).catch(() => {})
    api.get<{ plans: Plan[] }>('/planning/plans').then((r) => setPlans(r.plans.length)).catch(() => {})
  }, [])

  const stats: Stat[] = [
    { key: 'shipments', label: 'Shipments', value: shipments, icon: '📦' },
    { key: 'orders', label: 'Forward orders', value: orders, icon: '🧾' },
    { key: 'plans', label: 'Plans', value: plans, icon: '🗺️' },
    { key: 'claims', label: 'Claims', value: claims, icon: '⚖️' },
  ]

  const sections: Section[] = [
    { key: 'shipments', title: 'Shipments & Org', subtitle: 'Create and track shipments across modes', icon: '🚚', count: shipments, screen: 'shipments' },
    { key: 'forwarding', title: 'Forwarding', subtitle: 'Orders, margins, carrier bookings & consolidation', icon: '🧳', count: orders, screen: 'forwarding' },
    { key: 'planning', title: 'Multimodal Planning', subtitle: 'Compare routes, select plans, re-plan on failure', icon: '🗺️', count: plans, screen: 'planning' },
    { key: 'finance', title: 'Finance & Risk', subtitle: 'Claims, insurance, settlements & risk scores', icon: '💰', count: claims, screen: 'finance' },
    { key: 'storage', title: 'Warehouse & Storage', subtitle: 'Facilities and gate-in → gate-out operations', icon: '🏭', count: 0, screen: 'storage' },
    { key: 'global', title: 'Global', subtitle: 'Country packs, FX and document checklists', icon: '🌍', count: 0, screen: 'global' },
  ]

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.foreground }]}>Enablement</Text>
        <Text style={[styles.subtitle, { color: theme.mutedForeground }]}>Orchestrate. Don't operate.</Text>
      </View>

      <FlatList
        contentContainerStyle={styles.list}
        data={sections}
        keyExtractor={(s) => s.key}
        ListHeaderComponent={
          <View style={styles.statsRow}>
            {stats.map((st) => (
              <View key={st.key} style={[styles.statCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={styles.statIcon}>{st.icon}</Text>
                <Text style={[styles.statValue, { color: theme.foreground }]}>{st.value}</Text>
                <Text style={[styles.statLabel, { color: theme.mutedForeground }]}>{st.label}</Text>
              </View>
            ))}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => onOpen(item.screen)}
          >
            <View style={styles.cardIconBox}>
              <Text style={styles.cardIcon}>{item.icon}</Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={[styles.cardTitle, { color: theme.foreground }]}>{item.title}</Text>
              <Text style={[styles.cardSub, { color: theme.mutedForeground }]}>{item.subtitle}</Text>
            </View>
            <Text style={{ color: theme.mutedForeground, fontSize: 18 }}>›</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, borderBottomWidth: 1 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 2 },
  list: { padding: spacing.lg, gap: spacing.md },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  statCard: { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, alignItems: 'center' },
  statIcon: { fontSize: 20 },
  statValue: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  statLabel: { fontSize: 11, marginTop: 2, textAlign: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  cardIconBox: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(249,115,22,0.15)', alignItems: 'center', justifyContent: 'center' },
  cardIcon: { fontSize: 26 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 17, fontWeight: '800' },
  cardSub: { fontSize: 13, marginTop: 3, lineHeight: 18 },
})
