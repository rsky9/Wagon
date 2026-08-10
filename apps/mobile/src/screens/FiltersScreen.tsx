import { SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, ScrollView, Pressable } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'
import { Button } from '@wagon/components'
import { api } from '../config'
import type { Material, TruckModel } from '@wagon/contracts'

export interface LoadFilters {
  truckType?: string
  modelId?: string
  materialId?: string
  minWeight?: number
  maxWeight?: number
}

interface Props {
  initial?: LoadFilters
  onApply: (filters: LoadFilters) => void
  onClose: () => void
}

const TYPES = ['open', 'container', 'trailer'] as const

export function FiltersScreen({ initial, onApply, onClose }: Props) {
  const theme = useTheme()
  const [models, setModels] = useState<TruckModel[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [truckType, setTruckType] = useState<string | undefined>(initial?.truckType)
  const [modelId, setModelId] = useState<string | undefined>(initial?.modelId)
  const [materialId, setMaterialId] = useState<string | undefined>(initial?.materialId)
  const [minWeight, setMinWeight] = useState<number | undefined>(initial?.minWeight)
  const [maxWeight, setMaxWeight] = useState<number | undefined>(initial?.maxWeight)

  useEffect(() => {
    api.get<{ models: TruckModel[]; materials: Material[] }>('/reference').then((res) => {
      setModels(res.models)
      setMaterials(res.materials)
    }).catch(() => {})
  }, [])

  const typeModels = truckType ? models.filter((m) => m.type === truckType) : models

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.title, { color: theme.foreground }]}>Filters</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Text style={{ color: theme.mutedForeground, fontSize: 16 }}>✕</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Section label="Truck type">
          <View style={styles.chips}>
            {TYPES.map((t) => (
              <Chip key={t} label={t} active={truckType === t} onPress={() => { setTruckType(truckType === t ? undefined : t); setModelId(undefined) }} theme={theme} />
            ))}
          </View>
        </Section>

        {typeModels.length > 0 && (
          <Section label="Truck model">
            <View style={styles.chips}>
              {typeModels.map((m) => (
                <Chip key={m.id} label={m.model} active={modelId === m.id} onPress={() => setModelId(modelId === m.id ? undefined : m.id)} theme={theme} />
              ))}
            </View>
          </Section>
        )}

        <Section label="Material">
          <View style={styles.chips}>
            {materials.map((m) => (
              <Chip key={m.id} label={m.name} active={materialId === m.id} onPress={() => setMaterialId(materialId === m.id ? undefined : m.id)} theme={theme} />
            ))}
          </View>
        </Section>

        <Section label="Weight (tonnes)">
          <View style={styles.weightRow}>
            <WeightBtn label="Any" active={minWeight === undefined} onPress={() => { setMinWeight(undefined); setMaxWeight(undefined) }} theme={theme} />
            <WeightBtn label="< 20" active={minWeight === undefined && maxWeight === 20} onPress={() => { setMinWeight(undefined); setMaxWeight(20) }} theme={theme} />
            <WeightBtn label="20–35" active={minWeight === 20 && maxWeight === 35} onPress={() => { setMinWeight(20); setMaxWeight(35) }} theme={theme} />
            <WeightBtn label="> 35" active={minWeight === 35 && maxWeight === undefined} onPress={() => { setMinWeight(35); setMaxWeight(undefined) }} theme={theme} />
          </View>
        </Section>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <Button label="Apply filters" onPress={() => onApply({ truckType, modelId, materialId, minWeight, maxWeight })} />
      </View>
    </SafeAreaView>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme()
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: theme.mutedForeground }]}>{label}</Text>
      {children}
    </View>
  )
}

function Chip({ label, active, onPress, theme }: { label: string; active: boolean; onPress: () => void; theme: ReturnType<typeof useTheme> }) {
  return (
    <Pressable style={[styles.chip, { backgroundColor: active ? theme.primary : theme.card, borderColor: active ? theme.primary : theme.border }]} onPress={onPress}>
      <Text style={[styles.chipText, { color: active ? '#fff' : theme.mutedForeground }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  )
}

function WeightBtn({ label, active, onPress, theme }: { label: string; active: boolean; onPress: () => void; theme: ReturnType<typeof useTheme> }) {
  return (
    <Pressable style={[styles.weightBtn, { backgroundColor: active ? theme.primary : theme.card, borderColor: active ? theme.primary : theme.border }]} onPress={onPress}>
      <Text style={[styles.chipText, { color: active ? '#fff' : theme.mutedForeground }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  body: { padding: spacing.lg },
  section: { marginBottom: spacing.xl },
  sectionLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderRadius: radius.full, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, maxWidth: 150 },
  chipText: { fontSize: 13, fontWeight: '600' },
  weightRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  weightBtn: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  footer: { padding: spacing.lg, paddingBottom: 30, borderTopWidth: 1 },
})
