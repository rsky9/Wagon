import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'
import { StatusChip, EmptyState, type StatusTone } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'

interface Alert {
  truckId: string
  truckNo: string
  kind: string
  daysLeft: number | null
  critical: boolean
}

interface FleetData {
  trucks: Array<{ id: string; truckNo: string; type: string; activeStatus: boolean; driver?: { name: string } | null }>
  alerts: Alert[]
  summary: { active: number; inactive: number; expiringSoon: number; expired: number }
}

interface FleetOverview {
  fleet: { trucks: number; activeTrucks: number; activeTrips: number }
  drivers: { total: number; active: number }
  coverage: { assignedTrips: number; totalTrips: number; driverCoverage: number }
  earnings: number
}

interface Props {
  onBack: () => void
  onOpenTruck: (truckId: string) => void
  onAddTruck: () => void
}

export function FleetDashboardScreen({ onBack, onOpenTruck, onAddTruck }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [data, setData] = useState<FleetData | null>(null)
  const [overview, setOverview] = useState<FleetOverview | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    api.get<FleetData>('/trucks/fleet/dashboard').then(setData).catch(() => {}).finally(() => setLoading(false))
    api.get<FleetOverview>('/trucks/fleet/overview').then(setOverview).catch(() => {})
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const toggleAvailability = async (id: string, current: boolean) => {
    await api.patch(`/trucks/${id}`, { activeStatus: !current }).catch(() => {})
    fetch()
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('fleet.title')}</Text>
        <Pressable onPress={onAddTruck}><Text style={{ color: theme.primary, fontSize: 22, fontWeight: '800' }}>+</Text></Pressable>
      </View>

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>{t('common.loading')}</Text>
      ) : (
        <FlatList
          data={data?.trucks ?? []}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View>
              <View style={styles.summaryRow}>
                <Summary label={t('fleet.active')} value={data?.summary.active ?? 0} color={theme.success} theme={theme} />
                <Summary label={t('fleet.inactive')} value={data?.summary.inactive ?? 0} color={theme.mutedForeground} theme={theme} />
                <Summary label={t('fleet.expiring')} value={data?.summary.expiringSoon ?? 0} color={theme.warning} theme={theme} />
                <Summary label={t('fleet.expired')} value={data?.summary.expired ?? 0} color={theme.danger} theme={theme} />
              </View>

              {overview && (
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: spacing.lg }]}>
                  <Text style={[styles.sectionLabel, { color: theme.mutedForeground }]}>Fleet overview</Text>
                  <View style={styles.summaryRow}>
                    <Summary label="Active trips" value={overview.fleet.activeTrips} color={theme.primary} theme={theme} />
                    <Summary label="Active trucks" value={overview.fleet.activeTrucks} color={theme.success} theme={theme} />
                    <Summary label="Driver coverage" value={Math.round(overview.coverage.driverCoverage * 100)} color={theme.warning} theme={theme} />
                  </View>
                  <View style={{ marginTop: spacing.sm }}>
                    <Text style={{ color: theme.foreground, fontSize: 22, fontWeight: '800' }}>₹{overview.earnings.toLocaleString()}</Text>
                    <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>Total earned from delivered trips</Text>
                  </View>
                </View>
              )}

              {(data?.alerts ?? []).length > 0 && (
                <View style={styles.alerts}>
                  <Text style={[styles.sectionLabel, { color: theme.mutedForeground }]}>{t('fleet.docExpiry')}</Text>
                  {data!.alerts.map((a, i) => (
                    <View key={i} style={[styles.alert, { backgroundColor: a.critical ? theme.danger + '1A' : theme.warning + '1A', borderColor: a.critical ? theme.danger + '44' : theme.warning + '44' }]}>
                      <Text style={{ color: a.critical ? theme.danger : theme.warning, fontWeight: '700', fontSize: 14 }}>{a.truckNo}</Text>
                      <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>{a.kind} {a.critical ? 'expired' : `expires in ${a.daysLeft}d`}</Text>
                    </View>
                  ))}
                </View>
              )}

              <Text style={[styles.sectionLabel, { color: theme.mutedForeground }]}>{t('fleet.allTrucks')}</Text>
            </View>
          }
          ListEmptyComponent={<EmptyState title={t('fleet.noTrucks')} message={t('fleet.addFirst')} actionLabel={t('fleet.add')} onAction={onAddTruck} icon="🚛" />}
          renderItem={({ item }) => (
            <Pressable style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => onOpenTruck(item.id)}>
              <View style={styles.cardTop}>
                <Text style={[styles.truckNo, { color: theme.foreground }]}>{item.truckNo}</Text>
                <StatusChip label={item.activeStatus ? 'Active' : 'Inactive'} tone={item.activeStatus ? 'success' : 'neutral'} />
              </View>
              <Text style={[styles.meta, { color: theme.mutedForeground }]}>
                {item.type} · Driver: {item.driver?.name ?? 'Unassigned'}
              </Text>
              <View style={styles.actions}>
                <Pressable onPress={() => toggleAvailability(item.id, item.activeStatus)} style={[styles.toggle, { borderColor: theme.border }]}>
                  <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '700' }}>
                    {item.activeStatus ? 'Set inactive' : 'Set active'}
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  )
}

function Summary({ label, value, color, theme }: { label: string; value: number; color: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: theme.mutedForeground }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  list: { padding: spacing.lg, gap: spacing.md },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  summaryCard: { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, alignItems: 'center' },
  summaryValue: { fontSize: 22, fontWeight: '800' },
  summaryLabel: { fontSize: 11, marginTop: 1 },
  alerts: { marginBottom: spacing.lg },
  sectionLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  alert: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, padding: spacing.md, marginBottom: spacing.sm },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  truckNo: { fontSize: 17, fontWeight: '800' },
  meta: { fontSize: 13 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  toggle: { borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
})
