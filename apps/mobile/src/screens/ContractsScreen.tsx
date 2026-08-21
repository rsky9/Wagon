import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Modal, TextInput, ScrollView, Alert, KeyboardAvoidingView } from 'react-native'
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

  // Create flows
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [f, setF] = useState<Record<string, string>>({})
  const [detail, setDetail] = useState<{ title: string; sub: string; meta: string; dot: string } | null>(null)

  const CREATABLE = ['contracts', 'invoices', 'containers', 'returns', 'handovers']

  const refetch = () => {
    setLoading(true)
    Promise.all([
      api.get<{ contracts: ContractRow[] }>('/contracts').then((r) => setContracts(r.contracts)).catch(() => {}),
      api.get<{ invoices: InvoiceRow[] }>('/invoices').then((r) => setInvoices(r.invoices)).catch(() => {}),
      api.get<{ containers: ContainerRow[] }>('/containers').then((r) => setContainers(r.containers)).catch(() => {}),
      api.get<{ returns: ReturnRow[] }>('/returns').then((r) => setReturns(r.returns)).catch(() => {}),
      api.get<{ handovers: HandoverRow[] }>('/handovers').then((r) => setHandovers(r.handovers)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }

  const submitCreate = () => {
    if (tab === 'contracts' && (!f.type || !f.partyBOrgId)) { Alert.alert('Required', 'Contract type and counterparty org are required'); return }
    if (tab === 'containers' && !f.number) { Alert.alert('Required', 'Container number is required'); return }
    if (tab === 'returns' && !f.reason) { Alert.alert('Required', 'Return reason is required'); return }
    if (tab === 'handovers' && !f.entityType) { Alert.alert('Required', 'Handover entity type is required'); return }
    if (tab === 'invoices' && !f.tripId && !f.shipmentId) { Alert.alert('Required', 'A trip or shipment reference is required'); return }

    setCreating(true)
    let body: Record<string, unknown> = { ...f }
    if (tab === 'invoices') {
      if (f.accessorials) {
        body.accessorials = f.accessorials.split(',').map((s) => s.trim()).filter(Boolean).map((kind) => ({ kind, amount: Number(f[`acc_${kind}`] ?? 0) }))
      }
      if (body.netAmount != null) body.netAmount = Number(body.netAmount)
    }
    if (tab === 'containers') body.type = f.type || '20GP'
    const endpoint =
      tab === 'contracts' ? '/contracts' :
      tab === 'invoices' ? '/invoices' :
      tab === 'containers' ? '/containers' :
      tab === 'returns' ? '/returns' : '/handovers'
    api.post(endpoint, body)
      .then(() => { setShowCreate(false); setF({}); Alert.alert('Created', 'Record created'); refetch() })
      .catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create'))
      .finally(() => setCreating(false))
  }

  const fieldsFor = (): Array<{ key: string; label: string; placeholder: string; keyboard?: 'numeric' }> => {
    if (tab === 'contracts') return [
      { key: 'type', label: 'Type', placeholder: 'customer | carrier | warehouse | service' },
      { key: 'partyBOrgId', label: 'Counterparty org ID', placeholder: 'Org id of the other party' },
      { key: 'title', label: 'Title', placeholder: 'Contract title' },
      { key: 'incoterms', label: 'Incoterms', placeholder: 'e.g. CIF, FOB' },
      { key: 'paymentTerms', label: 'Payment terms', placeholder: 'e.g. Net 30' },
    ]
    if (tab === 'invoices') return [
      { key: 'tripId', label: 'Trip ID', placeholder: 'Trip id (or shipment id)' },
      { key: 'shipmentId', label: 'Shipment ID', placeholder: 'Shipment id (optional if trip)' },
      { key: 'accessorials', label: 'Accessorials', placeholder: 'Comma-separated kinds, e.g. detention,demurrage' },
    ]
    if (tab === 'containers') return [
      { key: 'number', label: 'Container number', placeholder: 'e.g. MSCU1234567' },
      { key: 'type', label: 'Type', placeholder: '20GP | 40GP | 40HC | reefer | …' },
      { key: 'locationRef', label: 'Location', placeholder: 'Location reference' },
    ]
    if (tab === 'returns') return [
      { key: 'reason', label: 'Reason', placeholder: 'customer_return | damage | repair | …' },
      { key: 'shipmentId', label: 'Shipment ID', placeholder: 'Reference a shipment (or cargo unit)' },
      { key: 'condition', label: 'Condition', placeholder: 'Condition on return' },
    ]
    return [
      { key: 'entityType', label: 'Entity type', placeholder: 'cargo_unit | container | vehicle | shipment' },
      { key: 'toOrgId', label: 'Receiving org ID', placeholder: 'Org id receiving the handover' },
      { key: 'locationRef', label: 'Location', placeholder: 'Location reference' },
    ]
  }

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
        {CREATABLE.includes(tab) ? (
          <Pressable onPress={() => { setF({}); setShowCreate(true) }} hitSlop={8}>
            <Text style={{ color: theme.primary, fontSize: 22, fontWeight: '800' }}>+</Text>
          </Pressable>
        ) : (
          <View style={{ width: 20 }} />
        )}
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
          ListEmptyComponent={
            CREATABLE.includes(tab)
              ? <EmptyState title="Nothing here yet" message={`Tap + to create your first ${tab.slice(0, -1)}`} icon="📭" actionLabel="Create" onAction={() => { setF({}); setShowCreate(true) }} />
              : <EmptyState title="Nothing here yet" message="Data you create appears here" icon="📭" />
          }
          renderItem={({ item }) => (
            <Pressable style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => setDetail(item)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={{ fontSize: 14 }}>{item.dot}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: theme.foreground }]}>{item.title}</Text>
                  <Text style={[styles.cardSub, { color: theme.mutedForeground }]}>{item.sub}</Text>
                </View>
                <Text style={[styles.meta, { color: theme.primary }]}>{item.meta}</Text>
              </View>
              <Text style={{ color: theme.mutedForeground, fontSize: 12, marginTop: 4 }}>Tap for details ›</Text>
            </Pressable>
          )}
        />
      )}

      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView behavior="padding" style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.modalTitle, { color: theme.foreground }]}>New {tab.slice(0, -1)}</Text>
              <Pressable onPress={() => setShowCreate(false)} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 18 }}>✕</Text></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
              {fieldsFor().map((field) => (
                <View key={field.key}>
                  <Text style={[styles.fieldLabel, { color: theme.mutedForeground }]}>{field.label}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]}
                    placeholder={field.placeholder}
                    placeholderTextColor={theme.mutedForeground + '88'}
                    value={f[field.key] ?? ''}
                    onChangeText={(v) => setF((prev) => ({ ...prev, [field.key]: v }))}
                    keyboardType={field.keyboard === 'numeric' ? 'numeric' : 'default'}
                  />
                </View>
              ))}
            </ScrollView>
            <Pressable style={[styles.createBtn, { backgroundColor: theme.primary }]} onPress={submitCreate} disabled={creating}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>{creating ? 'Creating…' : 'Create'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!detail} transparent animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={styles.modalWrap}>
          <View style={[styles.modal, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.modalTitle, { color: theme.foreground }]}>{detail?.title ?? ''}</Text>
              <Pressable onPress={() => setDetail(null)} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 18 }}>✕</Text></Pressable>
            </View>
            <Text style={[styles.meta, { color: theme.mutedForeground }]}>{detail?.sub ?? ''}</Text>
            <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <Text style={[styles.cardTitle, { color: theme.foreground }]}>{detail?.title ?? ''}</Text>
              <Text style={{ color: theme.mutedForeground, fontSize: 13, marginTop: 4 }}>{detail?.sub ?? ''}</Text>
              <View style={{ marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text style={{ fontSize: 14 }}>{detail?.dot ?? ''}</Text>
                <Text style={[styles.meta, { color: theme.primary }]}>{detail?.meta ?? ''}</Text>
              </View>
            </View>
            <Pressable style={[styles.createBtn, { backgroundColor: theme.muted }]} onPress={() => setDetail(null)}>
              <Text style={{ color: theme.foreground, fontWeight: '800' }}>Close</Text>
            </Pressable>
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
  tabs: { flexDirection: 'row', paddingHorizontal: spacing.lg, borderBottomWidth: 1 },
  tab: { paddingVertical: spacing.md, paddingRight: spacing.lg },
  tabLabel: { fontSize: 13, fontWeight: '700' },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  cardSub: { fontSize: 12, marginTop: 2 },
  meta: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, padding: spacing.xl, maxHeight: '82%' },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  fieldLabel: { fontSize: 12, fontWeight: '700', marginTop: spacing.sm },
  input: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, fontSize: 14, marginTop: 2 },
  createBtn: { borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.md },
})