import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, TextInput, FlatList, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'
import { Button, EmptyState } from '@wagon/components'
import { api } from '../config'
import { completeQuestWithXp } from '../gamification'

interface DriverRow {
  id: string
  name: string
  mobile: string
  licenseVerified: boolean
  status: boolean
}

interface Props {
  onBack: () => void
}

export function DriversScreen({ onBack }: Props) {
  const theme = useTheme()
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetch = useCallback(() => {
    api.get<{ drivers: DriverRow[] }>('/drivers').then((res) => setDrivers(res.drivers)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const add = async () => {
    if (!name.trim() || mobile.length !== 10) { Alert.alert('Required', 'Enter name and 10-digit mobile'); return }
    setSubmitting(true)
    try {
      await api.post('/drivers', { name, mobile })
      completeQuestWithXp('driver', 40)
      Alert.alert('Added', `${name} added · +40 XP`)
      setName(''); setMobile(''); setShowForm(false)
      fetch()
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed')
    } finally { setSubmitting(false) }
  }

  const remove = (id: string, driverName: string) => {
    Alert.alert('Remove driver', `Remove ${driverName}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await api.request('DELETE', `/drivers/${id}`).catch(() => {}); fetch() } },
    ])
  }

  return (
    <KeyboardAvoidingView style={[styles.safe, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Drivers</Text>
        <Pressable onPress={() => setShowForm((s) => !s)}><Text style={{ color: theme.primary, fontWeight: '800', fontSize: 22 }}>{showForm ? '✕' : '+'}</Text></Pressable>
      </View>

      {showForm && (
        <View style={[styles.form, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={name} onChangeText={setName} placeholder="Driver name" placeholderTextColor={theme.mutedForeground + '88'} />
          <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={mobile} onChangeText={setMobile} placeholder="10-digit mobile" placeholderTextColor={theme.mutedForeground + '88'} keyboardType="number-pad" maxLength={10} />
          <Button label="Add driver" onPress={add} loading={submitting} size="md" />
        </View>
      )}

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>Loading…</Text>
      ) : (
        <FlatList
          data={drivers}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="No drivers yet" message="Add drivers to assign them to your trucks" actionLabel="Add driver" onAction={() => setShowForm(true)} icon="👤" />}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.name, { color: theme.foreground }]}>{item.name}</Text>
                {item.licenseVerified && <Text style={{ color: theme.success, fontSize: 12, fontWeight: '700' }}>✓ License</Text>}
              </View>
              <Text style={[styles.mobile, { color: theme.mutedForeground }]}>{item.mobile}</Text>
              <Pressable onPress={() => remove(item.id, item.name)} hitSlop={8} style={{ alignSelf: 'flex-end' }}>
                <Text style={{ color: theme.danger, fontSize: 13 }}>Remove</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  form: { margin: spacing.lg, borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  input: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 16 },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: 2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 17, fontWeight: '700' },
  mobile: { fontSize: 14 },
})
