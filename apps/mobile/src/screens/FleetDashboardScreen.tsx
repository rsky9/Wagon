import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert as RNAlert } from 'react-native'
import { useTheme, spacing, radius, formatINR } from '@wagon/design'
import { StatusChip, EmptyState, type StatusTone } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'

interface Alert {
  vehicleId: string
  vehicleNo: string
  kind: string
  daysLeft: number | null
  critical: boolean
}

interface FleetData {
  vehicles: Array<{ id: string; vehicleNo: string; type: string; activeStatus: boolean; verificationStatus: string; driver?: { name: string } | null }>
  alerts: Alert[]
  summary: { active: number; inactive: number; verified: number; unverified: number; expiringSoon: number; expired: number }
}

interface FleetOverview {
  fleet: { vehicles: number; activeVehicles: number; verifiedVehicles: number; activeTrips: number }
  drivers: { total: number; active: number; verified: number }
  coverage: { assignedTrips: number; totalTrips: number; driverCoverage: number }
  earnings: number
}

interface Props {
  onBack: () => void
  onOpenVehicle: (vehicleId: string) => void
  onAddVehicle: () => void
  onOpenDrivers: () => void
}

const VERIFY_TONE: Record<string, StatusTone> = { approved: 'success', pending: 'warning', rejected: 'danger', not_started: 'neutral' }

export function FleetDashboardScreen({ onBack, onOpenVehicle, onAddVehicle, onOpenDrivers }: Props) {
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

  const toggleAvailability = async (id: string, _current: boolean) => {
    try {
      await api.patch(`/trucks/${id}`, { activeStatus: !_current })
    } catch (e) {
      RNAlert.alert('Could not update', e instanceof Error ? e.message : 'This truck is on an active trip and cannot be toggled')
    }
    fetch()
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('fleet.title')}</Text>
        <Pressable onPress={onAddVehicle}><Text style={{ color: theme.primary, fontSize: 22, fontWeight: '800' }}>+</Text></Pressable>
      </View>

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>{t('common.loading')}</Text>
      ) : (
        <FlatList
          data={data?.vehicles ?? []}
          keyExtractor={(v) => v.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View>
              <View style={styles.summaryRow}>
                <Summary label="Active" value={data?.summary.active ?? 0} color={theme.success} theme={theme} />
                <Summary label="Verified" value={data?.summary.verified ?? 0} color={theme.primary} theme={theme} />
                <Summary label="Expiring" value={data?.summary.expiringSoon ?? 0} color={theme.warning} theme={theme} />
                <Summary label="Expired" value={data?.summary.expired ?? 0} color={theme.danger} theme={theme} />
              </View>

              {overview && (
                <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, marginBottom: spacing.lg }]}>
                  <Text style={[styles.sectionLabel, { color: theme.mutedForeground }]}>Fleet overview</Text>
                  <View style={styles.summaryRow}>
                    <Summary label="Active trips" value={overview.fleet.activeTrips} color={theme.primary} theme={theme} />
                    <Summary label="Verified vehicles" value={overview.fleet.verifiedVehicles} color={theme.success} theme={theme} />
                    <Summary label="Driver coverage" value={Math.round(overview.coverage.driverCoverage * 100)} color={theme.warning} theme={theme} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View>
                      <Text style={{ color: theme.foreground, fontSize: 22, fontWeight: '800' }}>₹{overview.earnings.toLocaleString('en-IN')}</Text>
                      <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>Total earned from delivered trips</Text>
                    </View>
                    {onOpenDrivers && (
                      <Pressable onPress={onOpenDrivers} style={[styles.driversBtn, { borderColor: theme.border }]}>
                        <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '700' }}>Drivers ({overview.drivers.active}/{overview.drivers.total})</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}

              {(data?.alerts ?? []).length > 0 && (
                <View style={styles.alerts}>
                  <Text style={[styles.sectionLabel, { color: theme.mutedForeground }]}>{t('fleet.docExpiry')}</Text>
                  {data!.alerts.map((a, i) => (
                    <Pressable key={i} style={[styles.alert, { backgroundColor: a.critical ? theme.danger + '1A' : theme.warning + '1A', borderColor: a.critical ? theme.danger + '44' : theme.warning + '44' }]} onPress={() => onOpenVehicle(a.vehicleId)}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: a.critical ? theme.danger : theme.warning, fontWeight: '700', fontSize: 14 }}>{a.vehicleNo}</Text>
                        <Text style={{ color: theme.mutedForeground, fontSize: 13 }}>{a.kind} {a.critical ? (a.kind === 'verification' ? 'needs verification' : 'expired') : `expires in ${a.daysLeft}d`}</Text>
                      </View>
                      <Text style={{ color: a.critical ? theme.danger : theme.warning, fontWeight: '800' }}>›</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Text style={[styles.sectionLabel, { color: theme.mutedForeground }]}>{t('fleet.allVehicles')}</Text>
            </View>
          }
          ListEmptyComponent={<EmptyState title={t('fleet.noVehicles')} message={t('fleet.addFirst')} actionLabel={t('fleet.add')} onAction={onAddVehicle} icon="🚛" />}
          renderItem={({ item }) => (
            <Pressable style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => onOpenVehicle(item.id)}>
              <View style={styles.cardTop}>
                <Text style={[styles.vehicleNo, { color: theme.foreground }]}>{item.vehicleNo}</Text>
                <StatusChip label={item.activeStatus ? 'Active' : 'Inactive'} tone={item.activeStatus ? 'success' : 'neutral'} />
              </View>
              <Text style={[styles.meta, { color: theme.mutedForeground }]}>
                {item.type} · Driver: {item.driver?.name ?? 'Unassigned'}
              </Text>
              <View style={styles.actions}>
                <StatusChip label={`${item.verificationStatus.replace('_', ' ')}`} tone={VERIFY_TONE[item.verificationStatus] ?? 'neutral'} />
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
  vehicleNo: { fontSize: 17, fontWeight: '800' },
  meta: { fontSize: 13 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggle: { borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  driversBtn: { borderRadius: radius.sm, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
})
