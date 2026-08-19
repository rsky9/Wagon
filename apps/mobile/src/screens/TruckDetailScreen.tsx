import { SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, ScrollView, Pressable, TextInput, Alert, Switch, KeyboardAvoidingView, Platform } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'
import { Button, StatusChip } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'

interface TruckDetail {
  id: string
  truckNo: string
  type: string
  origin?: string
  activeStatus: boolean
  driver?: { name: string; mobile: string } | null
  insuranceUpto?: string | null
  permitUpto?: string | null
  fitnessUpto?: string | null
  pollutionUpto?: string | null
  odometerKm?: number | null
  nextServiceKm?: number | null
}

interface Props {
  truckId: string
  onBack: () => void
}

export function TruckDetailScreen({ truckId, onBack }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [truck, setTruck] = useState<TruckDetail | null>(null)
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

  const fetch = () => {
    api.get<{ trucks: TruckDetail[] }>('/trucks').then((res) => {
      const t = res.trucks.find((x) => x.id === truckId)
      if (t) {
        setTruck(t)
        setActive(t.activeStatus)
        setInsurance(t.insuranceUpto?.slice(0, 10) ?? '')
        setPermit(t.permitUpto?.slice(0, 10) ?? '')
        setFitness(t.fitnessUpto?.slice(0, 10) ?? '')
        setPollution(t.pollutionUpto?.slice(0, 10) ?? '')
        setOdometer(t.odometerKm ? String(t.odometerKm) : '')
      }
    }).catch(() => {}).finally(() => setLoading(false))
    api.get<{ maintenance: Array<{ id: string; kind: string; title: string; cost?: number | null; odometerKm?: number | null; performedAt: string }> }>(`/trucks/${truckId}/maintenance`)
      .then((r) => setMaintenance(r.maintenance)).catch(() => {})
  }

  useEffect(() => { fetch() }, [truckId])

  const inputStyle = {
    backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground,
    borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 15,
  }

  const save = async () => {
    try {
      await api.patch(`/trucks/${truckId}`, {
        activeStatus: active,
        insuranceUpto: insurance ? `${insurance}T00:00:00Z` : undefined,
        permitUpto: permit ? `${permit}T00:00:00Z` : undefined,
        fitnessUpto: fitness ? `${fitness}T00:00:00Z` : undefined,
        pollutionUpto: pollution ? `${pollution}T00:00:00Z` : undefined,
        odometerKm: odometer ? Number(odometer) : undefined,
      })
      Alert.alert(t('ui.saved'), `${truck?.truckNo} updated`)
      fetch()
    } catch (e) { Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed') }
  }

  const logMaintenance = async () => {
    if (!mTitle.trim()) { Alert.alert(t('ui.required'), 'Enter a maintenance title'); return }
    try {
      await api.post(`/trucks/${truckId}/maintenance`, {
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

  if (!truck) {
    return <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}><Header onBack={onBack} theme={theme} /><View style={styles.center}><Text style={{ color: theme.mutedForeground }}>{t('truckDetail.notFound')}</Text></View></SafeAreaView>
  }

  return (
    <KeyboardAvoidingView style={[styles.safe, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Header onBack={onBack} theme={theme} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <Text style={[styles.truckNo, { color: theme.foreground }]}>{truck.truckNo}</Text>
          <StatusChip label={active ? 'Active' : 'Inactive'} tone={active ? 'success' : 'neutral'} />
        </View>
        <Text style={[styles.meta, { color: theme.mutedForeground }]}>{truck.type} · {truck.origin ?? '—'} · Driver: {truck.driver?.name ?? 'Unassigned'}</Text>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.switchRow}>
            <Text style={[styles.label, { color: theme.foreground }]}>{t('truckDetail.availability')}</Text>
            <Switch value={active} onValueChange={setActive} trackColor={{ true: theme.primary, false: theme.border }} thumbColor="#fff" />
          </View>
        </View>

        <Text style={[styles.section, { color: theme.mutedForeground }]}>{t('truckDetail.documents')}</Text>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Field label={t('truckDetail.insuranceExpiry')}><TextInput style={inputStyle} value={insurance} onChangeText={setInsurance} placeholder="2026-08-19" placeholderTextColor={theme.mutedForeground + '88'} /></Field>
          <Field label={t('truckDetail.permitExpiry')}><TextInput style={inputStyle} value={permit} onChangeText={setPermit} placeholder="2026-08-19" placeholderTextColor={theme.mutedForeground + '88'} /></Field>
          <Field label={t('truckDetail.fitnessExpiry')}><TextInput style={inputStyle} value={fitness} onChangeText={setFitness} placeholder="2026-08-19" placeholderTextColor={theme.mutedForeground + '88'} /></Field>
          <Field label={t('truckDetail.pollutionExpiry')}><TextInput style={inputStyle} value={pollution} onChangeText={setPollution} placeholder="2026-08-19" placeholderTextColor={theme.mutedForeground + '88'} /></Field>
        </View>

        <Text style={[styles.section, { color: theme.mutedForeground }]}>{t('truckDetail.maintenance')}</Text>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Field label={t('truckDetail.odometer')}><TextInput style={inputStyle} value={odometer} onChangeText={setOdometer} placeholder={t('truckDetail.odometerExample')} keyboardType="number-pad" placeholderTextColor={theme.mutedForeground + '88'} /></Field>
          {truck.nextServiceKm != null && (
            <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>Next service at {truck.nextServiceKm} km</Text>
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

        <Button label={t('truckDetail.save')} onPress={save} />
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
      <Text style={[styles.title, { color: theme.foreground }]}>{t('truckDetail.title')}</Text>
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
  truckNo: { fontSize: 22, fontWeight: '800', letterSpacing: 0.5 },
  meta: { fontSize: 13 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 15, fontWeight: '600' },
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.sm },
})
