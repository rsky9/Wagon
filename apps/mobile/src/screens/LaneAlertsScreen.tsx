import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert, TextInput, KeyboardAvoidingView, Platform } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'
import { Button, EmptyState } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'

interface LaneAlert {
  id: string
  fromLane: string
  truckType?: string | null
  isActive: boolean
}

interface Props {
  onBack: () => void
}

const TYPES = ['open', 'container', 'trailer']

export function LaneAlertsScreen({ onBack }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [alerts, setAlerts] = useState<LaneAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [lane, setLane] = useState('')
  const [type, setType] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetch = useCallback(() => {
    api.get<{ alerts: LaneAlert[] }>('/alerts/mine').then((r) => setAlerts(r.alerts)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const add = async () => {
    if (!lane.trim()) { Alert.alert(t('ui.required'), 'Enter an origin lane (e.g. Mumbai)'); return }
    setSubmitting(true)
    try {
      await api.post('/alerts', { fromLane: lane, truckType: type || undefined })
      setLane(''); setType(''); setShowForm(false)
      fetch()
    } catch (e) { Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed') }
    finally { setSubmitting(false) }
  }

  const toggle = async (id: string, active: boolean) => {
    await api.patch(`/alerts/${id}/toggle`).catch(() => {})
    fetch()
  }

  const remove = (id: string) => {
    Alert.alert('Remove lane alert', 'Stop alerts for this lane?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await api.request('DELETE', `/alerts/${id}`).catch(() => {}); fetch() } },
    ])
  }

  return (
    <KeyboardAvoidingView style={[styles.safe, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Lane alerts</Text>
        <Pressable onPress={() => setShowForm((s) => !s)}><Text style={{ color: theme.primary, fontWeight: '800', fontSize: 22 }}>{showForm ? '✕' : '+'}</Text></Pressable>
      </View>

      <Text style={[styles.subtitle, { color: theme.mutedForeground }]}>Get notified when a load matching a lane you care about is posted.</Text>

      {showForm && (
        <View style={[styles.form, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={lane} onChangeText={setLane} placeholder="Origin lane (e.g. Mumbai)" placeholderTextColor={theme.mutedForeground + '88'} />
          <View style={styles.chips}>
            {TYPES.map((ty) => (
              <Pressable key={ty} onPress={() => setType(type === ty ? '' : ty)} style={[styles.chip, { borderColor: type === ty ? theme.primary : theme.border, backgroundColor: type === ty ? theme.primary + '22' : 'transparent' }]}>
                <Text style={{ color: type === ty ? theme.primary : theme.mutedForeground, fontWeight: '700', textTransform: 'capitalize' }}>{ty}</Text>
              </Pressable>
            ))}
          </View>
          <Button label="Save lane alert" onPress={add} loading={submitting} size="md" />
        </View>
      )}

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>{t('common.loading')}</Text>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(a) => a.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="No lane alerts" message="Add lanes you run to get notified on new matching loads" actionLabel="Add lane" onAction={() => setShowForm(true)} icon="🛣️" />}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.lane, { color: theme.foreground }]}>📍 {item.fromLane}</Text>
                <Text style={{ color: item.isActive ? theme.success : theme.mutedForeground, fontSize: 12, fontWeight: '700' }}>{item.isActive ? '● Active' : '○ Paused'}</Text>
              </View>
              <View style={styles.actions}>
                {item.truckType && <Text style={{ color: theme.mutedForeground, fontSize: 12, textTransform: 'capitalize' }}>{item.truckType}</Text>}
                <View style={{ flexDirection: 'row', gap: spacing.lg }}>
                  <Pressable onPress={() => toggle(item.id, item.isActive)} hitSlop={8}>
                    <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '700' }}>{item.isActive ? 'Pause' : 'Activate'}</Text>
                  </Pressable>
                  <Pressable onPress={() => remove(item.id)} hitSlop={8}>
                    <Text style={{ color: theme.danger, fontSize: 13 }}>Remove</Text>
                  </Pressable>
                </View>
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
  subtitle: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, fontSize: 13 },
  form: { marginHorizontal: spacing.lg, marginTop: spacing.md, borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  input: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderRadius: radius.full, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lane: { fontSize: 16, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
})
