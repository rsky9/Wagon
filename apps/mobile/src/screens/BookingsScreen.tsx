import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable } from 'react-native'
import { useTheme, spacing, radius, formatINR, formatWeight } from '@wagon/design'
import { StatusChip, EmptyState, type StatusTone } from '@wagon/components'
import { api } from '../config'
import type { Load } from '@wagon/contracts'
import { useI18n } from '@wagon/i18n'

interface BookingRow {
  id: string
  status: string
  podUrl?: string | null
  load: Load
}

interface Props {
  onBack: () => void
  onSelectLoad: (loadId: string) => void
}

const TONE: Record<string, StatusTone> = {
  accepted: 'success',
  in_transit: 'brand',
  delivered: 'success',
  cancelled: 'danger',
}

export function BookingsScreen({ onBack, onSelectLoad }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    api.get<{ trips: BookingRow[] }>('/trips/mine').then((res) => setBookings(res.trips)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('bookings.title')}</Text>
        <View style={{ width: 20 }} />
      </View>

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>{t('common.loading')}</Text>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title={t('bookings.none')} message="When a transporter accepts your load, it becomes a booking" icon="📅" />}
          renderItem={({ item }) => (
            <Pressable style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => onSelectLoad(item.load.id)}>
              <View style={styles.cardTop}>
                <Text style={[styles.fare, { color: theme.foreground }, { fontVariant: ['tabular-nums'] }]}>{formatINR(item.load.fareEstimate)}</Text>
                <StatusChip label={item.status.replace('_', ' ')} tone={TONE[item.status]} />
              </View>
              <Text style={[styles.route, { color: theme.foreground }]}>{item.load.pickupAddr} → {item.load.dropAddr}</Text>
              <Text style={[styles.meta, { color: theme.mutedForeground }]}>{formatWeight(item.load.weight)} · {item.load.distanceKm} km · {item.load.material?.name ?? '—'}</Text>
              {item.podUrl && <Text style={{ color: theme.success, fontSize: 12, fontWeight: '700' }}>✓ POD uploaded</Text>}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fare: { fontSize: 18, fontWeight: '800' },
  route: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 13 },
})
