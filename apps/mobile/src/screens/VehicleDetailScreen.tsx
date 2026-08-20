import { SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, ScrollView, Pressable, TextInput, Alert, Switch, KeyboardAvoidingView, Platform } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'
import { Button, StatusChip, type StatusTone } from '@wagon/components'
import * as ImagePicker from 'expo-image-picker'
import { api } from '../config'
import { uploadToPresignedUrl } from '@wagon/api-client'
import { useI18n } from '@wagon/i18n'

interface VehicleDetail {
  id: string
  vehicleNo: string
  rcNumber?: string | null
  type: string
  origin?: string
  activeStatus: boolean
  verificationStatus: string
  verificationSource: string
  rcVerified: boolean
  driver?: { id: string; name: string; mobile: string } | null
  insuranceUpto?: string | null
  permitUpto?: string | null
  fitnessUpto?: string | null
  pollutionUpto?: string | null
  odometerKm?: number | null
  nextServiceKm?: number | null
}

interface DriverRef {
  id: string
  name: string
  mobile: string
  verificationStatus: string
  licenseVerified: boolean
}

interface Props {
  vehicleId: string
  onBack: () => void
}

const VERIFY_TONE: Record<string, StatusTone> = { approved: 'success', pending: 'warning', rejected: 'danger', not_started: 'neutral' }

