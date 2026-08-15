import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, ScrollView, Pressable, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius, formatINR, shadows, gradients } from '@wagon/design'
import { AppLogo } from '../components/AppLogo'
import { ModeSwitcher } from '../components/ModeSwitcher'
import { useActiveMode } from '../mode'
import { useI18n } from '@wagon/i18n'
import { useAuth } from '../auth'
import { api } from '../config'
import { Greeting, KpiCard, QuickAction, SectionHeader, StatTile, CapabilityChip } from '../components/ui'

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
  money?: { escrowPaid: number; wallet: number }
}

interface TransporterSummary {
  availableTrucks: number
  fleetSize: number
  matchingLoads: number
  recommended: LoadRef[]
  returnLoads: LoadRef[]
  truckNowAvailable: boolean
  lastTripDrop?: string | null
  money?: { payoutPending: number; collected: number; wallet: number }
}

interface HomeAlerts {
  unreadNotifications: number
  kycPending: boolean
  activeExceptions: number
  pendingBookings: number
  expiringDocs: Array<{ truckNo: string; doc: string; daysLeft: number }>
}

interface HomeSummary {
  capabilities: string[]
  supplier?: SupplierSummary
  transporter?: TransporterSummary
  alerts?: HomeAlerts
}

interface ForYou {
  capabilities: string[]
  canOffer: string[]
  canFulfill: string[]
  canGet: string[]
  myLive: { listings: number; openRequests: number; submittedQuotes: number }
  demandForMe: Array<{ id: string; kind: string; originRef?: string | null; destinationRef?: string | null; city?: string | null; requesterOrg?: { name: string } | null }>
  supplyForMe: Array<{ id: string; kind: string; originRef?: string | null; destinationRef?: string | null; city?: string | null; price?: number | null; currency: string; providerOrg?: { name: string; verified: boolean } | null }>
}

interface Props {
  onOpenLoad: (load: LoadRef) => void
  onOpenTrips: () => void
  onOpenMarketplace: () => void
  onPostLoad: () => void
  onOpenMarket?: () => void
  onOpenNotifications?: () => void
}

const CAP_LABEL: Record<string, string> = {
  supplier: 'Shipper',
  transporter: 'Transporter',
  forwarder: 'Forwarder',
  warehouse: 'Warehouse',
  carrier: 'Carrier',
  driver: 'Driver',
}

const KIND_LABEL: Record<string, string> = {
  truck_capacity: 'Truck capacity',
  warehouse_space: 'Warehouse space',
  carrier_service: 'Carrier space',
  forwarder_service: 'Forwarder service',
  transport: 'Transport',
  warehouse: 'Warehouse',
  forwarding: 'Forwarding',
  carrier: 'Carrier',
  insurance: 'Insurance',
}

const KIND_ICON: Record<string, string> = {
  truck_capacity: '🚚', warehouse_space: '🏭', carrier_service: '🚢', forwarder_service: '📦',
  transport: '🚚', warehouse: '🏭', forwarding: '📦', carrier: '🚢', insurance: '🛡️',
}

