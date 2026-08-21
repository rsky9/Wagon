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
import { subscribeDataChanged } from '../lib/dataBus'

interface LoadRef {
  id: string
  pickupAddr: string
  dropAddr: string
  weight: number
  distanceKm: number
  fareEstimate: number
  matchScore?: number
  material?: { name: string } | null
  reasons?: string[]
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
  driver?: {
    available: boolean
    activeTrip?: { id: string; load: LoadRef } | null
    todayTrips: Array<{ id: string; load: LoadRef }>
    earnings: { trips: number; earned: number }
    missingProfile: boolean
  }
  enablement?: {
    capabilities: string[]
    orgIds: string[]
    counts: { shipments: number; forwardOrders: number; facilities: number; policies: number; activePlans: number; openShipments: number }
  }
  admin?: { activeUsers: number; loadsWeek: number; openDisputes: number; liveListings: number; openRequests: number }
  alerts?: HomeAlerts
}

interface ForYou {
  capabilities: string[]
  canProvide: string[]
  canFulfill: string[]
  canRequest: string[]
  myActivity: { listings: number; openShipments: number; submittedQuotes: number }
  shipmentsForMe: Array<{ id: string; kind: string; originRef?: string | null; destinationRef?: string | null; city?: string | null; requesterOrg?: { name: string } | null }>
  capacityForMe: Array<{ id: string; kind: string; originRef?: string | null; destinationRef?: string | null; city?: string | null; price?: number | null; currency: string; providerOrg?: { name: string; verified: boolean } | null }>
}

