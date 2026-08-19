import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, TextInput, FlatList, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'
import { Button, EmptyState } from '@wagon/components'
import { api } from '../config'
import { completeQuestWithXp } from '../gamification'
import { useI18n } from '@wagon/i18n'

interface DriverRow {
  id: string
  name: string
  mobile: string
  licenseVerified: boolean
  status: boolean
  payRate: number | null
}

interface Props {
  onBack: () => void
}

export function DriversScreen({ onBack }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [payRateInput, setPayRateInput] = useState<Record<string, string>>({})

  const fetch = useCallback(() => {
    api.get<{ drivers: DriverRow[] }>('/drivers').then((res) => setDrivers(res.drivers)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const add = async () => {
    if (!name.trim() || mobile.length !== 10) { Alert.alert(t('ui.required'), 'Enter name and 10-digit mobile'); return }
    setSubmitting(true)
    try {
      await api.post('/drivers', { name, mobile })
      completeQuestWithXp('driver', 40)
      Alert.alert(t('ui.added'), `${name} added · +40 XP`)
      setName(''); setMobile(''); setShowForm(false)
      fetch()
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed')
    } finally { setSubmitting(false) }
  }

  const remove = (id: string, driverName: string) => {
    Alert.alert(t('ui.removeDriver'), `Remove ${driverName}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await api.request('DELETE', `/drivers/${id}`).catch(() => {}); fetch() } },
    ])
  }

  const setPayRate = async (id: string) => {
    const raw = payRateInput[id]?.trim()
    const value = raw ? Number(raw) : null
    if (value != null && (!isFinite(value) || value < 0)) { Alert.alert(t('ui.error'), 'Enter a valid pay rate'); return }
    setSubmitting(true)
    try {
      await api.patch(`/drivers/${id}`, { payRate: value })
      setPayRateInput((r) => ({ ...r, [id]: '' }))
      fetch()
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed to update pay rate')
    } finally { setSubmitting(false) }
  }

  const viewPerformance = async (id: string) => {
    try {
      const res = await api.get<{ summary: { trips: number; delivered: number; cancelled: number; onTime: number; onTimeRate: number; earned: number } }>(`/drivers/${id}/performance`)
      const s = res.summary
      Alert.alert(
        'Driver performance',
        `Trips: ${s.trips}\nDelivered: ${s.delivered}\nCancelled: ${s.cancelled}\nOn-time: ${s.onTime} (${Math.round(s.onTimeRate * 100)}%)\n\nEarned: ₹${s.earned.toLocaleString()}`,
      )
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed to load performance')
    }
  }

  return (
    <KeyboardAvoidingView style={[styles.safe, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('drivers.title')}</Text>
        <Pressable onPress={() => setShowForm((s) => !s)}><Text style={{ color: theme.primary, fontWeight: '800', fontSize: 22 }}>{showForm ? '✕' : '+'}</Text></Pressable>
      </View>

      {showForm && (
        <View style={[styles.form, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={name} onChangeText={setName} placeholder={t('drivers.name')} placeholderTextColor={theme.mutedForeground + '88'} />
          <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={mobile} onChangeText={setMobile} placeholder={t('drivers.mobile')} placeholderTextColor={theme.mutedForeground + '88'} keyboardType="number-pad" maxLength={10} />
          <Button label={t('drivers.add')} onPress={add} loading={submitting} size="md" />
        </View>
      )}

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>{t('common.loading')}</Text>
      ) : (
        <FlatList
          data={drivers}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title={t('drivers.noDrivers')} message="Add drivers to assign them to your trucks" actionLabel={t('drivers.add')} onAction={() => setShowForm(true)} icon="👤" />}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.name, { color: theme.foreground }]}>{item.name}</Text>
                {item.licenseVerified && <Text style={{ color: theme.success, fontSize: 12, fontWeight: '700' }}>✓ License</Text>}
              </View>
              <Text style={[styles.mobile, { color: theme.mutedForeground }]}>{item.mobile}</Text>
              <View style={styles.payRow}>
                <Text style={[styles.payLabel, { color: theme.mutedForeground }]}>Pay / trip</Text>
                <TextInput
                  style={[styles.payInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]}
                  value={payRateInput[item.id] ?? ''}
                  onChangeText={(v) => setPayRateInput((r) => ({ ...r, [item.id]: v }))}
                  placeholder={item.payRate != null ? `₹${item.payRate}` : '25% of fare'}
                  placeholderTextColor={theme.mutedForeground + '88'}
                  keyboardType="numeric"
                />
                <Pressable onPress={() => setPayRate(item.id)} hitSlop={8} disabled={submitting}>
                  <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 13 }}>Save</Text>
                </Pressable>
              </View>
              <View style={styles.actions}>
                <Pressable onPress={() => viewPerformance(item.id)} hitSlop={8}>
                  <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '700' }}>View performance</Text>
                </Pressable>
                <Pressable onPress={() => remove(item.id, item.name)} hitSlop={8}>
                  <Text style={{ color: theme.danger, fontSize: 13 }}>{t('drivers.remove')}</Text>
                </Pressable>
              </View>
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
  payRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  payLabel: { fontSize: 13 },
  payInput: { flex: 1, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 6, fontSize: 14 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
})
