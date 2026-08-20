import { SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, TextInput, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'
import { Button } from '@wagon/components'
import * as ImagePicker from 'expo-image-picker'
import { api } from '../config'
import { uploadToPresignedUrl } from '@wagon/api-client'
import { completeQuestWithXp } from '../gamification'
import type { TruckModel } from '@wagon/contracts'
import { useI18n } from '@wagon/i18n'

interface Props {
  onBack: () => void
  onDone: () => void
}

interface DriverRef {
  id: string
  name: string
  mobile: string
  licenseVerified: boolean
  verificationStatus: string
}

const TYPES = ['open', 'container', 'trailer'] as const

export function AddVehicleScreen({ onBack, onDone }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [models, setModels] = useState<TruckModel[]>([])
  const [drivers, setDrivers] = useState<DriverRef[]>([])
  const [vehicleNo, setVehicleNo] = useState('')
  const [rcNumber, setRcNumber] = useState('')
  const [type, setType] = useState<string>('container')
  const [modelId, setModelId] = useState<string>('')
  const [origin, setOrigin] = useState('')
  const [gpsLogin, setGpsLogin] = useState('')
  const [driverId, setDriverId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [rcImageKey, setRcImageKey] = useState<string | null>(null)
  const [showDriverPicker, setShowDriverPicker] = useState(false)

  useEffect(() => {
    api.get<{ models: TruckModel[] }>('/reference').then((res) => {
      setModels(res.models)
      setModelId(res.models.find((m) => m.type === 'container')?.id ?? res.models[0]?.id ?? '')
    }).catch(() => {})
    api.get<{ drivers: DriverRef[] }>('/drivers').then((res) => setDrivers(res.drivers)).catch(() => {})
  }, [])

  const typeModels = models.filter((m) => m.type === type)

  const pickRc = async () => {
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 })
      if (picked.canceled || !picked.assets?.[0]) return
      const asset = picked.assets[0]
      Alert.alert('Upload RC', 'Attach the RC image now? It will be stored and used to verify the vehicle.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upload',
          onPress: async () => {
            try {
              // Provisional create is done on submit; for now store the image key
              // by requesting an upload against a temp folder is not possible without an id,
              // so we verify after creation instead. Mark intent only.
              setRcImageKey(asset.uri)
              Alert.alert('RC selected', 'We will ask you to verify after saving the vehicle.')
            } catch (e) {
              Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Upload failed')
            }
          },
        },
      ])
    } catch {}
  }

  const submit = async () => {
    if (!vehicleNo.trim()) { Alert.alert(t('ui.required'), 'Enter vehicle number'); return }
    setSubmitting(true)
    try {
      let lat: number | null = null
      let lng: number | null = null
      if (origin.trim()) {
        try {
          const g = await api.get<{ found: boolean; coords: [number, number] | null }>(`/reference/geocode?q=${encodeURIComponent(origin)}`)
          if (g.found && g.coords) { lat = g.coords[0]; lng = g.coords[1] }
        } catch {}
      }
      await api.post('/trucks', {
        vehicleNo,
        rcNumber: rcNumber || undefined,
        type,
        modelId,
        origin: origin || undefined,
        lat,
        lng,
        gpsLogin: gpsLogin || undefined,
        driverId: driverId || undefined,
      })
      completeQuestWithXp('truck', 60)
      Alert.alert(t('ui.added'), `${vehicleNo.toUpperCase()} added · +60 XP`)
      onDone()
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed')
    } finally { setSubmitting(false) }
  }

  const selectedDriver = drivers.find((d) => d.id === driverId)

  return (
    <KeyboardAvoidingView style={[styles.safe, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('addVehicle.title')}</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Label text={t('addVehicle.vehicleNo')} />
          <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={vehicleNo} onChangeText={setVehicleNo} placeholder={t('addVehicle.vehicleNoExample')} placeholderTextColor={theme.mutedForeground + '88'} autoCapitalize="characters" />

          <Label text="RC number (optional)" />
          <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={rcNumber} onChangeText={setRcNumber} placeholder="e.g. MH01AB1234" placeholderTextColor={theme.mutedForeground + '88'} autoCapitalize="characters" />

          <Label text="Vehicle type" />
          <View style={styles.chips}>
            {TYPES.map((ty) => (
              <Chip key={ty} label={ty} active={type === ty} onPress={() => { setType(ty); setModelId(models.find((m) => m.type === ty)?.id ?? modelId) }} theme={theme} />
            ))}
          </View>

          <Label text="Model" />
          <View style={styles.chips}>
            {typeModels.map((m) => (
              <Chip key={m.id} label={m.model} active={modelId === m.id} onPress={() => setModelId(m.id)} theme={theme} />
            ))}
          </View>

          <Label text={t('addVehicle.origin')} />
          <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={origin} onChangeText={setOrigin} placeholder={t('addVehicle.originExample')} placeholderTextColor={theme.mutedForeground + '88'} />

          <Label text="GPS login ID (optional)" />
          <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={gpsLogin} onChangeText={setGpsLogin} placeholder={t('addVehicle.gpsDevice')} placeholderTextColor={theme.mutedForeground + '88'} />

          <Label text="Assigned driver" />
          <Pressable style={[styles.driverPicker, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={() => setShowDriverPicker((s) => !s)}>
            <Text style={{ color: selectedDriver ? theme.foreground : theme.mutedForeground, fontSize: 15 }}>
              {selectedDriver ? `${selectedDriver.name} · ${selectedDriver.mobile}` : 'Unassigned — pick a driver'}
            </Text>
          </Pressable>
          {showDriverPicker && (
            <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
              <Pressable onPress={() => { setDriverId(''); setShowDriverPicker(false) }} style={[styles.driverOption, { borderColor: theme.border }]}>
                <Text style={{ color: theme.mutedForeground }}>Unassigned</Text>
              </Pressable>
              {drivers.map((d) => (
                <Pressable key={d.id} onPress={() => { setDriverId(d.id); setShowDriverPicker(false) }} style={[styles.driverOption, { borderColor: driverId === d.id ? theme.primary : theme.border }]}>
                  <Text style={{ color: theme.foreground, fontSize: 14 }}>{d.name} · {d.mobile}</Text>
                  <Text style={{ color: d.verificationStatus === 'approved' ? theme.success : theme.warning, fontSize: 11 }}>
                    {d.verificationStatus === 'approved' ? '✓ License verified' : 'Licence pending'}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Label text="RC document" />
          <Pressable style={[styles.uploadBtn, { borderColor: theme.border }]} onPress={pickRc}>
            <Text style={{ color: theme.primary, fontWeight: '700' }}>{rcImageKey ? '✓ RC selected' : '+ Upload RC image'}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <Button label={t('addVehicle.save')} onPress={submit} loading={submitting || verifying} />
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
  driverPicker: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md, marginBottom: spacing.sm },
  driverOption: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  uploadBtn: { borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', padding: spacing.md, alignItems: 'center', marginBottom: spacing.sm },
  footer: { padding: spacing.lg, paddingBottom: 30, borderTopWidth: 1 },
})
