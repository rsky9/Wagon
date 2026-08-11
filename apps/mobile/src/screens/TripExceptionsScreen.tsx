import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, ScrollView, Pressable, Alert, RefreshControl, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { Button, EmptyState, StatusChip, type StatusTone } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'

interface Exception {
  id: string
  kind: string
  title: string
  notes?: string | null
  photos: string[]
  status: string
  createdAt: string
}

interface Props {
  tripId: string
  onBack: () => void
}

const KINDS = [
  { key: 'breakdown', icon: '🔧' },
  { key: 'accident', icon: '🚨' },
  { key: 'traffic', icon: '🚦' },
  { key: 'delay', icon: '⏰' },
  { key: 'destination_problem', icon: '📍' },
  { key: 'goods_damage', icon: '📦' },
  { key: 'other', icon: '📝' },
]

const TONE: Record<string, StatusTone> = { open: 'warning', resolved: 'success' }

export function TripExceptionsScreen({ tripId, onBack }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [items, setItems] = useState<Exception[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reporting, setReporting] = useState(false)

  const fetch = useCallback(() => {
    api.get<{ exceptions: Exception[] }>(`/exceptions/trip/${tripId}`).then((res) => setItems(res.exceptions)).catch(() => {}).finally(() => setLoading(false))
  }, [tripId])

  useEffect(() => { fetch() }, [fetch])

  const report = (kind: string) => {
    Alert.prompt('Describe the issue', `Report ${kind.replace('_', ' ')}`, [{ text: 'Cancel', style: 'cancel' }, {
      text: 'Report', onPress: (title?: string) => {
        if (!title?.trim()) { Alert.alert('Required', 'Describe the issue'); return }
        setReporting(true)
        api.post(`/exceptions/trip/${tripId}`, { kind, title: title.trim() })
          .then(() => { Alert.alert('Reported', 'The other party and support have been notified.'); fetch() })
          .catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'Failed'))
          .finally(() => setReporting(false))
      },
    }])
  }

  const resolve = (id: string) => {
    api.patch(`/exceptions/${id}/resolve`).then(() => fetch()).catch(() => Alert.alert('Error', 'Failed to resolve'))
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('tripExceptions.title')}</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(); setRefreshing(false) }} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        <Text style={[styles.section, { color: theme.foreground }]}>{t('tripExceptions.report')}</Text>
        <Text style={[styles.hint, { color: theme.mutedForeground }]}>Breakdowns, delays and accidents are handled as part of the trip — no need to call support.</Text>
        <View style={styles.kindRow}>
          {KINDS.map((k) => (
            <Pressable key={k.key} style={[styles.kind, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => report(k.key)} disabled={reporting}>
              <Text style={{ fontSize: 22 }}>{k.icon}</Text>
              <Text style={[styles.kindLabel, { color: theme.mutedForeground }]}>{k.key.replace('_', ' ')}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.section, { color: theme.foreground }]}>{t('tripExceptions.timeline')}</Text>
        {loading ? (
          <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 40 }}>{t('common.loading')}</Text>
        ) : items.length === 0 ? (
          <EmptyState title={t('tripExceptions.none')} message={t('tripExceptions.hint')} icon="✅" />
        ) : (
          items.map((e) => (
            <View key={e.id} style={[styles.exc, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.excTop}>
                <Text style={[styles.excTitle, { color: theme.foreground }]}>{e.title}</Text>
                <StatusChip label={e.status} tone={TONE[e.status]} />
              </View>
              <Text style={[styles.excMeta, { color: theme.mutedForeground }]}>{e.kind.replace('_', ' ')} · {new Date(e.createdAt).toLocaleString('en-IN')}</Text>
              {e.notes ? <Text style={[styles.excNotes, { color: theme.mutedForeground }]}>{e.notes}</Text> : null}
              {e.photos.length > 0 && <Text style={{ color: theme.info, fontSize: 12 }}>📷 {e.photos.length} photo(s)</Text>}
              {e.status === 'open' && (
                <Pressable style={[styles.resolveBtn, { borderColor: theme.success + '55' }]} onPress={() => resolve(e.id)}>
                  <Text style={{ color: theme.success, fontWeight: '700', fontSize: 13 }}>{t('tripExceptions.markResolved')}</Text>
                </Pressable>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  section: { fontSize: 16, fontWeight: '800', marginTop: spacing.sm },
  hint: { fontSize: 13, lineHeight: 19 },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kind: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, alignItems: 'center', width: '30%' },
  kindLabel: { fontSize: 11, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  exc: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: 4 },
  excTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  excTitle: { fontSize: 15, fontWeight: '800', flex: 1 },
  excMeta: { fontSize: 12 },
  excNotes: { fontSize: 13 },
  resolveBtn: { borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center', marginTop: spacing.sm },
})
