import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, RefreshControl, Switch, TextInput, Alert } from 'react-native'
import { useTheme, spacing, radius, formatINR } from '@wagon/design'
import { StatusChip, EmptyState, type StatusTone } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'
import { subscribeDataChanged } from '../lib/dataBus'
import { LocationShare } from '../components/LocationShare'
import { prompt } from '../components/Prompt'

interface DriverTrip {
  id: string
  status: string
  load: { pickupAddr: string; dropAddr: string; weight: number; distanceKm: number; fareEstimate: number; material?: { name: string } | null }
}

interface DriverEarnings {
  trips: number
  earned: number
}

interface DriverLedger {
  payRate: number | null
  trips: Array<{ tripId: string; pickup: string; drop: string; fare: number; earned: number; deliveredAt: string | null }>
}

interface DriverHome {
  todayTrips: DriverTrip[]
  activeTrip: DriverTrip | null
  available: boolean
}

interface Props {
  onOpenTrip: (tripId: string) => void
}

const TONE: Record<string, StatusTone> = {
  accepted: 'info',
  in_transit: 'brand',
  delivered: 'success',
  cancelled: 'danger',
}

export function DriverHomeScreen({ onOpenTrip }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [data, setData] = useState<DriverHome | null>(null)
  const [earnings, setEarnings] = useState<DriverEarnings | null>(null)
  const [ledger, setLedger] = useState<DriverLedger | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [available, setAvailable] = useState(true)
  const [missingProfile, setMissingProfile] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [transporterMobile, setTransporterMobile] = useState('')
  const [joining, setJoining] = useState(false)
  const [showLedger, setShowLedger] = useState(false)
  const [payouts, setPayouts] = useState<{ bankAdded: boolean; due: number; paid: number; trips: Array<{ tripId: string; pickup: string; drop: string; earned: number; paid: number; deliveredAt: string | null }> } | null>(null)

  const fetch = useCallback(() => {
    setMissingProfile(false)
    setLoadError(null)
    return Promise.all([
      api.get<DriverHome>('/driver/home')
        .then((d) => { setData(d); setAvailable(d.available) })
        .catch((e) => {
          // 400 "Driver profile not found": the transporter hasn't added this
          // driver yet — show an explicit onboarding state instead of an empty feed.
          if (e instanceof Error && /driver profile not found/i.test(e.message)) setMissingProfile(true)
          else setLoadError(e instanceof Error ? e.message : 'Could not load driver home')
        })
        .finally(() => setLoading(false)),
      api.get<DriverEarnings>('/driver/earnings').then(setEarnings).catch(() => {}),
      api.get<DriverLedger>('/driver/ledger').then(setLedger).catch(() => {}),
      api.get<typeof payouts>('/driver/payouts').then(setPayouts).catch(() => {}),
    ])
  }, [])

  const setBank = async () => {
    const acct = await prompt({ title: 'Bank account number', placeholder: 'Enter account number', keyboardType: 'numeric' })
    if (!acct?.trim()) return
    const ifsc = await prompt({ title: 'IFSC code', placeholder: 'e.g. HDFC0001234' })
    if (!ifsc?.trim()) return
    api.patch('/driver/bank', { bankAccount: acct.trim(), ifsc: ifsc.trim() })
      .then(() => Alert.alert('Bank added', 'Your payout bank is set'))
      .catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save bank'))
      .finally(fetch)
  }

  const releaseDriverPayout = (tripId: string) => {
    api.post<{ alreadyPaid?: boolean }>(`/driver/trips/${tripId}/payout`)
      .then((r) => Alert.alert(r.alreadyPaid ? 'Already paid' : 'Payout sent', r.alreadyPaid ? 'This trip was already paid out' : 'Your payout has been released to your bank'))
      .catch((e) => Alert.alert('Payout', e instanceof Error ? e.message : 'Payout failed'))
      .finally(fetch)
  }

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => subscribeDataChanged('trips', () => fetch()), [fetch])

  const toggleAvailability = async (v: boolean) => {
    if (missingProfile) return
    const prev = available
    setAvailable(v)
    try {
      await api.patch('/driver/availability', { available: v })
    } catch {
      // Revert on failure so the switch never lies about online state.
      setAvailable(prev)
    }
  }

  const join = async () => {
    if (!/^\d{10}$/.test(transporterMobile.trim())) { Alert.alert(t('ui.required'), 'Enter your transporter\'s 10-digit mobile'); return }
    setJoining(true)
    try {
      const res = await api.post<{ driver: { id: string; name: string } }>('/driver/join', { transporterMobile: transporterMobile.trim() })
      Alert.alert('Joined your fleet', `You are now registered as ${res.driver.name}.`)
      setMissingProfile(false)
      fetch()
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed to join')
    } finally { setJoining(false) }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.background }]}>
        <Text style={[styles.logo, { color: theme.foreground }]}>
          Wagon<Text style={{ color: theme.primary }}>.</Text>
        </Text>
        <Text style={[styles.sub, { color: theme.mutedForeground }]}>{t('driver.title')}</Text>
      </View>

      <View style={[styles.availRow, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.availTitle, { color: theme.foreground }]}>{t('driver.availableForTrips')}</Text>
          <Text style={[styles.availSub, { color: theme.mutedForeground }]}>
            {missingProfile ? 'Not linked to a fleet yet' : available ? 'Transporters can assign you loads' : 'You are offline'}
          </Text>
        </View>
        <Switch value={available && !missingProfile} onValueChange={toggleAvailability} disabled={missingProfile} trackColor={{ true: theme.primary, false: theme.border }} thumbColor="#fff" />
      </View>

      {missingProfile && (
        <View style={[styles.joinBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.joinTitle, { color: theme.foreground }]}>Join your transporter's fleet</Text>
          <Text style={[styles.joinSub, { color: theme.mutedForeground }]}>
            Enter your transporter's mobile number. They can also add you from their Drivers screen.
          </Text>
          <TextInput
            style={[styles.joinInput, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]}
            value={transporterMobile}
            onChangeText={setTransporterMobile}
            placeholder="Transporter mobile (10 digits)"
            placeholderTextColor={theme.mutedForeground + '88'}
            keyboardType="number-pad"
            maxLength={10}
          />
          <Pressable style={[styles.joinBtn, { backgroundColor: theme.primary }]} onPress={join} disabled={joining}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{joining ? 'Joining…' : 'Join fleet'}</Text>
          </Pressable>
        </View>
      )}

      {loadError && !missingProfile && (
        <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
          <Text style={{ color: theme.danger, fontSize: 13, textAlign: 'center' }}>{loadError}</Text>
          <Pressable style={{ marginTop: 6, padding: spacing.sm, backgroundColor: theme.muted, borderRadius: radius.md, alignSelf: 'center' }} onPress={() => { setLoading(true); fetch() }}>
            <Text style={{ color: theme.foreground, fontWeight: '700' }}>Retry</Text>
          </Pressable>
        </View>
      )}

      {data?.activeTrip?.status === 'in_transit' && (
        <View style={{ marginHorizontal: spacing.lg, marginBottom: spacing.md }}>
          <LocationShare tripId={data.activeTrip.id} />
        </View>
      )}

      {earnings && (
        <View style={[styles.earningsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.earningsLabel, { color: theme.mutedForeground }]}>{t('driver.earnings')}</Text>
            <Text style={[styles.earningsValue, { color: theme.foreground }]}>{formatINR(earnings.earned)}</Text>
            {ledger?.payRate != null && (
              <Text style={[styles.earningsLabel, { color: theme.mutedForeground }]}>Pay rate ₹{ledger.payRate}/trip</Text>
            )}
          </View>
          <Pressable onPress={() => setShowLedger((s) => !s)} hitSlop={8}>
            <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 13 }}>{showLedger ? 'Hide' : 'Ledger'}</Text>
          </Pressable>
          <View style={styles.earningsRight}>
            <Text style={[styles.earningsTrips, { color: theme.primary }]}>{earnings.trips}</Text>
            <Text style={[styles.earningsLabel, { color: theme.mutedForeground }]}>{t('driver.tripsCompleted')}</Text>
          </View>
        </View>
      )}

      {showLedger && ledger && ledger.trips.length > 0 && (
        <View style={[styles.ledgerBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.ledgerTitle, { color: theme.foreground }]}>Trip ledger</Text>
          {ledger.trips.map((trip) => (
            <View key={trip.tripId} style={styles.ledgerRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.ledgerRoute, { color: theme.foreground }]}>{trip.pickup} → {trip.drop}</Text>
                <Text style={[styles.ledgerMeta, { color: theme.mutedForeground }]}>
                  {trip.deliveredAt ? new Date(trip.deliveredAt).toLocaleDateString() : 'Delivered'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.ledgerEarned, { color: theme.foreground }]}>{formatINR(trip.earned)}</Text>
                <Text style={[styles.ledgerFare, { color: theme.mutedForeground }]}>fare {formatINR(trip.fare)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {payouts && (
        <View style={[styles.ledgerBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[styles.ledgerTitle, { color: theme.foreground }]}>Payouts</Text>
            <Pressable onPress={setBank} hitSlop={8}>
              <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 13 }}>
                {payouts.bankAdded ? 'Change bank' : 'Add bank'}
              </Text>
            </Pressable>
          </View>
          <View style={styles.ledgerRow}>
            <Text style={[styles.ledgerMeta, { color: theme.mutedForeground }]}>Pending</Text>
            <Text style={[styles.ledgerEarned, { color: payouts.due > 0 ? theme.warning : theme.success }]}>{formatINR(payouts.due)}</Text>
          </View>
          <View style={styles.ledgerRow}>
            <Text style={[styles.ledgerMeta, { color: theme.mutedForeground }]}>Paid out</Text>
            <Text style={[styles.ledgerEarned, { color: theme.success }]}>{formatINR(payouts.paid)}</Text>
          </View>
          {payouts.trips.length > 0 && (
            <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
              {payouts.trips.map((tp) => (
                <View key={tp.tripId} style={[styles.ledgerRow, { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: spacing.sm }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.ledgerRoute, { color: theme.foreground }]} numberOfLines={1}>{tp.pickup} → {tp.drop}</Text>
                    <Text style={[styles.ledgerMeta, { color: theme.mutedForeground }]}>{formatINR(tp.earned)} earned</Text>
                  </View>
                  {tp.paid > 0 ? (
                    <Text style={{ color: theme.success, fontSize: 13, fontWeight: '800' }}>✓ Paid</Text>
                  ) : (
                    <Pressable style={[styles.payoutBtn, { backgroundColor: payouts.bankAdded ? theme.primary : theme.muted }]} onPress={() => payouts.bankAdded && releaseDriverPayout(tp.tripId)}>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{payouts.bankAdded ? 'Pay out' : 'Add bank'}</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <FlatList
        data={data?.todayTrips ?? []}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch().finally(() => setRefreshing(false)) }} tintColor={theme.primary} colors={[theme.primary]} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          data?.activeTrip ? (
            <Pressable style={[styles.activeCard, { backgroundColor: theme.primary }]} onPress={() => onOpenTrip(data.activeTrip!.id)}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>{t('driver.activeTrip')}</Text>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800', marginTop: 4 }}>
                {data.activeTrip.load.pickupAddr} → {data.activeTrip.load.dropAddr}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 }}>
                {data.activeTrip.load.weight}t · {data.activeTrip.load.distanceKm} km · {data.activeTrip.load.material?.name ?? '—'}
              </Text>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16, marginTop: 6 }}>{formatINR(data.activeTrip.load.fareEstimate)}</Text>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={<EmptyState title={t('driver.noTripsToday')} message="Your assigned trips for today will appear here" icon="🚚" />}
        renderItem={({ item }) => (
          <Pressable style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={() => onOpenTrip(item.id)}>
            <View style={styles.cardTop}>
              <Text style={[styles.fare, { color: theme.foreground }, { fontVariant: ['tabular-nums'] }]}>{formatINR(item.load.fareEstimate)}</Text>
              <StatusChip label={item.status.replace('_', ' ')} tone={TONE[item.status]} />
            </View>
            <Text style={[styles.route, { color: theme.foreground }]}>{item.load.pickupAddr} → {item.load.dropAddr}</Text>
            <Text style={[styles.meta, { color: theme.mutedForeground }]}>{item.load.weight}t · {item.load.distanceKm} km</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  logo: { fontSize: 24, fontWeight: '800', letterSpacing: -0.02 },
  sub: { fontSize: 13 },
  availRow: { flexDirection: 'row', alignItems: 'center', margin: spacing.lg, marginTop: spacing.sm, borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg },
  availTitle: { fontSize: 15, fontWeight: '700' },
  availSub: { fontSize: 12, marginTop: 1 },
  earningsCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg },
  earningsLabel: { fontSize: 12 },
  earningsValue: { fontSize: 24, fontWeight: '800', marginTop: 2 },
  earningsRight: { alignItems: 'center' },
  earningsTrips: { fontSize: 22, fontWeight: '800' },
  list: { padding: spacing.lg, gap: spacing.md },
  activeCard: { borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fare: { fontSize: 18, fontWeight: '800' },
  route: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 13 },
  joinBox: { margin: spacing.lg, marginTop: 0, borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  joinTitle: { fontSize: 15, fontWeight: '800' },
  joinSub: { fontSize: 12, lineHeight: 16 },
  joinInput: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 15 },
  joinBtn: { borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  ledgerBox: { marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg },
  ledgerTitle: { fontSize: 14, fontWeight: '800', marginBottom: spacing.sm },
  ledgerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#8884' },
  ledgerRoute: { fontSize: 13, fontWeight: '700' },
  ledgerMeta: { fontSize: 11, marginTop: 1 },
  ledgerEarned: { fontSize: 14, fontWeight: '800' },
  payoutBtn: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'center' },
  ledgerFare: { fontSize: 11 },
})
