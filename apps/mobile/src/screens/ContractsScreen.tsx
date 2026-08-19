import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius, formatINR } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { api } from '../config'

interface Props {
  onBack: () => void
}

interface ContractRow { id: string; ref: string; type: string; status: string; title: string; incoterms?: string | null; partyAOrg: { name: string }; partyBOrg: { name: string } }
interface InvoiceRow { id: string; invoiceNo: string; status: string; netAmount?: number | null; dueDate?: string | null; billToOrg?: { name: string } | null }
interface ContainerRow { id: string; number: string; type: string; status: string; emptyReturnRequired: boolean }
interface ReturnRow { id: string; ref: string; reason: string; status: string; disposition: string }
interface HandoverRow { id: string; ref: string; entityType: string; status: string; fromOrg?: { name: string } | null; toOrg?: { name: string } | null }
interface AppointmentRow { id: string; ref: string; status: string; windowStart: string; windowEnd: string; vehicleNo?: string | null; facility: { name: string }; dock?: { name: string } | null; container?: { number: string } | null }
interface TradeDocRow { id: string; ref: string; docType: string; status: string; totalValue?: number | null; currency: string; issuerOrg?: { name: string } | null; recipientOrg?: { name: string } | null }
interface EdiRow { id: string; direction: string; format: string; documentType: string; status: string; org?: { name: string } | null; partnerOrg?: { name: string } | null; createdAt: string }
interface ExceptionRow { id: string; entityId: string; summary: string; status: string; output?: { findings?: Array<{ severity: string; issue: string; suggestion: string }> }; shipment?: { ref?: string } | null }
interface OrgAnalytics { orgs: number; shipments: { total: number; status: Record<string, number>; last30Days: number }; containers: { total: number; inUse: number; utilization: number }; finance: { invoicesTotal: number; invoicesPaid: number; invoicesOutstanding: number; outstandingValue: number }; yard: { appointmentsTotal: number; appointmentsOpen: number }; contracts: { total: number; active: number } }
interface ComplianceRow { shipmentId: string; ref: string; commodity?: string | null; country?: { code: string; name: string } | null; requiredCount: number; missing: string[]; complete: boolean }

type Tab = 'contracts' | 'invoices' | 'containers' | 'returns' | 'handovers' | 'appointments' | 'documents' | 'edi' | 'exceptions' | 'analytics' | 'compliance'

const STATUS_TONE: Record<string, string> = {
  active: '🟢', paid: '🟢', completed: '🟢', closed: '🟢', available: '🟢', cleared: '🟢',
  draft: '⚪', issued: '🟡', approved: '🔵', requested: '🟡', scheduled: '🟡', reserved: '🟡',
  disputed: '🔴', cancelled: '⚫', terminated: '⚫', held: '🔴', loaded: '🔵', repair: '🟠', on_hold: '🟠',
}

