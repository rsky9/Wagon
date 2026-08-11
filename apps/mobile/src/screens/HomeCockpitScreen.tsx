import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, ScrollView, Pressable, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius, formatINR, shadows } from '@wagon/design'
import { AppLogo } from '../components/AppLogo'
import { ModeSwitcher } from '../components/ModeSwitcher'
import { useActiveMode } from '../mode'
import { useAuth } from '../auth'
import { api } from '../config'

interface LoadRef {
  id: string
  pickupAddr: string
  dropAddr: string
  weight: number
  distanceKm: number
  fareEstimate: number
  matchScore?: number
  material?: { name: string } | null
}

interface SupplierSummary {
  activeLoads: number
  awaitingResponses: number
  inTransit: number
  completed: number
  canPostLoad: boolean
  latestLoads: LoadRef[]
  inTransitTrips: Array<{ id: string; load: LoadRef }>
}

interface TransporterSummary {
  availableTrucks: number
  fleetSize: number
  matchingLoads: number
  recommended: LoadRef[]
  returnLoads: LoadRef[]
  truckNowAvailable: boolean
  lastTripDrop?: string | null
}

interface HomeSummary {
  capabilities: string[]
  supplier?: SupplierSummary
  transporter?: TransporterSummary
}

interface Props {
  onOpenLoad: (load: LoadRef) => void
  onOpenTrips: () => void
  onOpenMarketplace: () => void
  onPostLoad: () => void
}

export function HomeCockpitScreen({ onOpenLoad, onOpenTrips, onOpenMarketplace, onPostLoad }: Props) {
  const theme = useTheme()
  const { session } = useAuth()
  const activeMode = useActiveMode()
  const [data, setData] = useState<HomeSummary | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    api.get<HomeSummary>('/home/summary').then(setData).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const caps = session?.profile.capabilities?.length ? session.profile.capabilities : [session?.profile.role ?? '']
  const isSupplier = caps.includes('supplier')
  const isTransporter = caps.includes('transporter')
  const isBoth = isSupplier && isTransporter
  // Default surface: active mode (persisted) else supplier if available else transporter.
  const surface: 'supplier' | 'transporter' =
    activeMode === 'supplier' ? 'supplier' : activeMode === 'transporter' ? 'transporter' : isSupplier ? 'supplier' : 'transporter'
  const showSupplier = isSupplier && (surface === 'supplier' || !isBoth)
  const showTransporter = isTransporter && (surface === 'transporter' || !isBoth)

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { backgroundColor: theme.background }]}>
        <AppLogo height={38} />
      </View>

      {isBoth && (
        <View style={styles.modeWrap}>
          <ModeSwitcher />
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch(); setRefreshing(false) }} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        {loading && <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 40 }}>Loading…</Text>}

        {/* Transporter cockpit */}
        {data?.transporter && showTransporter && (
          <View style={{ gap: spacing.lg }}>
            <View style={[styles.hero, { backgroundColor: '#0B1B2B' }, shadows.lg]}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' }}>Your fleet</Text>
              <Text style={[styles.heroNum, { color: '#fff' }]}>{data.transporter.availableTrucks}<Text style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)' }}> / {data.transporter.fleetSize} trucks available</Text></Text>
              <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 6 }}>
                {data.transporter.matchingLoads} matching loads right now
              </Text>
              {data.transporter.truckNowAvailable && data.transporter.lastTripDrop && (
                <View style={[styles.heroBadge, { backgroundColor: 'rgba(249,115,22,0.35)' }]}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                    🎯 Your truck is available near {data.transporter.lastTripDrop} — find return loads
                  </Text>
                </View>
              )}
            </View>

            {data.transporter.recommended.length > 0 && (
              <>
                <SectionTitle>Recommended for you</SectionTitle>
                {data.transporter.recommended.map((l) => (
                  <LoadCard key={l.id} load={l} onPress={() => onOpenLoad(l)} theme={theme} />
                ))}
              </>
            )}

            {data.transporter.returnLoads.length > 0 && (
              <>
                <SectionTitle>Return-load opportunities</SectionTitle>
                {data.transporter.returnLoads.map((l) => (
                  <LoadCard key={l.id} load={l} onPress={() => onOpenLoad(l)} theme={theme} />
                ))}
              </>
            )}
          </View>
        )}

        {/* Supplier cockpit */}
        {data?.supplier && showSupplier && (
          <View style={{ gap: spacing.lg }}>
            <View style={[styles.hero, { backgroundColor: theme.primary }, shadows.orange]}>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' }}>Your shipments</Text>
              <Text style={[styles.heroNum, { color: '#fff' }]}>{data.supplier.activeLoads}<Text style={{ fontSize: 16, color: 'rgba(255,255,255,0.85)' }}> active loads</Text></Text>
              <View style={styles.heroStats}>
                <Stat label="Awaiting bids" value={data.supplier.awaitingResponses} />
                <Stat label="In transit" value={data.supplier.inTransit} />
                <Stat label="Completed" value={data.supplier.completed} />
              </View>
              {data.supplier.canPostLoad && (
                <Pressable style={[styles.cta, { backgroundColor: '#fff' }]} onPress={onPostLoad}>
                  <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 14 }}>+ Post a new load</Text>
                </Pressable>
              )}
            </View>

            {data.supplier.inTransitTrips.length > 0 && (
              <>
                <SectionTitle>In transit</SectionTitle>
                {data.supplier.inTransitTrips.map((t) => (
                  <LoadCard key={t.id} load={t.load} onPress={onOpenTrips} theme={theme} />
                ))}
              </>
            )}
          </View>
        )}

        {!loading && !data?.transporter && !data?.supplier && (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: spacing.lg }}>
            <Text style={{ fontSize: 48 }}>🚀</Text>
            <Text style={[styles.emptyTitle, { color: theme.foreground }]}>Welcome to Wagon</Text>
            <Text style={[styles.emptySub, { color: theme.mutedForeground }]}>
              {isTransporter
                ? 'Find loads for your fleet and start earning — browse the marketplace.'
                : 'Post your first load and get matched with verified trucks.'}
            </Text>
            {isTransporter ? (
              <Pressable style={[styles.emptyCta, { backgroundColor: theme.primary }]} onPress={onOpenMarketplace}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Browse loads</Text>
              </Pressable>
            ) : (
              <Pressable style={[styles.emptyCta, { backgroundColor: theme.primary }]} onPress={onPostLoad}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>+ Post a load</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}function SectionTitle({ children }: { children: React.ReactNode }) {
  const theme = useTheme()
  return <Text style={[styles.sectionTitle, { color: theme.foreground }]}>{children}</Text>
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 1 }}>{label}</Text>
    </View>
  )
}

