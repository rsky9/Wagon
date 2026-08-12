import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { api } from '../config'
import type { Shipment } from '@wagon/contracts'

interface Props {
  onBack: () => void
}

export function ShipmentsScreen({ onBack }: Props) {
  const theme = useTheme()
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [commodity, setCommodity] = useState('')
  const [weight, setWeight] = useState('')
  const [value, setValue] = useState('')

  const fetch = useCallback(() => {
    api.get<{ shipments: Shipment[] }>('/foundation/shipments').then((r) => setShipments(r.shipments)).catch(() => {}).finally(() => setLoading(false))
  }, [])
  useEffect(() => { fetch() }, [fetch])

  const create = () => {
    if (!commodity.trim()) { Alert.alert('Commodity required'); return }
    setCreating(true)
    api.post<{ shipment: Shipment }>('/foundation/shipments', {
      commodity: commodity.trim(),
      weightKg: weight ? Number(weight) : undefined,
      value: value ? Number(value) : undefined,
      pieces: 1,
    }).then(async (r) => {
      await api.post(`/foundation/shipments/${r.shipment.id}/legs`, { mode: 'road', pickupAddr: 'Origin', dropAddr: 'Destination' })
      setCommodity(''); setWeight(''); setValue('')
      fetch()
    }).catch((e) => Alert.alert('Error', e.message)).finally(() => setCreating(false))
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Shipments</Text>
        <View style={{ width: 20 }} />
      </View>

      <View style={[styles.form, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.formTitle, { color: theme.foreground }]}>New shipment</Text>
        <TextInput
          style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]}
          placeholder="Commodity" placeholderTextColor={theme.mutedForeground}
          value={commodity} onChangeText={setCommodity}
        />
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]}
            placeholder="Weight (kg)" placeholderTextColor={theme.mutedForeground} keyboardType="numeric"
            value={weight} onChangeText={setWeight}
          />
          <TextInput
            style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]}
            placeholder="Value (₹)" placeholderTextColor={theme.mutedForeground} keyboardType="numeric"
            value={value} onChangeText={setValue}
          />
        </View>
        <Pressable style={[styles.createBtn, { backgroundColor: '#F97316' }]} onPress={create} disabled={creating}>
          <Text style={styles.createBtnText}>{creating ? 'Creating…' : '+ Create'}</Text>
        </Pressable>
      </View>

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>Loading…</Text>
      ) : (
        <FlatList
          data={shipments}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="No shipments yet" message="Create one above to get started" icon="📦" />}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.cardTitle, { color: theme.foreground }]}>{item.commodity ?? 'Untitled'}</Text>
                <Text style={[styles.chip, { color: theme.warning, borderColor: theme.warning }]}>{item.status}</Text>
              </View>
              <Text style={[styles.meta, { color: theme.mutedForeground }]}>
                {item.ref} · {item.weightKg ? `${item.weightKg} kg` : '—'} · {item.value ? `₹${item.value.toLocaleString('en-IN')}` : '—'}
              </Text>
              <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>{item.legs?.length ?? 0} legs · {item.mode}</Text>
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
  form: { margin: spacing.lg, borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  formTitle: { fontSize: 15, fontWeight: '800', marginBottom: spacing.xs },
  input: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, fontSize: 14 },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  createBtn: { borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.xs },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  chip: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2, textTransform: 'uppercase' },
  meta: { fontSize: 13 },
})
