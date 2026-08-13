import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, ScrollView, Pressable, Switch } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'

interface Prefs {
  loadAlerts: boolean
  booking: boolean
  trip: boolean
  payment: boolean
  kyc: boolean
  docExpiry: boolean
  promo: boolean
  market: boolean
}

interface Props {
  onBack: () => void
}

const ROWS: Array<{ key: keyof Prefs; icon: string; label: string; desc: string }> = [
  { key: 'loadAlerts', icon: '🚛', label: 'Load alerts', desc: 'New loads matching your lane' },
  { key: 'booking', icon: '📅', label: 'Booking alerts', desc: 'Load accepted, quoted, booked' },
  { key: 'trip', icon: '🧭', label: 'Trip alerts', desc: 'Pickup, transit and delivery updates' },
  { key: 'payment', icon: '₹', label: 'Payment alerts', desc: 'Escrow, payout and settlement' },
  { key: 'kyc', icon: '🛡️', label: 'KYC alerts', desc: 'Verification status changes' },
  { key: 'docExpiry', icon: '📄', label: 'Document expiry', desc: 'Insurance, permit, fitness reminders' },
  { key: 'promo', icon: '🎁', label: 'Promotions', desc: 'Offers and product updates' },
  { key: 'market', icon: '🏪', label: 'Marketplace', desc: 'Demand, quotes and asks on the capability market' },
]

export function NotificationPrefsScreen({ onBack }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    api.get<{ prefs: Prefs }>('/notification-preferences').then((res) => setPrefs(res.prefs)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const toggle = async (key: keyof Prefs, value: boolean) => {
    setPrefs((p) => (p ? { ...p, [key]: value } : p))
    await api.patch('/notification-preferences', { [key]: value }).catch(() => {})
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('notifications.title')}</Text>
        <View style={{ width: 20 }} />
      </View>

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>{t('common.loading')}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={[styles.subtitle, { color: theme.mutedForeground }]}>
            Choose which notifications you want to receive.
          </Text>
          {ROWS.map((row) => (
            <View key={row.key} style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={{ fontSize: 18 }}>{row.icon}</Text>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={[styles.label, { color: theme.foreground }]}>{row.label}</Text>
                <Text style={[styles.desc, { color: theme.mutedForeground }]}>{row.desc}</Text>
              </View>
              <Switch
                value={prefs?.[row.key] ?? true}
                onValueChange={(v) => toggle(row.key, v)}
                trackColor={{ true: theme.primary, false: theme.border }}
                thumbColor="#fff"
              />
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  body: { padding: spacing.lg },
  subtitle: { fontSize: 14, marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, marginBottom: spacing.sm },
  label: { fontSize: 15, fontWeight: '600' },
  desc: { fontSize: 12, marginTop: 1 },
})