function LoadCard({ load, onPress, theme }: { load: LoadRef; onPress: () => void; theme: ReturnType<typeof useTheme> }) {
  return (
    <Pressable style={[styles.loadCard, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onPress}>
      <View style={styles.loadTop}>
        <Text style={[styles.loadFare, { color: theme.foreground }]}>{formatINR(load.fareEstimate)}</Text>
        {typeof load.matchScore === 'number' && (
          <View style={[styles.matchChip, { backgroundColor: theme.success + '1A' }]}>
            <Text style={{ color: theme.success, fontSize: 12, fontWeight: '800' }}>{load.matchScore}% match</Text>
          </View>
        )}
      </View>
      <Text style={[styles.loadRoute, { color: theme.foreground }]}>{load.pickupAddr} → {load.dropAddr}</Text>
      <Text style={[styles.loadMeta, { color: theme.mutedForeground }]}>
        {load.weight}t · {load.distanceKm} km{load.material?.name ? ` · ${load.material.name}` : ''}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  modeWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  logo: { fontSize: 24, fontWeight: '800', letterSpacing: -0.02 },
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 },
  hero: { borderRadius: radius.xl, padding: spacing.xl, gap: spacing.xs },
  heroNum: { fontSize: 34, fontWeight: '800', letterSpacing: -0.02 },
  heroBadge: { borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  heroStats: { flexDirection: 'row', gap: spacing.xxl, marginTop: spacing.md },
  cta: { borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  loadCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  loadTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loadFare: { fontSize: 18, fontWeight: '800' },
  matchChip: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  loadRoute: { fontSize: 15, fontWeight: '700' },
  loadMeta: { fontSize: 13 },
  emptyTitle: { fontSize: 20, fontWeight: '800' },
  emptySub: { fontSize: 14, textAlign: 'center', paddingHorizontal: spacing.xl },
  emptyCta: { borderRadius: radius.full, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, marginTop: spacing.sm },
})
