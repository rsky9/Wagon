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
        </View>

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
