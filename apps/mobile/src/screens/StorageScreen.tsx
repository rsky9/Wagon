import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { api } from '../config'
import type { Facility, WarehouseOperation } from '@wagon/contracts'
import { alertPrompt, prompt } from '../components/Prompt'
import { showActionSheet } from '../components/ActionSheet'
interface Props {
  onBack: () => void
}

interface Appointment {
  id: string
  ref: string
  status: string
  windowStart: string
  windowEnd: string
  vehicleNo?: string | null
  facility: { name: string }
  dock?: { name: string } | null
  container?: { number: string } | null
}

interface ContainerRow {
  id: string
  number: string
  type: string
  status: string
  emptyReturnRequired: boolean
  vessel?: string | null
  voyage?: string | null
}

interface DockRow {
  id: string
  name: string
  kind: string
  status: string
}

const APPT_NEXT: Record<string, string[]> = {
  requested: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed'],
}

const CONTAINER_NEXT: Record<string, string[]> = {
  available: ['reserved', 'on_hold', 'repair', 'scrap'],
  reserved: ['stuffed', 'available'],
  stuffed: ['gate_in', 'loaded'],
  gate_in: ['loaded', 'stuffed'],
  loaded: ['discharged'],
  discharged: ['released', 'empty_return'],
  released: ['available', 'empty_return', 'on_hold'],
  empty_return: ['available', 'repair'],
  repair: ['available', 'scrap'],
  on_hold: ['available', 'scrap'],
}