interface Props {
  onOpenLoad: (load: LoadRef) => void
  onOpenTrips: () => void
  onOpenMarketplace: () => void
  onPostLoad: () => void
  onOpenMarket?: () => void
  onOpenMarketRequests?: () => void
  onOpenMarketMine?: () => void
  onOpenLoadFeed?: () => void
  onOpenMyLoads?: () => void
  onOpenNotifications?: () => void
  onOpenKyc?: () => void
  onOpenFleet?: () => void
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

export function HomeCockpitScreen({ onOpenLoad, onOpenTrips, onOpenMarketplace, onPostLoad, onOpenMarket, onOpenMarketRequests, onOpenMarketMine, onOpenLoadFeed, onOpenMyLoads, onOpenNotifications, onOpenKyc, onOpenFleet }: Props) {
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
    return Promise.all([
      api.get<HomeSummary>('/home/summary').then(setData).catch(() => {}).finally(() => setLoading(false)),
      api.get<{ listings: unknown[] }>('/market/listings').then((r) => setMarketCounts((c) => ({ ...c, listings: r.listings.length }))).catch(() => {}),
      api.get<{ requests: unknown[] }>('/market/requests').then((r) => setMarketCounts((c) => ({ ...c, requests: r.requests.length }))).catch(() => {}),
      api.get<ForYou>('/market/for-you').then((r) => setForYou(r)).catch(() => {}),
    ])
  }, [])
  useEffect(() => { fetch() }, [fetch])
  // Shared refresh: re-sync money/alerts whenever trips or finance change
  // elsewhere in the app (execution, escrow, payouts, claims).
  useEffect(() => {
    const unsubs = ['trips', 'finance'].map((topic) => subscribeDataChanged(topic, () => fetch()))
    return () => unsubs.forEach((u) => u())
  }, [fetch])

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
      needsAttention.push({ icon: '🛡️', text: 'Complete your KYC to unlock bookings', onPress: onOpenKyc ?? onOpenMarketplace })
    }
    for (const d of alerts.expiringDocs) {
      needsAttention.push({ icon: '📄', text: `${d.truckNo}: ${d.doc} expires in ${d.daysLeft}d`, onPress: onOpenFleet ?? onOpenMarketplace })
    }
  }
  // Setup nudges: a transporter with no fleet can't accept loads yet.
  if (showTransporter && data?.transporter && data.transporter.fleetSize === 0) {
    needsAttention.push({ icon: '🚚', text: 'Add your first vehicle to start accepting loads', onPress: onOpenFleet ?? onOpenMarketplace })
  }
  if (forYou && forYou.shipmentsForMe.length > 0) {
    const d = forYou.shipmentsForMe[0]!
    needsAttention.push({ icon: KIND_ICON[d.kind] ?? '📦', text: `${forYou.shipmentsForMe.length} open ${d.kind} shipment${forYou.shipmentsForMe.length > 1 ? 's' : ''} you can quote`, onPress: onOpenMarketRequests ?? onOpenMarket ?? onOpenMarketplace })
  }
  if (data?.supplier && data.supplier.awaitingResponses > 0) {
    needsAttention.push({ icon: '⏳', text: `${data.supplier.awaitingResponses} loads awaiting responses`, onPress: onOpenMarketplace })
  }
  if (data?.transporter?.truckNowAvailable && data.transporter.lastTripDrop) {
    needsAttention.push({ icon: '🎯', text: `Truck free near ${data.transporter.lastTripDrop} — find return loads`, onPress: onOpenTrips })
  }
  if (forYou && forYou.capacityForMe.length > 0) {
    const s = forYou.capacityForMe[0]!
    needsAttention.push({ icon: KIND_ICON[s.kind] ?? '🏗️', text: `${s.providerOrg?.name ?? 'A partner'} lists ${KIND_LABEL[s.kind] ?? s.kind}`, onPress: onOpenMarket ?? onOpenMarketplace })
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetch().finally(() => setRefreshing(false)) }} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        {loading && <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 40 }}>{t('common.loading')}</Text>}

        {/* Greeting + capabilities */}
        <Greeting name={userName ?? ''} role={`You can provide · ${(forYou?.canProvide ?? []).length > 0 ? forYou!.canProvide.map((k) => CAP_LABEL[k] ?? k).join(', ') : 'browse the network'}`} />
        {caps.length > 0 && (
          <View style={styles.capRow}>
            {caps.map((c) => <CapabilityChip key={c} label={CAP_LABEL[c] ?? c} />)}
          </View>
        )}

        {/* Quick actions */}
        <View style={styles.quickRow}>
          {isSupplier && <QuickAction icon="➕" label="Add load" onPress={onPostLoad} tone="primary" />}
          {isTransporter && onOpenLoadFeed && <QuickAction icon="🔎" label="Find loads" onPress={onOpenLoadFeed} tone="primary" />}
          {isSupplier && onOpenMyLoads && <QuickAction icon="🗂️" label="My loads" onPress={onOpenMyLoads} tone="primary" />}
          <QuickAction icon="🏬" label="Marketplace" onPress={onOpenMarketplace} tone="primary" />
          {onOpenMarketRequests && <QuickAction icon="📦" label="Post shipment" onPress={onOpenMarketRequests} tone="primary" />}
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
              onPress={onOpenFleet ?? onOpenTrips}
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
              onPress={onOpenMarketplace}
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
            <StatTile label="Fleet size" value={data.transporter.fleetSize} icon="🚚" onPress={onOpenFleet ?? onOpenMarketplace} />
            <StatTile label="Available" value={data.transporter.availableTrucks} icon="🟢" onPress={onOpenFleet ?? onOpenMarketplace} />
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
              <StatTile label="Live capacity" value={forYou.myActivity.listings} icon="🏗️" onPress={onOpenMarket} />
              <StatTile label="Open shipments" value={forYou.myActivity.openShipments} icon="📦" onPress={onOpenMarketRequests ?? onOpenMarket} />
              <StatTile label="My quotes" value={forYou.myActivity.submittedQuotes} icon="🧾" onPress={onOpenMarketMine ?? onOpenMarket} />
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

        {/* Driver surface */}
        {data?.driver && (
          <>
            <SectionHeader title="Driver" />
            <View style={[styles.driverCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {data.driver.missingProfile ? (
                <Text style={{ color: theme.warning, fontSize: 14, fontWeight: '700' }}>Ask your transporter to add your mobile number</Text>
              ) : (
                <>
                  <View style={styles.driverTop}>
                    <View>
                      <Text style={[styles.driverValue, { color: theme.foreground }]}>{formatINR(data.driver.earnings.earned)}</Text>
                      <Text style={[styles.driverLabel, { color: theme.mutedForeground }]}>Earned · {data.driver.earnings.trips} trips</Text>
                    </View>
                    <Text style={{ color: data.driver.available ? theme.success : theme.mutedForeground, fontWeight: '800' }}>
                      {data.driver.available ? '● Available' : '○ Offline'}
                    </Text>
                  </View>
                  {data.driver.activeTrip && (
                    <Pressable style={[styles.activeTrip, { backgroundColor: theme.primary }]} onPress={onOpenTrips}>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Active trip</Text>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }} numberOfLines={1}>
                        {data.driver.activeTrip.load.pickupAddr} → {data.driver.activeTrip.load.dropAddr}
                      </Text>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          </>
        )}

        {/* Enablement surface (forwarder / warehouse / carrier) */}
        {data?.enablement && (
          <>
            <SectionHeader title="Your operations" subtitle="Enablement workspace" action="Open" onAction={onOpenMarket ?? onOpenTrips} />
            <View style={styles.statRow}>
              <StatTile label="Shipments" value={data.enablement.counts.shipments} icon="📦" onPress={onOpenTrips} />
              <StatTile label="Forward orders" value={data.enablement.counts.forwardOrders} icon="🧾" onPress={onOpenTrips} />
              <StatTile label="Active plans" value={data.enablement.counts.activePlans} icon="🗺️" onPress={onOpenTrips} />
            </View>
            <View style={styles.statRow}>
              <StatTile label="Facilities" value={data.enablement.counts.facilities} icon="🏭" onPress={onOpenTrips} />
              <StatTile label="Policies" value={data.enablement.counts.policies} icon="🛡️" onPress={onOpenTrips} />
              <StatTile label="Open shipments" value={data.enablement.counts.openShipments} icon="📢" onPress={onOpenMarketRequests ?? onOpenTrips} />
            </View>
          </>
        )}

        {/* Admin surface */}
        {data?.admin && (
          <>
            <SectionHeader title="Platform" subtitle="Admin overview" />
            <View style={styles.statRow}>
              <StatTile label="Active users" value={data.admin.activeUsers} icon="👤" onPress={onOpenTrips} />
              <StatTile label="Loads (7d)" value={data.admin.loadsWeek} icon="📦" onPress={onOpenTrips} />
              <StatTile label="Open disputes" value={data.admin.openDisputes} icon="⚖️" onPress={onOpenTrips} />
            </View>
            <View style={styles.statRow}>
              <StatTile label="Live capacity" value={data.admin.liveListings} icon="🏗️" onPress={onOpenMarket} />
              <StatTile label="Open shipments" value={data.admin.openRequests} icon="📦" onPress={onOpenMarketRequests ?? onOpenMarket} />
              <StatTile label="Marketplace" value={data.admin.liveListings} icon="📦" onPress={onOpenMarket} />
            </View>
          </>
        )}

        {!loading && !data?.transporter && !data?.supplier && !data?.driver && !data?.enablement && !data?.admin && (
          <View style={{ alignItems: 'center', paddingTop: 40, gap: spacing.lg }}>
            {onOpenMarket ? (
              <>
                <Text style={{ fontSize: 48 }}>📦</Text>
                <Text style={[styles.emptyTitle, { color: theme.foreground }]}>Capability marketplace</Text>
                <Text style={[styles.emptySub, { color: theme.mutedForeground }]}>
                  {marketCounts ? `${marketCounts.listings ?? 0} capacity · ${marketCounts.requests ?? 0} shipments` : 'Browse & post across every capability'}
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
      {load.reasons?.[0] ? (
        <Text style={[styles.loadReason, { color: theme.primary }]} numberOfLines={1}>{load.reasons[0]}</Text>
      ) : null}
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
  loadReason: { fontSize: 12, fontWeight: '700' },
  driverCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  driverTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  driverValue: { fontSize: 24, fontWeight: '800' },
  driverLabel: { fontSize: 12, fontWeight: '600' },
  activeTrip: { borderRadius: radius.lg, padding: spacing.md, gap: 2 },
  loadTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loadFare: { fontSize: 18, fontWeight: '800' },
  matchChip: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  loadRoute: { fontSize: 15, fontWeight: '700' },
  loadMeta: { fontSize: 13 },
  emptyTitle: { fontSize: 20, fontWeight: '800' },
  emptySub: { fontSize: 14, textAlign: 'center', paddingHorizontal: spacing.xl },
  emptyCta: { borderRadius: radius.full, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, marginTop: spacing.sm },
})
