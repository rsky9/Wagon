import { SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable } from 'react-native'
import { useTheme, spacing, radius, formatINR } from '@wagon/design'
import { StatusChip, EmptyState, LoadCard, type StatusTone } from '@wagon/components'
import { api } from '../config'
import type { Load } from '@wagon/contracts'
import { useI18n } from '@wagon/i18n'

interface ReturnData {
  returnLoads: Array<Load & { matchScore?: number }>
  fromCity: string
}

interface Props {
  tripId: string
  onBack: () => void
  onSelectLoad: (load: Load) => void
}

const TONE: Record<string, StatusTone> = {
  posted: 'success',
  interested: 'warning',
  accepted: 'info',
  in_transit: 'brand',
  delivered: 'success',
  cancelled: 'danger',
}

export function ReturnLoadsScreen({ tripId, onBack, onSelectLoad }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [data, setData] = useState<ReturnData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<ReturnData>(`/loads/return/${tripId}`).then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [tripId])

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('returnLoads.title')}</Text>
        <View style={{ width: 20 }} />
      </View>

      {data?.fromCity && (
        <View style={[styles.banner, { backgroundColor: theme.accent }]}>
          <Text style={{ color: theme.accentForeground, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>
            📍 Loads from {data.fromCity} — avoid empty return trips
          </Text>
        </View>
      )}

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>{t('common.loading')}</Text>
      ) : (
        <FlatList
          data={data?.returnLoads ?? []}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState title={t('returnLoads.none')} message={`No loads posted from ${data?.fromCity ?? 'this city'} right now. Check back soon.`} icon="🔄" />
          }
          renderItem={({ item }) => (
            <LoadCard
              from={item.pickupAddr}
              to={item.dropAddr}
              distanceKm={item.distanceKm}
              fare={item.fareEstimate}
              matchScore={item.matchScore}
              status={<StatusChip label={item.status.replace('_', ' ')} tone={TONE[item.status]} />}
              meta={[`${item.weight}t`, item.material?.name ?? '—']}
              onPress={() => onSelectLoad(item)}
            />
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
  banner: { paddingVertical: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.md },
})