export function StorageScreen({ onBack }: Props) {
  const theme = useTheme()
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [operations, setOperations] = useState<WarehouseOperation[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [kind, setKind] = useState('cfs')
  const [city, setCity] = useState('')
  const [creating, setCreating] = useState(false)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [docks, setDocks] = useState<DockRow[]>([])
  const [containers, setContainers] = useState<ContainerRow[]>([])

  const fetch = useCallback(() => {
    Promise.all([
      api.get<{ facilities: Facility[] }>('/storage/facilities'),
      api.get<{ operations: WarehouseOperation[] }>('/storage/operations'),
      api.get<{ appointments: Appointment[] }>('/yard/appointments'),
      api.get<{ docks: DockRow[] }>('/yard/docks'),
      api.get<{ containers: ContainerRow[] }>('/containers'),
    ]).then(([f, o, a, d, c]) => { setFacilities(f.facilities); setOperations(o.operations); setAppointments(a.appointments); setDocks(d.docks); setContainers(c.containers) }).catch(() => {}).finally(() => setLoading(false))
  }, [])
  useEffect(() => { fetch() }, [fetch])

  const create = () => {
    if (!name.trim()) { Alert.alert('Facility name required'); return }
    setCreating(true)
    api.post<{ facility: Facility }>('/storage/facilities', { name: name.trim(), kind, city: city.trim() || undefined })
      .then(() => { setName(''); setCity(''); fetch() })
      .catch((e) => Alert.alert('Error', e.message))
      .finally(() => setCreating(false))
  }

  const advance = (opId: string) => {
    api.post(`/storage/operations/${opId}/advance`).then(() => fetch()).catch((e) => Alert.alert('Error', e.message))
  }

  const startOperation = (facilityId: string) => {
    alertPrompt('Start operation', 'Shipment id (optional)', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start', onPress: (shipmentId?: string) => {
        api.post(`/storage/facilities/${facilityId}/operations`, { shipmentId: shipmentId?.trim() || undefined })
          .then(() => fetch()).catch((e) => Alert.alert('Error', e.message))
      } },
    ])
  }

  const cancelOp = (opId: string) => {
    alertPrompt('Cancel operation', 'Reason', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Cancel operation', style: 'destructive', onPress: (reason?: string) => {
        api.patch(`/storage/operations/${opId}/cancel`, { reason: reason ?? 'cancelled' })
          .then(() => fetch()).catch((e) => Alert.alert('Error', e.message))
      } },
    ])
  }

  const recordEvidence = (opId: string) => {
    alertPrompt('Record evidence', 'Note (e.g. "48 pallets, bin A12")', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Save', onPress: (note?: string) => {
        if (!note?.trim()) { Alert.alert('Note required'); return }
        api.post(`/storage/operations/${opId}/evidence`, { note: note.trim() })
          .then(() => fetch()).catch((e) => Alert.alert('Error', e.message))
      } },
    ])
  }

  // ---- Yard appointments ----
  const createAppointment = () => {
    if (!facilities.length) { Alert.alert('No facility', 'Create a facility first'); return }
    const facility = facilities[0]
    const facilityDocks = docks.filter((d) => d.status === 'available')
    const pickDock = (dockId?: string) => {
      prompt({ title: 'Vehicle number', placeholder: 'e.g. KA01AB1234 (optional)', keyboardType: 'default' }).then((vehicle) => {
        const start = new Date()
        const end = new Date(start.getTime() + 2 * 3600000)
        api.post('/yard/appointments', {
          facilityId: facility.id,
          dockId: dockId,
          vehicleNo: vehicle?.trim() || undefined,
          windowStart: start.toISOString(),
          windowEnd: end.toISOString(),
        }).then(() => { Alert.alert('Appointment created', 'Dock scheduled'); fetch() }).catch((e) => Alert.alert('Error', e.message))
      })
    }
    if (facilityDocks.length) {
      showActionSheet({
        title: 'Book a dock',
        message: `${facility.name} · free docks`,
        options: [
          ...facilityDocks.map((d) => ({ text: `${d.name} · ${d.kind}`, onPress: () => pickDock(d.id) })),
          { text: 'No dock (just schedule)', onPress: () => pickDock(undefined) },
        ],
      })
    } else {
      pickDock(undefined)
    }
  }

  const transitionAppointment = (a: Appointment) => {
    const next = APPT_NEXT[a.status] ?? []
    if (!next.length) { Alert.alert('Complete', 'This appointment has no further transitions'); return }
    showActionSheet({
      title: `Appointment · ${a.status}`,
      message: a.ref,
      options: next.map((s) => ({ text: s.replace(/_/g, ' '), onPress: () => {
        api.patch(`/yard/appointments/${a.id}/status`, { status: s }).then(() => fetch()).catch((e) => Alert.alert('Error', e.message))
      } })),
    })
  }

  // ---- Containers ----
  const registerContainer = () => {
    prompt({ title: 'Container number', placeholder: 'e.g. MSCU1234567' }).then((num) => {
      if (!num?.trim()) return
      prompt({ title: 'Container type', placeholder: '20GP (default)', defaultValue: '20GP' }).then((type) => {
        api.post('/containers', { number: num.trim().toUpperCase(), type: (type ?? '20GP').trim() || '20GP' })
          .then(() => { Alert.alert('Registered', 'Container added to fleet'); fetch() })
          .catch((e) => Alert.alert('Error', e.message))
      })
    })
  }

  const transitionContainer = (c: ContainerRow) => {
    const next = CONTAINER_NEXT[c.status] ?? []
    if (!next.length) { Alert.alert('Final', 'Container is in a final state'); return }
    showActionSheet({
      title: `Container · ${c.number}`,
      message: `${c.type} · ${c.status}`,
      options: next.map((s) => ({ text: s.replace(/_/g, ' '), onPress: () => {
        api.patch(`/containers/${c.id}/status`, { status: s }).then(() => fetch()).catch((e) => Alert.alert('Error', e.message))
      } })),
    })
  }

  const inspectContainer = (c: ContainerRow) => {
    prompt({ title: 'Inspection note', placeholder: 'Condition, seal, damage…' }).then((note) => {
      if (!note?.trim()) return
      api.post(`/containers/${c.id}/inspect`, { note: note.trim() }).then(() => fetch()).catch((e) => Alert.alert('Error', e.message))
    })
  }

  const postTransportNeed = () => {
    alertPrompt('Post transport shipment', 'Origin (city)', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Next', onPress: (origin?: string) => {
        alertPrompt('Destination (city)', 'Destination for the transport shipment', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Post', onPress: (dest?: string) => {
            api.post('/market/requests', { kind: 'transport', originRef: origin?.trim(), destinationRef: dest?.trim() })
              .then(() => Alert.alert('Posted', 'Transport shipment published to the marketplace'))
              .catch((e) => Alert.alert('Error', e.message))
          } },
        ])
      } },
    ])
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Warehouse & Storage</Text>
        <Pressable onPress={postTransportNeed} hitSlop={8}><Text style={{ color: '#F97316', fontSize: 14, fontWeight: '800' }}>+ Haul</Text></Pressable>
      </View>

      <FlatList
        contentContainerStyle={styles.list}
        data={[{ k: 'facilities' as const }, { k: 'operations' as const }, { k: 'appointments' as const }, { k: 'docks' as const }, { k: 'containers' as const }]}
        keyExtractor={(i) => i.k}
        ListHeaderComponent={
          <View style={[styles.form, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.formTitle, { color: theme.foreground }]}>New facility</Text>
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="Facility name" placeholderTextColor={theme.mutedForeground} value={name} onChangeText={setName} />
            <View style={styles.row}>
              {['warehouse', 'cfs', 'icd', 'cold', 'yard'].map((k) => (
                <Pressable key={k} style={[styles.kindChip, kind === k && styles.kindActive]} onPress={() => setKind(k)}>
                  <Text style={[styles.kindText, { color: kind === k ? '#fff' : theme.foreground }]}>{k}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]} placeholder="City" placeholderTextColor={theme.mutedForeground} value={city} onChangeText={setCity} />
            <Pressable style={[styles.createBtn, { backgroundColor: '#F97316' }]} onPress={create} disabled={creating}>
              <Text style={styles.createBtnText}>{creating ? 'Creating…' : '+ Create'}</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.section}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
              <Text style={[styles.sectionTitle, { color: theme.foreground }]}>
                {item.k === 'facilities' ? `Facilities (${facilities.length})`
                  : item.k === 'operations' ? `Operations (${operations.length})`
                  : item.k === 'appointments' ? `Yard appointments (${appointments.length})`
                  : item.k === 'docks' ? `Docks (${docks.length})`
                  : `Containers (${containers.length})`}
              </Text>
              {item.k === 'appointments' && (
                <Pressable style={[styles.advanceBtn, { backgroundColor: '#F97316' }]} onPress={createAppointment}>
                  <Text style={styles.advanceBtnText}>+ Book dock</Text>
                </Pressable>
              )}
              {item.k === 'containers' && (
                <Pressable style={[styles.advanceBtn, { backgroundColor: '#F97316' }]} onPress={registerContainer}>
                  <Text style={styles.advanceBtnText}>+ Register</Text>
                </Pressable>
              )}
            </View>
            {item.k === 'facilities' && (facilities.length === 0
              ? <EmptyState title="No facilities" message="Create a warehouse/CFS above" icon="🏭" />
              : facilities.map((f) => (
                <View key={f.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.cardTop}>
                    <Text style={[styles.cardTitle, { color: theme.foreground }]}>{f.name}</Text>
                    <Text style={[styles.chip, { color: theme.warning, borderColor: theme.warning }]}>{f.kind}</Text>
                  </View>
                  <Text style={[styles.meta, { color: theme.mutedForeground }]}>{f.city ?? '—'} · {f.capacitySlots} slots</Text>
                  <Pressable style={[styles.advanceBtn, { backgroundColor: '#F97316' }]} onPress={() => startOperation(f.id)}>
                    <Text style={styles.advanceBtnText}>Start operation →</Text>
                  </Pressable>
                </View>
              )))}
            {item.k === 'appointments' && (appointments.length === 0
              ? <EmptyState title="No appointments" message="Book a dock slot for a vehicle/container" icon="🕐" />
              : appointments.map((a) => (
                <Pressable key={a.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => transitionAppointment(a)}>
                  <View style={styles.cardTop}>
                    <Text style={[styles.cardTitle, { color: theme.foreground }]}>{a.ref}</Text>
                    <Text style={[styles.chip, { color: theme.warning, borderColor: theme.warning }]}>{a.status}</Text>
                  </View>
                  <Text style={[styles.meta, { color: theme.mutedForeground }]}>
                    {a.facility.name}{a.dock ? ` · ${a.dock.name}` : ''}{a.vehicleNo ? ` · ${a.vehicleNo}` : ''}
                  </Text>
                  <Text style={[styles.meta, { color: theme.mutedForeground }]}>
                    {new Date(a.windowStart).toLocaleString()} → {new Date(a.windowEnd).toLocaleTimeString()}
                  </Text>
                </Pressable>
              )))}
            {item.k === 'docks' && (docks.length === 0
              ? <EmptyState title="No docks" message="Docks appear once a facility exists" icon="🚧" />
              : docks.map((d) => (
                <View key={d.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.cardTop}>
                    <Text style={[styles.cardTitle, { color: theme.foreground }]}>{d.name}</Text>
                    <Text style={[styles.chip, { color: d.status === 'available' ? '#16a34a' : d.status === 'busy' ? '#F97316' : theme.danger, borderColor: d.status === 'available' ? '#16a34a' : d.status === 'busy' ? '#F97316' : theme.danger }]}>{d.status}</Text>
                  </View>
                  <Text style={[styles.meta, { color: theme.mutedForeground }]}>{d.kind}</Text>
                </View>
              )))}
            {item.k === 'containers' && (containers.length === 0
              ? <EmptyState title="No containers" message="Register a container to track its lifecycle" icon="📦" />
              : containers.map((c) => (
                <View key={c.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.cardTop}>
                    <Text style={[styles.cardTitle, { color: theme.foreground }]}>{c.number}</Text>
                    <Text style={[styles.chip, { color: theme.warning, borderColor: theme.warning }]}>{c.status}</Text>
                  </View>
                  <Text style={[styles.meta, { color: theme.mutedForeground }]}>{c.type}</Text>
                  <View style={styles.row}>
                    <Pressable style={[styles.advanceBtn, styles.flexBtn, { backgroundColor: '#F97316' }]} onPress={() => transitionContainer(c)}>
                      <Text style={styles.advanceBtnText}>Move →</Text>
                    </Pressable>
                    <Pressable style={[styles.advanceBtn, styles.flexBtn, { backgroundColor: theme.mutedForeground }]} onPress={() => inspectContainer(c)}>
                      <Text style={styles.advanceBtnText}>Inspect</Text>
                    </Pressable>
                  </View>
                </View>
              )))}
            {item.k === 'operations' && (operations.length === 0
              ? <EmptyState title="No operations" message="Start one from a facility" icon="🚪" />
              : operations.map((op) => (
                <View key={op.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.cardTop}>
                    <Text style={[styles.cardTitle, { color: theme.foreground }]}>{op.ref}</Text>
                    <Text style={[styles.chip, { color: theme.warning, borderColor: theme.warning }]}>{op.status}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Pressable style={[styles.advanceBtn, styles.flexBtn, { backgroundColor: '#F97316' }]} onPress={() => advance(op.id)}>
                      <Text style={styles.advanceBtnText}>Advance →</Text>
                    </Pressable>
                    {op.status !== 'done' && op.status !== 'cancelled' && (
                      <Pressable style={[styles.advanceBtn, styles.flexBtn, { backgroundColor: theme.mutedForeground }]} onPress={() => recordEvidence(op.id)}>
                        <Text style={styles.advanceBtnText}>Evidence</Text>
                      </Pressable>
                    )}
                    {op.status !== 'done' && op.status !== 'cancelled' && (
                      <Pressable style={[styles.advanceBtn, styles.flexBtn, { backgroundColor: theme.danger }]} onPress={() => cancelOp(op.id)}>
                        <Text style={styles.advanceBtnText}>Cancel</Text>
                      </Pressable>
                    )}
                  </View>
                  {Array.isArray(op.evidence) && op.evidence.length > 0 && (
                    <Text style={[styles.meta, { color: theme.mutedForeground }]}>📋 {op.evidence.length} evidence record(s)</Text>
                  )}
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
  kindChip: { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: 'rgba(128,128,128,0.4)' },
  kindActive: { backgroundColor: '#F97316', borderColor: '#F97316' },
  kindText: { fontSize: 12, fontWeight: '700' },
  createBtn: { borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: 6 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  chip: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2, textTransform: 'uppercase' },
  meta: { fontSize: 13 },
  advanceBtn: { borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
  advanceBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  flexBtn: { flex: 1 },
})