export function VehicleDetailScreen({ vehicleId, onBack }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null)
  const [drivers, setDrivers] = useState<DriverRef[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState(true)
  const [insurance, setInsurance] = useState('')
  const [permit, setPermit] = useState('')
  const [fitness, setFitness] = useState('')
  const [pollution, setPollution] = useState('')
  const [odometer, setOdometer] = useState('')
  const [maintenance, setMaintenance] = useState<Array<{ id: string; kind: string; title: string; cost?: number | null; odometerKm?: number | null; performedAt: string }>>([])
  const [showMaint, setShowMaint] = useState(false)
  const [mTitle, setMTitle] = useState('')
  const [mKind, setMKind] = useState('service')
  const [mCost, setMCost] = useState('')
  const [mNextKm, setMNextKm] = useState('')
  const [showDriverPicker, setShowDriverPicker] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const fetch = () => {
    api.get<{ vehicle: VehicleDetail }>(`/trucks/${vehicleId}`).then((res) => {
      const v = res.vehicle
      setVehicle(v)
      setActive(v.activeStatus)
      setInsurance(v.insuranceUpto?.slice(0, 10) ?? '')
      setPermit(v.permitUpto?.slice(0, 10) ?? '')
      setFitness(v.fitnessUpto?.slice(0, 10) ?? '')
      setPollution(v.pollutionUpto?.slice(0, 10) ?? '')
      setOdometer(v.odometerKm ? String(v.odometerKm) : '')
    }).catch(() => {}).finally(() => setLoading(false))
    api.get<{ maintenance: Array<{ id: string; kind: string; title: string; cost?: number | null; odometerKm?: number | null; performedAt: string }> }>(`/trucks/${vehicleId}/maintenance`)
      .then((r) => setMaintenance(r.maintenance)).catch(() => {})
    api.get<{ drivers: DriverRef[] }>('/drivers').then((res) => setDrivers(res.drivers)).catch(() => {})
  }

  useEffect(() => { fetch() }, [vehicleId])

  const inputStyle = {
    backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground,
    borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 15,
  }

  const save = async () => {
    try {
      await api.patch(`/trucks/${vehicleId}`, {
        activeStatus: active,
        insuranceUpto: insurance ? `${insurance}T00:00:00Z` : undefined,
        permitUpto: permit ? `${permit}T00:00:00Z` : undefined,
        fitnessUpto: fitness ? `${fitness}T00:00:00Z` : undefined,
        pollutionUpto: pollution ? `${pollution}T00:00:00Z` : undefined,
        odometerKm: odometer ? Number(odometer) : undefined,
      })
      Alert.alert(t('ui.saved'), `${vehicle?.vehicleNo} updated`)
      fetch()
    } catch (e) { Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed') }
  }

  const assignDriver = async (driverId: string | null) => {
    try {
      await api.patch(`/trucks/${vehicleId}/assign-driver`, { driverId })
      Alert.alert(t('ui.saved'), driverId ? 'Driver assigned' : 'Driver unassigned')
      setShowDriverPicker(false)
      fetch()
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Assign failed')
    }
  }

  const verifyVehicle = async () => {
    if (verifying) return
    setVerifying(true)
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 })
      if (picked.canceled || !picked.assets?.[0]) { setVerifying(false); return }
      const asset = picked.assets[0]
      const presigned = await api.post<{ uploadUrl: string; key: string }>(`/trucks/${vehicleId}/upload`, {
        mimeType: asset.mimeType ?? 'image/jpeg',
        size: asset.fileSize ?? 0,
      })
      await uploadToPresignedUrl(presigned.uploadUrl, {
        uri: asset.uri,
        name: `rc-${vehicleId}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      })
      const res = await api.post<{ vehicle: VehicleDetail; verification: { source: string; verified: boolean } }>(`/trucks/${vehicleId}/verify`, {
        rcNumber: vehicle?.rcNumber ?? vehicle?.vehicleNo,
        imageKey: presigned.key,
      })
      Alert.alert('Verified', `Vehicle verified via ${res.verification.source} · RC ${res.verification.verified ? 'confirmed' : 'pending'}`)
      fetch()
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Verification failed')
    } finally { setVerifying(false) }
  }

  const logMaintenance = async () => {
    if (!mTitle.trim()) { Alert.alert(t('ui.required'), 'Enter a maintenance title'); return }
    try {
      await api.post(`/trucks/${vehicleId}/maintenance`, {
        kind: mKind,
        title: mTitle,
        cost: mCost ? Number(mCost) : undefined,
        odometerKm: odometer ? Number(odometer) : undefined,
        nextServiceKm: mNextKm ? Number(mNextKm) : undefined,
      })
      Alert.alert(t('ui.saved'), 'Maintenance logged')
      setMTitle(''); setMCost(''); setMNextKm(''); setShowMaint(false)
      fetch()
    } catch (e) { Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed to log maintenance') }
  }

  if (loading) {
    return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}><View style={styles.center}><Text style={{ color: theme.mutedForeground }}>{t('common.loading')}</Text></View></SafeAreaView>
  }

  if (!vehicle) {
    return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}><Header onBack={onBack} theme={theme} /><View style={styles.center}><Text style={{ color: theme.mutedForeground }}>{t('vehicleDetail.notFound')}</Text></View></SafeAreaView>
  }

  const selectedDriver = drivers.find((d) => d.id === vehicle.driver?.id)

  return (
    <KeyboardAvoidingView style={[styles.safe, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Header onBack={onBack} theme={theme} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <Text style={[styles.vehicleNo, { color: theme.foreground }]}>{vehicle.vehicleNo}</Text>
          <StatusChip label={active ? 'Active' : 'Inactive'} tone={active ? 'success' : 'neutral'} />
        </View>
        <Text style={[styles.meta, { color: theme.mutedForeground }]}>{vehicle.type} · {vehicle.origin ?? '—'} · {vehicle.rcNumber ?? 'No RC on file'}</Text>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.switchRow}>
            <Text style={[styles.label, { color: theme.foreground }]}>{t('vehicleDetail.availability')}</Text>
            <Switch value={active} onValueChange={setActive} trackColor={{ true: theme.primary, false: theme.border }} thumbColor="#fff" />
          </View>
        </View>

        <Text style={[styles.section, { color: theme.mutedForeground }]}>Verification</Text>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.verifyRow}>
            <StatusChip label={`Verify: ${vehicle.verificationStatus.replace('_', ' ')}`} tone={VERIFY_TONE[vehicle.verificationStatus] ?? 'neutral'} />
            <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>via {vehicle.verificationSource}</Text>
          </View>
          <Text style={{ color: theme.mutedForeground, fontSize: 13, marginTop: spacing.xs }}>
            {vehicle.rcVerified ? 'RC confirmed.' : 'Attach the RC image to verify registration (Vahan / ULIP / upload).'}
          </Text>
          <Pressable style={[styles.verifyBtn, { borderColor: theme.primary }]} onPress={verifyVehicle} disabled={verifying}>
            <Text style={{ color: theme.primary, fontWeight: '700' }}>{verifying ? 'Verifying…' : vehicle.rcVerified ? 'Re-verify RC' : '+ Upload RC & verify'}</Text>
          </Pressable>
        </View>

        <Text style={[styles.section, { color: theme.mutedForeground }]}>Assigned driver</Text>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Pressable style={[styles.driverPicker, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={() => setShowDriverPicker((s) => !s)}>
            <Text style={{ color: selectedDriver ? theme.foreground : theme.mutedForeground, fontSize: 15 }}>
              {selectedDriver ? `${selectedDriver.name} · ${selectedDriver.mobile}` : vehicle.driver?.name ?? 'Unassigned — pick a driver'}
            </Text>
          </Pressable>
          {showDriverPicker && (
            <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
              <Pressable onPress={() => assignDriver(null)} style={[styles.driverOption, { borderColor: theme.border }]}>
                <Text style={{ color: theme.mutedForeground }}>Unassign driver</Text>
              </Pressable>
              {drivers.map((d) => (
                <Pressable key={d.id} onPress={() => assignDriver(d.id)} style={[styles.driverOption, { borderColor: d.id === vehicle.driver?.id ? theme.primary : theme.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.foreground, fontSize: 14 }}>{d.name} · {d.mobile}</Text>
                    <Text style={{ color: d.verificationStatus === 'approved' ? theme.success : theme.warning, fontSize: 11 }}>
                      {d.verificationStatus === 'approved' ? '✓ License verified' : 'Licence pending'}
                    </Text>
                  </View>
                  {d.id === vehicle.driver?.id && <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 12 }}>CURRENT</Text>}
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <Text style={[styles.section, { color: theme.mutedForeground }]}>{t('vehicleDetail.documents')}</Text>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Field label={t('vehicleDetail.insuranceExpiry')}><TextInput style={inputStyle} value={insurance} onChangeText={setInsurance} placeholder="2026-08-19" placeholderTextColor={theme.mutedForeground + '88'} /></Field>
          <Field label={t('vehicleDetail.permitExpiry')}><TextInput style={inputStyle} value={permit} onChangeText={setPermit} placeholder="2026-08-19" placeholderTextColor={theme.mutedForeground + '88'} /></Field>
          <Field label={t('vehicleDetail.fitnessExpiry')}><TextInput style={inputStyle} value={fitness} onChangeText={setFitness} placeholder="2026-08-19" placeholderTextColor={theme.mutedForeground + '88'} /></Field>
          <Field label={t('vehicleDetail.pollutionExpiry')}><TextInput style={inputStyle} value={pollution} onChangeText={setPollution} placeholder="2026-08-19" placeholderTextColor={theme.mutedForeground + '88'} /></Field>
        </View>

        <Text style={[styles.section, { color: theme.mutedForeground }]}>{t('vehicleDetail.maintenance')}</Text>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Field label={t('vehicleDetail.odometer')}><TextInput style={inputStyle} value={odometer} onChangeText={setOdometer} placeholder={t('vehicleDetail.odometerExample')} keyboardType="number-pad" placeholderTextColor={theme.mutedForeground + '88'} /></Field>
          {vehicle.nextServiceKm != null && (
            <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>Next service at {vehicle.nextServiceKm} km</Text>
          )}
          <Pressable onPress={() => setShowMaint((s) => !s)} style={{ marginTop: spacing.sm }}>
            <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '700' }}>{showMaint ? 'Cancel' : '+ Log maintenance'}</Text>
          </Pressable>
          {showMaint && (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {(['service', 'repair', 'inspection', 'tyre'] as string[]).map((k) => (
                  <Pressable key={k} onPress={() => setMKind(k)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: mKind === k ? theme.primary : theme.border, backgroundColor: mKind === k ? theme.primary + '22' : 'transparent' }}>
                    <Text style={{ color: mKind === k ? theme.primary : theme.mutedForeground, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' }}>{k}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput style={inputStyle} value={mTitle} onChangeText={setMTitle} placeholder="Title (e.g. Oil change)" placeholderTextColor={theme.mutedForeground + '88'} />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}><TextInput style={inputStyle} value={mCost} onChangeText={setMCost} placeholder="Cost (₹)" keyboardType="number-pad" placeholderTextColor={theme.mutedForeground + '88'} /></View>
                <View style={{ flex: 1 }}><TextInput style={inputStyle} value={mNextKm} onChangeText={setMNextKm} placeholder="Next service km" keyboardType="number-pad" placeholderTextColor={theme.mutedForeground + '88'} /></View>
              </View>
              <Button label="Log maintenance" onPress={logMaintenance} size="md" />
            </View>
          )}
        </View>

        {maintenance.length > 0 && (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={{ color: theme.mutedForeground, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm }}>Maintenance history</Text>
            {maintenance.map((m) => (
              <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.foreground, fontSize: 14, fontWeight: '700', textTransform: 'capitalize' }}>{m.kind} · {m.title}</Text>
                  <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>{new Date(m.performedAt).toLocaleDateString()}{m.odometerKm ? ` · ${m.odometerKm} km` : ''}</Text>
                </View>
                <Text style={{ color: theme.foreground, fontSize: 13, fontWeight: '700' }}>{m.cost != null ? `₹${m.cost}` : ''}</Text>
              </View>
            ))}
          </View>
        )}

        <Button label={t('vehicleDetail.save')} onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme()
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={{ color: theme.mutedForeground, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>{label}</Text>
      {children}
    </View>
  )
}

function Header({ onBack, theme }: { onBack: () => void; theme: ReturnType<typeof useTheme> }) {
  const { t } = useI18n()
  return (
    <View style={[styles.header, { borderBottomColor: theme.border }]}>
      <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
      <Text style={[styles.title, { color: theme.foreground }]}>{t('vehicleDetail.title')}</Text>
      <View style={{ width: 20 }} />
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  body: { padding: spacing.lg, gap: spacing.md },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vehicleNo: { fontSize: 22, fontWeight: '800', letterSpacing: 0.5 },
  meta: { fontSize: 13 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 15, fontWeight: '600' },
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm },
  verifyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  verifyBtn: { borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', padding: spacing.md, alignItems: 'center', marginTop: spacing.md },
  driverPicker: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  driverOption: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
})
