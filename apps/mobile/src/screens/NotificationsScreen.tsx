import { SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useState, useCallback } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable } from 'react-native'
import { useTheme, spacing, radius, timeAgo } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'

interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  isRead: boolean
  createdAt: string
  data?: { route?: string; tripId?: string; loadId?: string }
}

interface Props {
  onBack: () => void
  onNavigate?: (route: string, item: NotificationItem) => void
}

const TYPE_ICON: Record<string, string> = {
  order_accepted: '✅',
  trip_started: '🚚',
  trip_delivered: '📦',
  escrow_paid: '₹',
  lane_match: '🔔',
  ewb_generated: '🧾',
  bid_received: '🤝',
  bid_accepted: '🎉',
  bid_withdrawn: '↩️',
  counteroffer: '🤝',
  shortlisted: '⭐',
  booking_confirmed: '📋',
  booking_requested: '📨',
  trip_exception: '⚠️',
  trip_stage: '📍',
  broadcast: '📢',
  default: '🔔',
}

export function NotificationsScreen({ onBack, onNavigate }: Props) {
  const theme = useTheme()
  const [filter, setFilter] = useState<'all' | 'market'>('all')
  const { t } = useI18n()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [unread, setUnread] = useState(0)

  const fetch = useCallback(() => {
    api.get<{ items: NotificationItem[]; unread: number }>('/notifications')
      .then((res) => { setItems(res.items); setUnread(res.unread) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const markRead = async (id: string) => {
    await api.patch(`/notifications/${id}/read`).catch(() => {})
    fetch()
  }

  const markAllRead = async () => {
    await api.post(`/notifications/read-all`).catch(() => {})
    fetch()
  }

  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null)
  useEffect(() => { api.get<{ preferences: Record<string, boolean> }>('/notifications/preferences').then((r) => setPrefs(r.preferences)).catch(() => {}) }, [])
  const togglePref = async (key: string, value: boolean) => {
    setPrefs((p) => (p ? { ...p, [key]: value } : p))
    await api.patch('/notifications/preferences', { [key]: value }).catch(() => {})
  }

  const filtered = filter === 'all' ? items : items.filter((i) => (i.type ?? '').startsWith('market'))

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={[styles.title, { color: theme.foreground }]}>{t('notifications.title')}</Text>
          {unread > 0 && (
            <View style={[styles.badge, { backgroundColor: theme.primary }]}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{unread}</Text>
            </View>
          )}
        </View>
        {unread > 0 && (
          <Pressable onPress={markAllRead} hitSlop={8}>
            <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '800' }}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>{t('common.loading')}</Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={{ paddingBottom: spacing.sm }}>
              <View style={{ flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.sm }}>
                {([['all', 'All'], ['market', '📦 Market']] as [typeof filter, string][]).map(([k, label]) => (
                  <Pressable key={k} style={[styles.filterChip, filter === k && styles.filterActive]} onPress={() => setFilter(k)}>
                    <Text style={{ color: filter === k ? '#fff' : theme.foreground, fontSize: 12, fontWeight: '700' }}>{label}</Text>
                  </Pressable>
                ))}
              </View>

              {prefs && (
                <View style={[styles.prefs, { borderColor: theme.border }]}>
                  <Text style={[styles.prefsTitle, { color: theme.mutedForeground }]}>Notify me about</Text>
                  {([
                    ['loadAlerts', 'New loads'],
                    ['booking', 'Bookings'],
                    ['trip', 'Trips'],
                    ['payment', 'Payments'],
                    ['kyc', 'KYC & verification'],
                    ['docExpiry', 'Document expiry'],
                    ['promo', 'Promotions'],
                    ['market', 'Marketplace'],
                  ] as [string, string][]).map(([key, label]) => (
                    <Pressable key={key} style={styles.prefRow} onPress={() => togglePref(key, !prefs[key])}>
                      <Text style={{ color: theme.foreground, fontSize: 13 }}>{label}</Text>
                      <View style={[styles.switch, prefs[key] && styles.switchOn, { backgroundColor: prefs[key] ? theme.primary : 'rgba(128,128,128,0.3)' }]}>
                        <View style={[styles.switchKnob, prefs[key] && { transform: [{ translateX: 16 }] }]} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            <EmptyState title={t('notifications.empty')} message={t('notifications.emptyHint')} icon="🔔" />
          }
          renderItem={({ item }) => (
            <Pressable
              style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }, !item.isRead && { borderLeftColor: theme.primary, borderLeftWidth: 3 }]}
              onPress={() => {
                markRead(item.id)
                const route = item.data?.route
                if (route && onNavigate) onNavigate(route, item)
              }}
            >
              <View style={[styles.iconBox, { backgroundColor: theme.accent }]}>
                <Text style={{ fontSize: 18 }}>{TYPE_ICON[item.type] ?? TYPE_ICON.default}</Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: theme.foreground }]}>{item.title}</Text>
                <Text style={[styles.rowBodyText, { color: theme.mutedForeground }]} numberOfLines={2}>{item.body}</Text>
                <Text style={[styles.time, { color: theme.mutedForeground }]}>{timeAgo(item.createdAt)}</Text>
              </View>
              {!item.isRead && <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />}
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
  badge: { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  filterChip: { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: 'rgba(128,128,128,0.4)' },
  filterActive: { backgroundColor: '#F97316', borderColor: '#F97316' },
  list: { padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: spacing.md },
  iconBox: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowBodyText: { fontSize: 13, marginTop: 1 },
  time: { fontSize: 12, marginTop: 3, opacity: 0.8 },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  prefs: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.sm },
  prefsTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  prefRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  switch: { width: 40, height: 24, borderRadius: 12, padding: 2 },
  switchOn: { },
  switchKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
})
