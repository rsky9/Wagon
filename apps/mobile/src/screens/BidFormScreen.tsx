import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, TextInput, ScrollView, Pressable, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius, formatINR } from '@wagon/design'
import { Button } from '@wagon/components'
import { api } from '../config'
import type { Load } from '@wagon/contracts'
import { useI18n } from '@wagon/i18n'

interface VehicleRef {
  id: string
  vehicleNo: string
  type: string
}

interface DriverRef {
  id: string
  name: string
  mobile: string
}

interface Props {
  load: Load
  onBack: () => void
  onSubmitted: () => void
}

/** Structured bid: not just a price — truck, driver, advance, balance, pickup, ETA, validity. */
export function BidFormScreen({ load, onBack, onSubmitted }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [vehicles, setVehicles] = useState<VehicleRef[]>([])
  const [drivers, setDrivers] = useState<DriverRef[]>([])
  const [amount, setAmount] = useState(String(Math.round(load.fareEstimate)))
  const [truckId, setTruckId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [advance, setAdvance] = useState('')
  const [balance, setBalance] = useState('')
  const [pickupBy, setPickupBy] = useState('')
  const [etaHours, setEtaHours] = useState('')
  const [validity, setValidity] = useState('24')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get<{ vehicles: VehicleRef[] }>('/trucks'),
      api.get<{ drivers: DriverRef[] }>('/drivers'),
    ]).then(([t, d]) => {
      setVehicles(t.vehicles)
      setDrivers(d.drivers)
      if (t.vehicles[0]) setTruckId(t.vehicles[0].id)
      if (d.drivers[0]) setDriverId(d.drivers[0].id)
    }).catch(() => {})
  }, [])

  const inputStyle = {
    backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground,
    borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 15,
  }

  const submit = async () => {
    const n = Number(amount)
    if (!n || n <= 0) { Alert.alert(t('ui.invalidAmount'), 'Enter a bid amount'); return }
    setSubmitting(true)
    try {
      await api.post('/bidding/bid', {
        loadId: load.id,
        amount: n,
        truckId: truckId || undefined,
        driverId: driverId || undefined,
        advanceAmount: advance ? Number(advance) : undefined,
        balanceAmount: balance ? Number(balance) : undefined,
        pickupBy: pickupBy || undefined,
        etaHours: etaHours ? Number(etaHours) : undefined,
        validityHours: Number(validity) || 24,
      })
      Alert.alert(t('ui.bidSubmitted'), 'Your structured bid is in the Decision Room.', [{ text: 'OK', onPress: onSubmitted }])
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed to bid')
    } finally { setSubmitting(false) }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('bidForm.title')}</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={[styles.routeCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.route, { color: theme.foreground }]}>{load.pickupAddr} → {load.dropAddr}</Text>
          <Text style={[styles.meta, { color: theme.mutedForeground }]}>{load.weight}t · {load.distanceKm} km · reference {formatINR(load.fareEstimate)}</Text>
        </View>

        <Field label={t('bidForm.freightAmount')} theme={theme}>
          <TextInput style={inputStyle} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholderTextColor={theme.mutedForeground + '88'} />
        </Field>

        <Field label={t('bidForm.selectTruck')} theme={theme}>
          <View style={styles.chipRow}>
            {vehicles.map((t) => (
              <Pressable key={t.id} onPress={() => setTruckId(t.id)} style={[styles.chip, { backgroundColor: truckId === t.id ? theme.primary : theme.card, borderColor: truckId === t.id ? theme.primary : theme.border }]}>
                <Text style={{ color: truckId === t.id ? '#fff' : theme.foreground, fontSize: 12, fontWeight: '700' }}>{t.vehicleNo}</Text>
                <Text style={{ color: truckId === t.id ? 'rgba(255,255,255,0.8)' : theme.mutedForeground, fontSize: 10 }}>{t.type}</Text>
              </Pressable>
            ))}
            {vehicles.length === 0 && <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>{t('bidForm.noTrucks')}</Text>}
          </View>
        </Field>

        <Field label={t('bidForm.selectDriver')} theme={theme}>
          <View style={styles.chipRow}>
            {drivers.map((d) => (
              <Pressable key={d.id} onPress={() => setDriverId(d.id)} style={[styles.chip, { backgroundColor: driverId === d.id ? theme.primary : theme.card, borderColor: driverId === d.id ? theme.primary : theme.border }]}>
                <Text style={{ color: driverId === d.id ? '#fff' : theme.foreground, fontSize: 12, fontWeight: '700' }}>{d.name}</Text>
              </Pressable>
            ))}
            {drivers.length === 0 && <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>{t('bidForm.noDrivers')}</Text>}
          </View>
        </Field>

        <View style={styles.twoCol}>
          <Field label={t('bidForm.advance')} theme={theme} style={{ flex: 1 }}>
            <TextInput style={inputStyle} value={advance} onChangeText={setAdvance} keyboardType="decimal-pad" placeholderTextColor={theme.mutedForeground + '88'} />
          </Field>
          <Field label={t('bidForm.balance')} theme={theme} style={{ flex: 1 }}>
            <TextInput style={inputStyle} value={balance} onChangeText={setBalance} keyboardType="decimal-pad" placeholderTextColor={theme.mutedForeground + '88'} />
          </Field>
        </View>

        <View style={styles.twoCol}>
          <Field label={t('bidForm.pickupBy')} theme={theme} style={{ flex: 1 }}>
            <TextInput style={inputStyle} value={pickupBy} onChangeText={setPickupBy} placeholder="08:00" placeholderTextColor={theme.mutedForeground + '88'} />
          </Field>
          <Field label={t('bidForm.eta')} theme={theme} style={{ flex: 1 }}>
            <TextInput style={inputStyle} value={etaHours} onChangeText={setEtaHours} keyboardType="number-pad" placeholder="6" placeholderTextColor={theme.mutedForeground + '88'} />
          </Field>
        </View>

        <Field label={t('bidForm.validity')} theme={theme}>
          <View style={styles.chipRow}>
            {['12', '24', '48', '72'].map((v) => (
              <Pressable key={v} onPress={() => setValidity(v)} style={[styles.chip, { backgroundColor: validity === v ? theme.primary : theme.card, borderColor: validity === v ? theme.primary : theme.border }]}>
                <Text style={{ color: validity === v ? '#fff' : theme.foreground, fontSize: 12, fontWeight: '700' }}>{v}h</Text>
              </Pressable>
            ))}
          </View>
        </Field>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <Button label={t('bidForm.submit')} onPress={submit} loading={submitting} />
      </View>
    </SafeAreaView>
  )
}

function Field({ label, children, theme, style }: { label: string; children: React.ReactNode; theme: ReturnType<typeof useTheme>; style?: object }) {
  return (
    <View style={[{ marginBottom: spacing.md }, style]}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground }]}>{label}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  body: { padding: spacing.lg, paddingBottom: 40 },
  routeCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, marginBottom: spacing.lg, gap: 2 },
  route: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderRadius: radius.full, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  twoCol: { flexDirection: 'row', gap: spacing.md },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  footer: { padding: spacing.lg, borderTopWidth: 1 },
})
