import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert } from 'react-native'
import { useTheme, spacing, radius, formatINR } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'

interface InvoiceRow {
  invoiceNo: string
  tripId: string
  route: string
  baseAmount: number
  gstAmount: number
  tdsAmount: number
  netAmount: number
  settled: boolean
}

interface TripRef {
  id: string
}

interface Props {
  onBack: () => void
}

export function InvoicesScreen({ onBack }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    api.get<{ trips: TripRef[] }>('/trips/mine').then(async (res) => {
      const rows: InvoiceRow[] = []
      for (const t of res.trips) {
        try {
          const inv = await api.get<{ invoice: InvoiceRow }>(`/payments/invoice/${t.id}`)
          rows.push(inv.invoice)
        } catch { /* skip */ }
      }
      setInvoices(rows)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('invoices.title')}</Text>
        <View style={{ width: 20 }} />
      </View>

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>{t('common.loading')}</Text>
      ) : (
        <FlatList
          data={invoices}
          keyExtractor={(i) => i.invoiceNo}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title={t('invoices.none')} message={t('invoices.hint')} icon="🧾" />}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.invoiceNo, { color: theme.foreground }]}>{item.invoiceNo}</Text>
                <Text style={{ color: item.settled ? theme.success : theme.warning, fontSize: 12, fontWeight: '700' }}>
                  {item.settled ? '✓ Settled' : 'Pending'}
                </Text>
              </View>
              <Text style={[styles.route, { color: theme.mutedForeground }]} numberOfLines={1}>{item.route}</Text>
              <View style={styles.breakdown}>
                <Row label={t('invoices.baseFare')} value={formatINR(item.baseAmount)} theme={theme} />
                <Row label={t('invoices.gst')} value={`+${formatINR(item.gstAmount)}`} theme={theme} />
                <Row label={t('invoices.tds')} value={`−${formatINR(item.tdsAmount)}`} theme={theme} />
                <Row label={t('invoices.netAmount')} value={formatINR(item.netAmount)} theme={theme} strong />
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  )
}

function Row({ label, value, theme, strong }: { label: string; value: string; theme: ReturnType<typeof useTheme>; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: theme.foreground, fontSize: strong ? 15 : 13, fontWeight: strong ? '800' : '500', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  invoiceNo: { fontSize: 15, fontWeight: '800' },
  route: { fontSize: 13 },
  breakdown: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: 'transparent' },
})
