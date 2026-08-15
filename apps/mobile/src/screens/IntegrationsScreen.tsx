import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert, TextInput, Modal, ScrollView, KeyboardAvoidingView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { api } from '../config'
import type { WebhookSubscription, WebhookDelivery, IntegrationConnector } from '@wagon/contracts'

interface Props {
  onBack: () => void
}

type Tab = 'webhooks' | 'connectors' | 'deliveries'

export function IntegrationsScreen({ onBack }: Props) {
  const theme = useTheme()
  const [tab, setTab] = useState<Tab>('webhooks')
  const [webhooks, setWebhooks] = useState<WebhookSubscription[]>([])
  const [connectors, setConnectors] = useState<IntegrationConnector[]>([])
  const [catalog, setCatalog] = useState<Array<{ kind: string; name: string; description: string; protocol: string }>>([])
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Create webhook modal
  const [showCreate, setShowCreate] = useState(false)
  const [whName, setWhName] = useState('')
  const [whUrl, setWhUrl] = useState('')
  const [whEvents, setWhEvents] = useState('')

  const fetch = useCallback(() => {
    Promise.all([
      api.get<{ webhooks: WebhookSubscription[] }>('/integrations/webhooks').then((r) => setWebhooks(r.webhooks)).catch(() => {}),
      api.get<{ connectors: IntegrationConnector[] }>('/integrations/connectors').then((r) => setConnectors(r.connectors)).catch(() => {}),
      api.get<{ connectors: Array<{ kind: string; name: string; description: string; protocol: string }> }>('/integrations/catalog').then((r) => setCatalog(r.connectors)).catch(() => {}),
      api.get<{ deliveries: WebhookDelivery[] }>('/integrations/deliveries').then((r) => setDeliveries(r.deliveries)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])
  useEffect(() => { fetch() }, [fetch])

  const createWebhook = () => {
    if (!whName.trim() || !whUrl.trim() || !whEvents.trim()) { Alert.alert('Name, URL and events required'); return }
    setBusy(true)
    api.post('/integrations/webhooks', {
      name: whName.trim(),
      url: whUrl.trim(),
      eventTypes: whEvents.split(',').map((e) => e.trim()).filter(Boolean),
    }).then(() => { setShowCreate(false); setWhName(''); setWhUrl(''); setWhEvents(''); fetch() })
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setBusy(false))
  }

  const toggleWebhook = (w: WebhookSubscription) => {
    setBusy(true)
    api.patch(`/integrations/webhooks/${w.id}/status`, { status: w.status === 'active' ? 'paused' : 'active' })
      .then(() => fetch())
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setBusy(false))
  }

  const testWebhook = (id: string) => {
    setBusy(true)
    api.post(`/integrations/webhooks/${id}/test`)
      .then(() => { Alert.alert('Test sent', 'A probe delivery was queued'); fetch() })
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setBusy(false))
  }

  const retryDelivery = (id: string) => {
    setBusy(true)
    api.post(`/integrations/deliveries/${id}/retry`)
      .then(() => { Alert.alert('Retrying', 'Delivery requeued'); fetch() })
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setBusy(false))
  }

  const toggleConnector = (c: IntegrationConnector) => {
    setBusy(true)
    api.patch(`/integrations/connectors/${c.id}/status`, { status: c.status === 'active' ? 'disabled' : 'active' })
      .then(() => fetch())
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setBusy(false))
  }

  const installConnector = (kind: string) => {
    setBusy(true)
    api.post('/integrations/connectors/install', { kind })
      .then(() => { Alert.alert('Installed', `${kind} connector connected`); fetch() })
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setBusy(false))
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Integrations</Text>
        <Pressable onPress={() => setShowCreate(true)} hitSlop={8}><Text style={{ color: '#F97316', fontSize: 14, fontWeight: '800' }}>+ Hook</Text></Pressable>
      </View>

      <View style={styles.tabs}>
        {([['webhooks', 'Webhooks'], ['connectors', 'Connectors'], ['deliveries', 'Deliveries']] as [Tab, string][]).map(([k, label]) => (
          <Pressable key={k} style={[styles.tabBtn, tab === k && { backgroundColor: '#F97316' }]} onPress={() => setTab(k)}>
            <Text style={{ color: tab === k ? '#fff' : theme.mutedForeground, fontWeight: '800', fontSize: 13 }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'webhooks' && (
        <FlatList
          contentContainerStyle={styles.list}
          data={webhooks}
          keyExtractor={(w) => w.id}
          ListEmptyComponent={loading ? undefined : <EmptyState title="No webhooks" message="Tap + Hook to receive events" icon="🔗" />}
          renderItem={({ item }) => (
            <View key={item.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.cardTitle, { color: theme.foreground }]}>{item.name}</Text>
                <Text style={[styles.chip, { color: item.status === 'active' ? theme.success : theme.warning, borderColor: item.status === 'active' ? theme.success : theme.warning }]}>{item.status}</Text>
              </View>
              <Text style={[styles.meta, { color: theme.mutedForeground }]}>{item.url}</Text>
              <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>{item.eventTypes.join(', ')}</Text>
              <View style={styles.actions}>
                <Pressable style={[styles.smallBtn, { backgroundColor: theme.warning }]} onPress={() => toggleWebhook(item)}>
                  <Text style={styles.actionText}>{item.status === 'active' ? 'Pause' : 'Resume'}</Text>
                </Pressable>
                <Pressable style={[styles.smallBtn, { backgroundColor: theme.success }]} onPress={() => testWebhook(item.id)}>
                  <Text style={styles.actionText}>Test</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      {tab === 'connectors' && (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={[styles.sectionTitle, { color: theme.foreground }]}>Connector marketplace</Text>
          <Text style={[styles.meta, { color: theme.mutedForeground }]}>Install a ready connector for your ERP/TMS/carrier stack.</Text>
          {catalog.length === 0 && loading ? (
            <Text style={{ color: theme.mutedForeground, textAlign: 'center', paddingVertical: 20 }}>Loading catalog…</Text>
          ) : (
            catalog.map((c) => (
              <View key={c.kind} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.cardTop}>
                  <Text style={[styles.cardTitle, { color: theme.foreground }]}>{c.name}</Text>
                  <Text style={[styles.chip, { color: '#3B82F6', borderColor: '#3B82F6' }]}>{c.protocol}</Text>
                </View>
                <Text style={[styles.meta, { color: theme.mutedForeground }]}>{c.description}</Text>
                <Pressable style={[styles.smallBtn, { backgroundColor: '#F97316', alignSelf: 'flex-start', marginTop: spacing.sm }]} onPress={() => installConnector(c.kind)}>
                  <Text style={styles.actionText}>Install</Text>
                </Pressable>
              </View>
            ))
          )}
          <Text style={[styles.sectionTitle, { color: theme.foreground, marginTop: spacing.lg }]}>Connected ({connectors.length})</Text>
          {connectors.length === 0 && !loading ? (
            <EmptyState title="No connectors yet" message="Install one from the marketplace above" icon="🔌" />
          ) : (
            connectors.map((item) => (
              <View key={item.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.cardTop}>
                  <Text style={[styles.cardTitle, { color: theme.foreground }]}>{item.name} · {item.kind}</Text>
                  <Text style={[styles.chip, { color: item.status === 'active' ? theme.success : theme.warning, borderColor: item.status === 'active' ? theme.success : theme.warning }]}>{item.status}</Text>
                </View>
                <Text style={[styles.meta, { color: theme.mutedForeground }]}>{item.baseUrl ?? '—'}</Text>
                <Pressable style={[styles.smallBtn, { backgroundColor: item.status === 'active' ? theme.danger : theme.success, alignSelf: 'flex-start', marginTop: spacing.sm }]} onPress={() => toggleConnector(item)}>
                  <Text style={styles.actionText}>{item.status === 'active' ? 'Disable' : 'Enable'}</Text>
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {tab === 'deliveries' && (
        <FlatList
          contentContainerStyle={styles.list}
          data={deliveries}
          keyExtractor={(d) => d.id}
          ListEmptyComponent={loading ? undefined : <EmptyState title="No deliveries" message="Webhook deliveries appear here" icon="📨" />}
          renderItem={({ item }) => (
            <View key={item.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.cardTitle, { color: theme.foreground }]}>{item.eventCode}</Text>
                <Text style={[styles.chip, { color: item.status === 'sent' ? theme.success : item.status === 'dead' ? theme.danger : theme.warning, borderColor: item.status === 'sent' ? theme.success : item.status === 'dead' ? theme.danger : theme.warning }]}>{item.status}</Text>
              </View>
              <Text style={[styles.meta, { color: theme.mutedForeground }]}>attempts {item.attempts} · {item.responseStatus ?? '—'}</Text>
              {(item.status === 'failed' || item.status === 'dead') && (
                <Pressable style={[styles.smallBtn, { backgroundColor: '#F97316', alignSelf: 'flex-start', marginTop: spacing.sm }]} onPress={() => retryDelivery(item.id)}>
                  <Text style={styles.actionText}>Retry</Text>
                </Pressable>
              )}
            </View>
          )}
        />
      )}

      {/* Create webhook modal */}
      <Modal visible={showCreate} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalWrap} behavior="padding">
          <ScrollView style={[styles.modal, { backgroundColor: theme.card, borderColor: theme.border }]} keyboardShouldPersistTaps="handled">
            <Text style={[styles.modalTitle, { color: theme.foreground }]}>New webhook</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Name" placeholderTextColor={theme.mutedForeground} value={whName} onChangeText={setWhName} />
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="URL (https://...)" placeholderTextColor={theme.mutedForeground} value={whUrl} onChangeText={setWhUrl} autoCapitalize="none" />
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Events (comma: LOAD_CREATED,DELIVERED)" placeholderTextColor={theme.mutedForeground} value={whEvents} onChangeText={setWhEvents} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable style={[styles.modalBtn, { backgroundColor: theme.muted }]} onPress={() => setShowCreate(false)}><Text style={{ color: theme.foreground, fontWeight: '700' }}>Cancel</Text></Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: '#F97316' }]} onPress={createWebhook} disabled={busy}><Text style={{ color: '#fff', fontWeight: '800' }}>{busy ? 'Creating…' : 'Create'}</Text></Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  sectionTitle: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  tabs: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md },
  tabBtn: { flex: 1, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center', backgroundColor: 'rgba(128,128,128,0.1)' },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 13 },
  chip: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2, textTransform: 'uppercase' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  smallBtn: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, padding: spacing.xl, gap: spacing.sm },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  input: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, fontSize: 14 },
  modalBtn: { borderRadius: radius.md, padding: spacing.md, flex: 1, alignItems: 'center' },
})
