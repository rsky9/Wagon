import { useEffect, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme, spacing, radius, shadows } from '@wagon/design'
import { Button } from '@wagon/components'
import { api } from '../config'
import { completeQuestWithXp } from '../gamification'
import type { Material, TruckModel } from '@wagon/contracts'

interface Props {
  onBack: () => void
  onPosted: () => void
}

export function PostLoadScreen({ onBack, onPosted }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const [models, setModels] = useState<TruckModel[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [pickup, setPickup] = useState('')
  const [drop, setDrop] = useState('')
  const [date, setDate] = useState('')
  const [weight, setWeight] = useState('')
  const [distance, setDistance] = useState('')
  const [description, setDescription] = useState('')
  const [truckType, setTruckType] = useState<string>('container')
  const [modelId, setModelId] = useState<string>('')
  const [materialId, setMaterialId] = useState<string>('')

  useEffect(() => {
    api
      .get<{ models: TruckModel[]; materials: Material[] }>('/reference')
      .then((res) => {
        setModels(res.models)
        setMaterials(res.materials)
        setMaterialId(res.materials[0]?.id ?? '')
        setModelId(res.models.find((m) => m.type === 'container')?.id ?? res.models[0]?.id ?? '')
      })
      .catch(() => Alert.alert('Error', 'Could not load reference data'))
      .finally(() => setLoading(false))
  }, [])

  const submit = async () => {
    if (!pickup || !drop || !date || !weight || !distance) {
      Alert.alert('Missing fields', 'Please fill pickup, drop, date, weight and distance')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/loads', {
        pickupAddr: pickup,
        dropAddr: drop,
        pickupLat: 17.385,
        pickupLng: 78.487,
        dropLat: 16.506,
        dropLng: 80.648,
        date: new Date(date).toISOString(),
        truckType,
        modelId,
        weight: Number(weight),
        distanceKm: Number(distance),
        materialId,
        description,
        noOfTrucks: 1,
      })
      Alert.alert('Posted!', 'Your load is now visible to transporters · +60 XP', [{ text: 'View', onPress: onPosted }])
      completeQuestWithXp('load', 60)
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to post load')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    )
  }

  const typeModels = models.filter((m) => m.type === truckType)

  return (
    <KeyboardAvoidingView style={[styles.safe, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={[styles.back, { color: theme.mutedForeground }]}>←</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.foreground }]}>Post a load</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <SectionLabel text="Route" />
          <Input label="Pickup address" value={pickup} onChange={setPickup} placeholder="e.g. Ameerpet, Hyderabad" theme={theme} />
          <Input label="Drop address" value={drop} onChange={setDrop} placeholder="e.g. Vijayawada, AP" theme={theme} />
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <SectionLabel text="Cargo" />
          <View style={styles.twoCol}>
            <Input label="Weight (t)" value={weight} onChange={setWeight} placeholder="e.g. 35" keyboard="decimal-pad" theme={theme} half />
            <Input label="Distance (km)" value={distance} onChange={setDistance} placeholder="e.g. 250" keyboard="decimal-pad" theme={theme} half />
          </View>
          <Input label="Pickup date" value={date} onChange={setDate} placeholder="YYYY-MM-DD" theme={theme} />
          <Input label="Description (optional)" value={description} onChange={setDescription} placeholder="What are you shipping?" multiline theme={theme} />
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <SectionLabel text="Truck type" />
          <View style={styles.chips}>
            {(['open', 'container', 'trailer'] as const).map((t) => (
              <Chip key={t} label={t} active={truckType === t} onPress={() => setTruckType(t)} theme={theme} />
            ))}
          </View>

          <SectionLabel text="Truck model" />
          <View style={styles.chips}>
            {typeModels.map((m) => (
              <Chip key={m.id} label={m.model} active={modelId === m.id} onPress={() => setModelId(m.id)} theme={theme} />
            ))}
          </View>

          <SectionLabel text="Material" />
          <View style={styles.chips}>
            {materials.map((m) => (
              <Chip key={m.id} label={m.name} active={materialId === m.id} onPress={() => setMaterialId(m.id)} theme={theme} />
            ))}
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.actionBar,
          { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, spacing.xl) },
          shadows.md,
        ]}
      >
        <Button label="Post Load" onPress={submit} loading={submitting} />
      </View>
    </KeyboardAvoidingView>
  )
}

function SectionLabel({ text }: { text: string }) {
  const theme = useTheme()
  return <Text style={[styles.sectionLabel, { color: theme.mutedForeground }]}>{text}</Text>
}

function Input({
  label, value, onChange, placeholder, keyboard, multiline, half, theme,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  keyboard?: 'default' | 'decimal-pad'
  multiline?: boolean
  half?: boolean
  theme: ReturnType<typeof useTheme>
}) {
  return (
    <View style={[half && styles.half]}>
      <Text style={[styles.inputLabel, { color: theme.mutedForeground }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground },
          multiline && styles.multiline,
        ]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.mutedForeground + '88'}
        keyboardType={keyboard}
        multiline={multiline}
      />
    </View>
  )
}

function Chip({ label, active, onPress, theme }: { label: string; active: boolean; onPress: () => void; theme: ReturnType<typeof useTheme> }) {
  return (
    <Pressable
      style={[
        styles.chip,
        { backgroundColor: active ? theme.primary : theme.background, borderColor: active ? theme.primary : theme.border },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, { color: active ? '#fff' : theme.mutedForeground }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  back: { fontSize: 20, fontWeight: '600', width: 30 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  body: { padding: spacing.lg, paddingBottom: 120, gap: spacing.md },
  card: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  sectionLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.xs },
  twoCol: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  inputLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    marginBottom: spacing.sm,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chip: {
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: 140,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
  },
})
