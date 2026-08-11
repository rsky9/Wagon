import { SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, TextInput, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'
import { Button } from '@wagon/components'
import { api } from '../config'
import { completeQuestWithXp } from '../gamification'
import type { TruckModel } from '@wagon/contracts'
import { useI18n } from '@wagon/i18n'

interface Props {
  onBack: () => void
  onDone: () => void
}

const TYPES = ['open', 'container', 'trailer'] as const

export function AddTruckScreen({ onBack, onDone }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [models, setModels] = useState<TruckModel[]>([])
  const [truckNo, setTruckNo] = useState('')
  const [type, setType] = useState<string>('container')
  const [modelId, setModelId] = useState<string>('')
  const [origin, setOrigin] = useState('')
  const [gpsLogin, setGpsLogin] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.get<{ models: TruckModel[] }>('/reference').then((res) => {
      setModels(res.models)
      setModelId(res.models.find((m) => m.type === 'container')?.id ?? res.models[0]?.id ?? '')
    }).catch(() => {})
  }, [])

  const typeModels = models.filter((m) => m.type === type)

  const submit = async () => {
    if (!truckNo.trim()) { Alert.alert('Required', 'Enter truck number'); return }
    setSubmitting(true)
    try {
      await api.post('/trucks', { truckNo, type, modelId, origin: origin || undefined, gpsLogin: gpsLogin || undefined })
      completeQuestWithXp('truck', 60)
      Alert.alert('Added', `${truckNo.toUpperCase()} added · +60 XP`)
      onDone()
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed')
    } finally { setSubmitting(false) }
  }

  return (
    <KeyboardAvoidingView style={[styles.safe, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('addTruck.title')}</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Label text={t('addTruck.truckNo')} />
          <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={truckNo} onChangeText={setTruckNo} placeholder={t('addTruck.truckNoExample')} placeholderTextColor={theme.mutedForeground + '88'} autoCapitalize="characters" />

          <Label text="Truck type" />
          <View style={styles.chips}>
            {TYPES.map((t) => (
              <Chip key={t} label={t} active={type === t} onPress={() => { setType(t); setModelId(models.find((m) => m.type === t)?.id ?? modelId) }} theme={theme} />
            ))}
          </View>

          <Label text="Model" />
          <View style={styles.chips}>
            {typeModels.map((m) => (
              <Chip key={m.id} label={m.model} active={modelId === m.id} onPress={() => setModelId(m.id)} theme={theme} />
            ))}
          </View>

          <Label text={t('addTruck.origin')} />
          <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={origin} onChangeText={setOrigin} placeholder={t('addTruck.originExample')} placeholderTextColor={theme.mutedForeground + '88'} />

          <Label text="GPS login ID (optional)" />
          <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={gpsLogin} onChangeText={setGpsLogin} placeholder={t('addTruck.gpsDevice')} placeholderTextColor={theme.mutedForeground + '88'} />
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <Button label={t('addTruck.save')} onPress={submit} loading={submitting} />
      </View>
    </KeyboardAvoidingView>
  )
}

function Label({ text }: { text: string }) {
  const theme = useTheme()
  return <Text style={[styles.label, { color: theme.mutedForeground }]}>{text}</Text>
}

function Chip({ label, active, onPress, theme }: { label: string; active: boolean; onPress: () => void; theme: ReturnType<typeof useTheme> }) {
  return (
    <Pressable style={[styles.chip, { backgroundColor: active ? theme.primary : theme.background, borderColor: active ? theme.primary : theme.border }]} onPress={onPress}>
      <Text style={{ color: active ? '#fff' : theme.mutedForeground, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  body: { padding: spacing.lg },
  card: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: 6 },
  label: { fontSize: 13, fontWeight: '600', marginTop: spacing.sm },
  input: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 16, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: { borderRadius: radius.full, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  footer: { padding: spacing.lg, paddingBottom: 30, borderTopWidth: 1 },
})