export function HomeCockpitScreen({ onOpenLoad, onOpenTrips, onOpenMarketplace, onPostLoad, onOpenMarket, onOpenNotifications }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const { session } = useAuth()
  const activeMode = useActiveMode()
  const [data, setData] = useState<HomeSummary | null>(null)
  const [marketCounts, setMarketCounts] = useState<{ listings?: number; requests?: number } | null>(null)
  const [forYou, setForYou] = useState<ForYou | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    api.get<HomeSummary>('/home/summary').then(setData).catch(() => {}).finally(() => setLoading(false))
    api.get<{ listings: unknown[] }>('/market/listings').then((r) => setMarketCounts((c) => ({ ...c, listings: r.listings.length }))).catch(() => {})
    api.get<{ requests: unknown[] }>('/market/requests').then((r) => setMarketCounts((c) => ({ ...c, requests: r.requests.length }))).catch(() => {})
    api.get<ForYou>('/market/for-you').then((r) => setForYou(r)).catch(() => {})
  }, [])
  useEffect(() => { fetch() }, [fetch])

  const caps = session?.profile.capabilities?.length ? session.profile.capabilities : [session?.profile.role ?? '']
  const isSupplier = caps.includes('supplier')
  const isTransporter = caps.includes('transporter')
  const isBoth = isSupplier && isTransporter
  const surface: 'supplier' | 'transporter' =
    activeMode === 'supplier' ? 'supplier' : activeMode === 'transporter' ? 'transporter' : isSupplier ? 'supplier' : 'transporter'
  const showSupplier = isSupplier && (surface === 'supplier' || !isBoth)
  const showTransporter = isTransporter && (surface === 'transporter' || !isBoth)

  const userName = session?.profile?.name
  const needsAttention: Array<{ icon: string; text: string; onPress: () => void }> = []
  const alerts = data?.alerts
  if (alerts) {
    if (alerts.unreadNotifications > 0) {
      needsAttention.push({ icon: '🔔', text: `${alerts.unreadNotifications} unread notification${alerts.unreadNotifications > 1 ? 's' : ''}`, onPress: onOpenNotifications ?? onOpenTrips })
    }
    if (alerts.pendingBookings > 0) {
      needsAttention.push({ icon: '📋', text: `${alerts.pendingBookings} booking${alerts.pendingBookings > 1 ? 's' : ''} waiting for your confirmation`, onPress: onOpenTrips })
    }
    if (alerts.activeExceptions > 0) {
      needsAttention.push({ icon: '⚠️', text: `${alerts.activeExceptions} open exception${alerts.activeExceptions > 1 ? 's' : ''} need attention`, onPress: onOpenTrips })
    }
    if (alerts.kycPending) {
      needsAttention.push({ icon: '🛡️', text: 'Complete your KYC to unlock bookings', onPress: onOpenMarketplace })
    }
    for (const d of alerts.expiringDocs) {
      needsAttention.push({ icon: '📄', text: `${d.truckNo}: ${d.doc} expires in ${d.daysLeft}d`, onPress: onOpenMarketplace })
    }
  }
  if (forYou && forYou.demandForMe.length > 0) {
    const d = forYou.demandForMe[0]!
    needsAttention.push({ icon: KIND_ICON[d.kind] ?? '📢', text: `${forYou.demandForMe.length} open ${d.kind} demand you can quote`, onPress: onOpenMarket ?? onOpenMarketplace })
  }
  if (data?.supplier && data.supplier.awaitingResponses > 0) {
    needsAttention.push({ icon: '⏳', text: `${data.supplier.awaitingResponses} loads awaiting responses`, onPress: onOpenMarketplace })
  }
  if (data?.transporter?.truckNowAvailable && data.transporter.lastTripDrop) {
    needsAttention.push({ icon: '🎯', text: `Truck free near ${data.transporter.lastTripDrop} — find return loads`, onPress: onOpenTrips })
  }
  if (forYou && forYou.supplyForMe.length > 0) {
    const s = forYou.supplyForMe[0]!
    needsAttention.push({ icon: KIND_ICON[s.kind] ?? '🏪', text: `${s.providerOrg?.name ?? 'A partner'} offers ${KIND_LABEL[s.kind] ?? s.kind}`, onPress: onOpenMarket ?? onOpenMarketplace })
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { backgroundColor: theme.background }]}>
        <AppLogo height={38} />
        {onOpenNotifications && (
          <Pressable onPress={onOpenNotifications} hitSlop={8} style={styles.bellWrap}>
            <Text style={{ fontSize: 20 }}>🔔</Text>
            {(data?.alerts?.unreadNotifications ?? 0) > 0 && (
              <View style={[styles.bellDot, { backgroundColor: theme.danger }]}>
                <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{Math.min(data!.alerts!.unreadNotifications, 9)}</Text>
              </View>
            )}
          </Pressable>
        )}
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
        {loading && <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 40 }}>{t('common.loading')}</Text>}

        {/* Greeting + capabilities */}
        <Greeting name={userName ?? ''} role={`You can offer · ${(forYou?.canOffer ?? []).length > 0 ? forYou!.canOffer.map((k) => CAP_LABEL[k] ?? k).join(', ') : 'browse the network'}`} />
        {caps.length > 0 && (
          <View style={styles.capRow}>
            {caps.map((c) => <CapabilityChip key={c} label={CAP_LABEL[c] ?? c} />)}
          </View>
        )}

        {/* Quick actions */}
        <View style={styles.quickRow}>
          <QuickAction icon="➕" label="Post load" onPress={onPostLoad} tone="orange" />
          <QuickAction icon="🔎" label="Find loads" onPress={onOpenMarketplace} tone="navy" />
          {onOpenMarket && <QuickAction icon="🏪" label="Offer" onPress={onOpenMarket} tone="blue" />}
          {onOpenMarket && <QuickAction icon="📢" label="Need" onPress={onOpenMarket} tone="green" />}
        </View>

        {/* KPI hero grid */}
        <View style={styles.kpiGrid}>
          {showTransporter && data?.transporter && (
            <KpiCard
              label={t('home.yourFleet')}
              value={`${data.transporter.availableTrucks}/${data.transporter.fleetSize}`}
              sub={`${data.transporter.matchingLoads} matching loads`}
              gradient={gradients.navy}
              icon="🚚"
              onPress={onOpenTrips}
              style={styles.kpiFlex}
            />
          )}
          {showSupplier && data?.supplier && (
            <KpiCard
              label={t('home.yourShipments')}
              value={`${data.supplier.activeLoads}`}
              sub={`${data.supplier.inTransit} in transit`}
              gradient={['#F97316', '#FB923C']}
              icon="📦"
              onPress={onPostLoad}
              style={styles.kpiFlex}
            />
          )}
        </View>

        {/* Money strip (role-aware) */}
        {(showTransporter && data?.transporter?.money) || (showSupplier && data?.supplier?.money) ? (
          <View style={[styles.moneyStrip, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {showTransporter && data?.transporter?.money && (
              <>
                <View style={styles.moneyCell}>
                  <Text style={[styles.moneyLabel, { color: theme.mutedForeground }]}>Pending payout</Text>
                  <Text style={[styles.moneyValue, { color: theme.primary }]}>{formatINR(data.transporter.money.payoutPending)}</Text>
                </View>
                <View style={styles.moneyCell}>
                  <Text style={[styles.moneyLabel, { color: theme.mutedForeground }]}>Collected</Text>
                  <Text style={[styles.moneyValue, { color: theme.foreground }]}>{formatINR(data.transporter.money.collected)}</Text>
                </View>
                <View style={styles.moneyCell}>
                  <Text style={[styles.moneyLabel, { color: theme.mutedForeground }]}>Wallet</Text>
                  <Text style={[styles.moneyValue, { color: theme.success }]}>{formatINR(data.transporter.money.wallet)}</Text>
                </View>
              </>
            )}
            {showSupplier && data?.supplier?.money && (
              <>
                <View style={styles.moneyCell}>
                  <Text style={[styles.moneyLabel, { color: theme.mutedForeground }]}>Escrow paid</Text>
                  <Text style={[styles.moneyValue, { color: theme.primary }]}>{formatINR(data.supplier.money.escrowPaid)}</Text>
                </View>
                <View style={styles.moneyCell}>
                  <Text style={[styles.moneyLabel, { color: theme.mutedForeground }]}>Wallet</Text>
                  <Text style={[styles.moneyValue, { color: theme.success }]}>{formatINR(data.supplier.money.wallet)}</Text>
                </View>
              </>
            )}
          </View>
        ) : null}

        {/* Secondary stats */}
        {showSupplier && data?.supplier && (
          <View style={styles.statRow}>
            <StatTile label="Awaiting bids" value={data.supplier.awaitingResponses} icon="⏳" onPress={onOpenMarketplace} />
            <StatTile label="In transit" value={data.supplier.inTransit} icon="🚚" onPress={onOpenTrips} />
            <StatTile label="Completed" value={data.supplier.completed} icon="✅" onPress={onOpenMarketplace} />
          </View>
        )}
        {showTransporter && data?.transporter && (
          <View style={styles.statRow}>
            <StatTile label="Matching loads" value={data.transporter.matchingLoads} icon="🎯" onPress={onOpenMarketplace} />
            <StatTile label="Fleet size" value={data.transporter.fleetSize} icon="🚚" onPress={onOpenMarketplace} />
            <StatTile label="Available" value={data.transporter.availableTrucks} icon="🟢" onPress={onOpenMarketplace} />
          </View>
        )}

        {/* Needs your attention */}
        {needsAttention.length > 0 && (
          <>
            <SectionHeader title="Needs your attention" />
            <View style={[styles.alertCard, { backgroundColor: 'rgba(249,115,22,0.08)', borderColor: '#F97316' }]}>
              {needsAttention.map((a, i) => (
                <Pressable key={i} style={styles.alertRow} onPress={a.onPress}>
                  <Text style={{ fontSize: 16 }}>{a.icon}</Text>
                  <Text style={[styles.alertText, { color: theme.foreground }]}>{a.text}</Text>
                  <Text style={{ color: '#F97316', fontWeight: '800' }}>›</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* For you marketplace summary */}
        {onOpenMarket && forYou && (
          <>
            <SectionHeader title="Your market" subtitle="Capability marketplace" action="Open" onAction={onOpenMarket} />
            <View style={styles.marketGrid}>
              <StatTile label="Live offers" value={forYou.myLive.listings} icon="🏪" onPress={onOpenMarket} />
              <StatTile label="Open needs" value={forYou.myLive.openRequests} icon="📢" onPress={onOpenMarket} />
              <StatTile label="My quotes" value={forYou.myLive.submittedQuotes} icon="🧾" onPress={onOpenMarket} />
            </View>
          </>
        )}

        {/* Recommended / return loads */}
        {showTransporter && data?.transporter && data.transporter.recommended.length > 0 && (
          <>
            <SectionHeader title={t('home.recommended')} action="Browse" onAction={onOpenMarketplace} />
            {data.transporter.recommended.map((l) => <LoadCard key={l.id} load={l} onPress={() => onOpenLoad(l)} theme={theme} />)}
          </>
        )}
        {showTransporter && data?.transporter && data.transporter.returnLoads.length > 0 && (
          <>
            <SectionHeader title={t('home.returnLoads')} action="View" onAction={onOpenTrips} />
            {data.transporter.returnLoads.map((l) => <LoadCard key={l.id} load={l} onPress={() => onOpenLoad(l)} theme={theme} />)}
          </>
        )}

        {!loading && !data?.transporter && !data?.supplier && (
          <View style={{ alignItems: 'center', paddingTop: 40, gap: spacing.lg }}>
            {onOpenMarket ? (
              <>
                <Text style={{ fontSize: 48 }}>🏪</Text>
                <Text style={[styles.emptyTitle, { color: theme.foreground }]}>Capability marketplace</Text>
                <Text style={[styles.emptySub, { color: theme.mutedForeground }]}>
                  {marketCounts ? `${marketCounts.listings ?? 0} supply · ${marketCounts.requests ?? 0} demand` : 'Browse & post across every capability'}
                </Text>
                <Pressable style={[styles.emptyCta, { backgroundColor: theme.primary }]} onPress={onOpenMarket}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Open marketplace</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 48 }}>🚀</Text>
                <Text style={[styles.emptyTitle, { color: theme.foreground }]}>{t('home.welcome')}</Text>
                <Text style={[styles.emptySub, { color: theme.mutedForeground }]}>{t('home.pickCapability')}</Text>
                <Pressable style={[styles.emptyCta, { backgroundColor: theme.primary }]} onPress={isTransporter ? onOpenMarketplace : onPostLoad}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{isTransporter ? t('home.browseLoads') : t('load.postNew')}</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function LoadCard({ load, onPress, theme }: { load: LoadRef; onPress: () => void; theme: ReturnType<typeof useTheme> }) {
  return (
    <Pressable style={({ pressed }) => [styles.loadCard, { backgroundColor: theme.card, borderColor: theme.border }, shadows.sm, pressed && { opacity: 0.94 }]} onPress={onPress}>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  bellWrap: { position: 'relative' },
  bellDot: { position: 'absolute', top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  modeWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  body: { padding: spacing.lg, paddingBottom: 140 },
  capRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  quickRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  kpiGrid: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  kpiFlex: { flex: 1 },
  moneyStrip: { flexDirection: 'row', borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, marginBottom: spacing.md, gap: spacing.md },
  moneyCell: { flex: 1 },
  moneyLabel: { fontSize: 11, fontWeight: '600' },
  moneyValue: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  statRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xs },
  marketGrid: { flexDirection: 'row', gap: spacing.md },
  alertCard: { borderRadius: radius.lg, borderWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  alertText: { flex: 1, fontSize: 14, fontWeight: '600' },
  loadCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.md },
  loadTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loadFare: { fontSize: 18, fontWeight: '800' },
  matchChip: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  loadRoute: { fontSize: 15, fontWeight: '700' },
  loadMeta: { fontSize: 13 },
  emptyTitle: { fontSize: 20, fontWeight: '800' },
  emptySub: { fontSize: 14, textAlign: 'center', paddingHorizontal: spacing.xl },
  emptyCta: { borderRadius: radius.full, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, marginTop: spacing.sm },
})
