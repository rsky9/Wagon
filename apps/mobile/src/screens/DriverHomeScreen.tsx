import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, RefreshControl, Switch } from 'react-native'
import { useTheme, spacing, radius, formatINR } from '@wagon/design'
import { StatusChip, EmptyState, type StatusTone } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'
import { subscribeDataChanged } from '../lib/dataBus'

interface DriverTrip {
  id: string
  status: string
  load: { pickupAddr: string; dropAddr: string; weight: number; distanceKm: number; fareEstimate: number; material?: { name: string } | null }
}

interface DriverEarnings {
  trips: number
  earned: number
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
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [available, setAvailable] = useState(true)

  const fetch = useCallback(() => {
    api.get<DriverHome>('/driver/home').then((d) => { setData(d); setAvailable(d.available) }).catch(() => {}).finally(() => setLoading(false))
    api.get<DriverEarnings>('/driver/earnings').then(setEarnings).catch(() => {})
  }, [])

  useEffect(() => { fetch() }, [fetch])
  useEffect(() => subscribeDataChanged('trips', () => fetch()), [fetch])

  const toggleAvailability = async (v: boolean) => {
    setAvailable(v)
    await api.patch('/driver/availability', { available: v }).catch(() => {})
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
            {available ? 'Transporters can assign you loads' : 'You are offline'}
          </Text>
        </View>
        <Switch value={available} onValueChange={toggleAvailability} trackColor={{ true: theme.primary, false: theme.border }} thumbColor="#fff" />
      </View>

      {earnings && (
        <View style={[styles.earningsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.earningsLabel, { color: theme.mutedForeground }]}>{t('driver.earnings')}</Text>
            <Text style={[styles.earningsValue, { color: theme.foreground }]}>{formatINR(earnings.earned)}</Text>
          </View>
          <View style={styles.earningsRight}>
            <Text style={[styles.earningsTrips, { color: theme.primary }]}>{earnings.trips}</Text>
            <Text style={[styles.earningsLabel, { color: theme.mutedForeground }]}>{t('driver.tripsCompleted')}</Text>
          </View>
        </View>
      )}

      <FlatList
        data={data?.todayTrips ?? []}
        keyExtractor={(t) => t.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(); setRefreshing(false) }} tintColor={theme.primary} colors={[theme.primary]} />}
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
        ListEmptyComponent={<EmptyState title={t('driver.noTripsToday')} message="Your assigned trips for today will appear here" icon="🧭" />}
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
})
