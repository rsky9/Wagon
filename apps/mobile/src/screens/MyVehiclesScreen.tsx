import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'
import { StatusChip, EmptyState, type StatusTone } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'

interface VehicleRow {
  id: string
  vehicleNo: string
  type: string
  activeStatus: boolean
  verificationStatus: string
  rcVerified: boolean
  origin?: string
  driver?: { name: string; mobile: string } | null
}

interface Props {
  onBack: () => void
  onAdd: () => void
  onOpenVehicle: (vehicleId: string) => void
}

const VERIFY_TONE: Record<string, StatusTone> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'danger',
  not_started: 'neutral',
}

export function MyVehiclesScreen({ onBack, onAdd, onOpenVehicle }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [vehicles, setVehicles] = useState<VehicleRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    api.get<{ vehicles: VehicleRow[] }>('/trucks').then((res) => setVehicles(res.vehicles)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const remove = (id: string, vehicleNo: string) => {
    Alert.alert('Remove vehicle', `Remove ${vehicleNo}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await api.request('DELETE', `/trucks/${id}`)
        } catch (e) {
          Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'This truck is on an active trip and cannot be removed')
        }
        fetch()
      } },
    ])
  }

  const toggle = async (id: string, current: boolean) => {
    try {
      await api.patch(`/trucks/${id}`, { activeStatus: !current })
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Could not update availability — the truck may be on an active trip')
    }
    fetch()
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('vehicles.title')}</Text>
        <Pressable onPress={onAdd}>
          <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 22 }}>+</Text>
        </Pressable>
      </View>

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>{t('common.loading')}</Text>
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(v) => v.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState title={t('vehicles.noVehicles')} message="Add your first vehicle to start taking loads" actionLabel={t('vehicles.add')} onAction={onAdd} icon="🚛" />
          }
          renderItem={({ item }) => (
            <Pressable style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => onOpenVehicle(item.id)}>
              <View style={styles.cardTop}>
                <Text style={[styles.vehicleNo, { color: theme.foreground }]}>{item.vehicleNo}</Text>
                <StatusChip label={item.activeStatus ? 'Active' : 'Inactive'} tone={item.activeStatus ? 'success' : 'neutral'} />
              </View>
              <View style={styles.metaRow}>
                <Meta label={t('vehicles.type')} value={item.type} theme={theme} />
                <Meta label={t('vehicles.origin')} value={item.origin ?? '—'} theme={theme} />
                <Meta label={t('vehicles.driver')} value={item.driver?.name ?? 'Unassigned'} theme={theme} />
              </View>
              <View style={styles.footerRow}>
                <StatusChip label={`Verify: ${item.verificationStatus.replace('_', ' ')}`} tone={VERIFY_TONE[item.verificationStatus] ?? 'neutral'} />
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <Pressable onPress={() => toggle(item.id, item.activeStatus)} hitSlop={8}>
                    <Text style={{ color: theme.primary, fontSize: 13, fontWeight: '700' }}>{item.activeStatus ? 'Set inactive' : 'Set active'}</Text>
                  </Pressable>
                  <Pressable onPress={() => remove(item.id, item.vehicleNo)} hitSlop={8}>
                    <Text style={{ color: theme.danger, fontSize: 13 }}>{t('common.remove')}</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  )
}

function Meta({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.metaLabel, { color: theme.mutedForeground }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: theme.foreground }]} numberOfLines={1}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vehicleNo: { fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  metaRow: { flexDirection: 'row', gap: spacing.md },
  metaLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { fontSize: 14, fontWeight: '600', marginTop: 1 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
})