export function ContractsScreen({ onBack }: Props) {
  const theme = useTheme()
  const [tab, setTab] = useState<Tab>('contracts')
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [containers, setContainers] = useState<ContainerRow[]>([])
  const [returns, setReturns] = useState<ReturnRow[]>([])
  const [handovers, setHandovers] = useState<HandoverRow[]>([])
  const [appointments, setAppointments] = useState<AppointmentRow[]>([])
  const [documents, setDocuments] = useState<TradeDocRow[]>([])
  const [ediMessages, setEdiMessages] = useState<EdiRow[]>([])
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([])
  const [analytics, setAnalytics] = useState<OrgAnalytics | null>(null)
  const [compliance, setCompliance] = useState<ComplianceRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<{ contracts: ContractRow[] }>('/contracts').then((r) => setContracts(r.contracts)).catch(() => {}),
      api.get<{ invoices: InvoiceRow[] }>('/invoices').then((r) => setInvoices(r.invoices)).catch(() => {}),
      api.get<{ containers: ContainerRow[] }>('/containers').then((r) => setContainers(r.containers)).catch(() => {}),
      api.get<{ appointments: AppointmentRow[] }>('/yard/appointments').then((r) => setAppointments(r.appointments)).catch(() => {}),
      api.get<{ documents: TradeDocRow[] }>('/trade-documents').then((r) => setDocuments(r.documents)).catch(() => {}),
      api.get<{ messages: EdiRow[] }>('/integrations/edi').then((r) => setEdiMessages(r.messages)).catch(() => {}),
      api.get<{ exceptions: ExceptionRow[] }>('/ai/exceptions/feed').then((r) => setExceptions(r.exceptions)).catch(() => {}),
      api.get<OrgAnalytics>('/analytics/org').then(setAnalytics).catch(() => {}),
      api.get<{ shipments: ComplianceRow[] }>('/countries/compliance/overview').then((r) => setCompliance(r.shipments)).catch(() => {}),
      api.get<{ returns: ReturnRow[] }>('/returns').then((r) => setReturns(r.returns)).catch(() => {}),
      api.get<{ handovers: HandoverRow[] }>('/handovers').then((r) => setHandovers(r.handovers)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'contracts', label: 'Contracts', count: contracts.length },
    { key: 'invoices', label: 'Invoices', count: invoices.length },
    { key: 'containers', label: 'Containers', count: containers.length },
    { key: 'appointments', label: 'Appointments', count: appointments.length },
    { key: 'documents', label: 'Documents', count: documents.length },
    { key: 'returns', label: 'Returns', count: returns.length },
    { key: 'handovers', label: 'Handovers', count: handovers.length },
    { key: 'edi', label: 'EDI', count: ediMessages.length },
    { key: 'exceptions', label: 'Exceptions', count: exceptions.length },
    { key: 'analytics', label: 'Analytics', count: analytics?.orgs ?? 0 },
    { key: 'compliance', label: 'Compliance', count: compliance.length },
  ]

  const data: Array<{ key: string; dot: string; title: string; sub: string; meta: string }> =
    tab === 'contracts'
      ? contracts.map((c) => ({ key: c.id, dot: STATUS_TONE[c.status] ?? '⚪', title: `${c.type} · ${c.title}`, sub: `${c.partyAOrg.name} → ${c.partyBOrg.name}${c.incoterms ? ` · ${c.incoterms}` : ''}`, meta: c.status }))
      : tab === 'invoices'
      ? invoices.map((i) => ({ key: i.id, dot: STATUS_TONE[i.status] ?? '⚪', title: i.invoiceNo, sub: `To ${i.billToOrg?.name ?? '—'} · due ${i.dueDate ? new Date(i.dueDate).toLocaleDateString() : '—'}`, meta: formatINR(i.netAmount ?? 0) }))
      : tab === 'containers'
      ? containers.map((c) => ({ key: c.id, dot: STATUS_TONE[c.status] ?? '⚪', title: c.number, sub: `${c.type}${c.emptyReturnRequired ? ' · ↩ empty return' : ''}`, meta: c.status }))
      : tab === 'appointments'
      ? appointments.map((a) => ({ key: a.id, dot: STATUS_TONE[a.status] ?? '⚪', title: a.ref, sub: `${a.facility.name} · ${a.dock?.name ?? '—'} · ${a.vehicleNo ?? a.container?.number ?? '—'}`, meta: `${new Date(a.windowStart).toLocaleDateString()} ${new Date(a.windowStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` }))
      : tab === 'documents'
      ? documents.map((d) => ({ key: d.id, dot: STATUS_TONE[d.status] ?? '⚪', title: `${d.docType.replace(/_/g, ' ')} · ${d.ref}`, sub: `${d.issuerOrg?.name ?? '—'} → ${d.recipientOrg?.name ?? '—'}`, meta: d.totalValue != null ? `${d.currency} ${d.totalValue}` : d.status }))
      : tab === 'returns'
      ? returns.map((r) => ({ key: r.id, dot: STATUS_TONE[r.status] ?? '⚪', title: r.ref, sub: `${r.reason.replace(/_/g, ' ')} · ${r.disposition}`, meta: r.status }))
      : tab === 'edi'
      ? ediMessages.map((m) => ({ key: m.id, dot: STATUS_TONE[m.status] ?? '⚪', title: `${m.direction} · ${m.documentType}`, sub: `${m.format}${m.partnerOrg?.name ? ` ↔ ${m.partnerOrg.name}` : ''}`, meta: m.status }))
      : tab === 'exceptions'
      ? exceptions.map((x) => ({ key: x.id, dot: STATUS_TONE[x.status] ?? '🟡', title: `${x.shipment?.ref ?? x.entityId.slice(-8)}`, sub: x.summary, meta: x.status }))
      : tab === 'compliance'
      ? compliance.map((c) => ({ key: c.shipmentId, dot: c.complete ? '🟢' : '🔴', title: c.ref, sub: `${c.country?.name ?? '—'}${c.missing.length ? ` · missing: ${c.missing.join(', ')}` : ''}`, meta: c.complete ? 'complete' : `${c.missing.length} missing` }))
      : handovers.map((h) => ({ key: h.id, dot: STATUS_TONE[h.status] ?? '⚪', title: h.ref, sub: `${h.fromOrg?.name ?? '—'} → ${h.toOrg?.name ?? '—'}`, meta: h.status }))

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Contracts & Assets</Text>
        <View style={{ width: 20 }} />
      </View>

      <View style={[styles.tabs, { borderBottomColor: theme.border }]}>
        {tabs.map((t) => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && { borderBottomColor: theme.primary, borderBottomWidth: 2 }]}>
            <Text style={[styles.tabLabel, { color: tab === t.key ? theme.primary : theme.mutedForeground }]}>
              {t.label} <Text style={{ opacity: 0.6 }}>({t.count})</Text>
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>Loading…</Text>
      ) : tab === 'analytics' ? (
        analytics ? (
          <FlatList
            data={[
              { k: 'shipments', label: 'Shipments', value: String(analytics.shipments.total), sub: `${analytics.shipments.last30Days} in last 30 days` },
              { k: 'containers', label: 'Containers', value: String(analytics.containers.total), sub: `${analytics.containers.inUse} in use (${Math.round(analytics.containers.utilization * 100)}%)` },
              { k: 'invoices', label: 'Invoices', value: String(analytics.finance.invoicesTotal), sub: `${analytics.finance.invoicesPaid} paid · ${analytics.finance.invoicesOutstanding} open` },
              { k: 'yard', label: 'Appointments', value: String(analytics.yard.appointmentsTotal), sub: `${analytics.yard.appointmentsOpen} open` },
              { k: 'contracts', label: 'Contracts', value: String(analytics.contracts.total), sub: `${analytics.contracts.active} active` },
            ]}
            keyExtractor={(d) => d.k}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[styles.cardTitle, { color: theme.foreground }]}>{item.label}</Text>
                <Text style={[styles.meta, { color: theme.primary, marginTop: 4 }]}>{item.value}</Text>
                <Text style={[styles.cardSub, { color: theme.mutedForeground }]}>{item.sub}</Text>
              </View>
            )}
          />
        ) : (
          <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>No analytics</Text>
        )
      ) : (
        <FlatList
          data={data}
          keyExtractor={(d) => d.key}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="Nothing here yet" message="Data you create appears here" icon="📭" />}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={{ fontSize: 14 }}>{item.dot}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: theme.foreground }]}>{item.title}</Text>
                  <Text style={[styles.cardSub, { color: theme.mutedForeground }]}>{item.sub}</Text>
                </View>
                <Text style={[styles.meta, { color: theme.primary }]}>{item.meta}</Text>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.lg, borderBottomWidth: 1 },
  tab: { paddingVertical: spacing.md, paddingRight: spacing.lg },
  tabLabel: { fontSize: 13, fontWeight: '700' },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  meta: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
})