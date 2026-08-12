import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { api } from '../config'
import type { Facility, WarehouseOperation } from '@wagon/contracts'

interface Props {
  onBack: () => void
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

  const fetch = useCallback(() => {
    Promise.all([
      api.get<{ facilities: Facility[] }>('/storage/facilities'),
      api.get<{ operations: WarehouseOperation[] }>('/storage/operations'),
    ]).then(([f, o]) => { setFacilities(f.facilities); setOperations(o.operations) }).catch(() => {}).finally(() => setLoading(false))
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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Warehouse & Storage</Text>
        <View style={{ width: 20 }} />
      </View>

      <FlatList
        contentContainerStyle={styles.list}
        data={[{ k: 'facilities' as const }, { k: 'operations' as const }]}
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
            <Text style={[styles.sectionTitle, { color: theme.foreground }]}>
              {item.k === 'facilities' ? `Facilities (${facilities.length})` : `Operations (${operations.length})`}
            </Text>
            {item.k === 'facilities' && (facilities.length === 0
              ? <EmptyState title="No facilities" message="Create a warehouse/CFS above" icon="🏭" />
              : facilities.map((f) => (
                <View key={f.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.cardTop}>
                    <Text style={[styles.cardTitle, { color: theme.foreground }]}>{f.name}</Text>
                    <Text style={[styles.chip, { color: theme.warning, borderColor: theme.warning }]}>{f.kind}</Text>
                  </View>
                  <Text style={[styles.meta, { color: theme.mutedForeground }]}>{f.city ?? '—'} · {f.capacitySlots} slots</Text>
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
                  <Pressable style={[styles.advanceBtn, { backgroundColor: '#F97316' }]} onPress={() => advance(op.id)}>
                    <Text style={styles.advanceBtnText}>Advance →</Text>
                  </Pressable>
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
})
