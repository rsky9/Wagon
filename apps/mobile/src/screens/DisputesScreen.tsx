import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { EmptyState, StatusChip, type StatusTone } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'

interface Dispute {
  id: string
  tripId: string
  subject: string
  status: string
  resolution?: string | null
  createdAt: string
}

interface Props {
  onBack: () => void
  onRaise: () => void
}

const TONE: Record<string, StatusTone> = { open: 'warning', resolved: 'success' }

export function DisputesScreen({ onBack, onRaise }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [items, setItems] = useState<Dispute[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetch = useCallback(() => {
    api.get<{ disputes: Dispute[] }>('/disputes/mine').then((res) => setItems(res.disputes)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('disputes.title')}</Text>
        <Pressable onPress={onRaise} hitSlop={8}><Text style={{ color: theme.primary, fontWeight: '800', fontSize: 14 }}>{t('disputes.raise')}</Text></Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(d) => d.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(); setRefreshing(false) }} tintColor={theme.primary} colors={[theme.primary]} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>{t('common.loading')}</Text>
          : <EmptyState title={t('disputes.none')} message="Raise a dispute for damaged goods, delays, payments or other issues" icon="⚖️" actionLabel={t('disputes.raiseAction')} onAction={onRaise} />
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.top}>
              <Text style={[styles.subject, { color: theme.foreground }]} numberOfLines={2}>{item.subject}</Text>
              <StatusChip label={item.status} tone={TONE[item.status]} />
            </View>
            <Text style={[styles.meta, { color: theme.mutedForeground }]}>Trip #{item.tripId.slice(-6)} · {new Date(item.createdAt).toLocaleDateString('en-IN')}</Text>
            {item.resolution ? <Text style={[styles.resolution, { color: theme.success }]}>Resolution: {item.resolution}</Text> : null}
          </View>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  subject: { fontSize: 15, fontWeight: '700', flex: 1 },
  meta: { fontSize: 12 },
  resolution: { fontSize: 13, fontWeight: '600' },
})
