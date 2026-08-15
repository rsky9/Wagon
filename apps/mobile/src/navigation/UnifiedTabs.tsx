import { useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createTheme, useTheme, spacing, radius } from '@wagon/design'
import { useThemeMode } from '../theme'
import { useI18n } from '@wagon/i18n'
import { useAuth } from '../auth'
import { useActiveMode } from '../mode'
import { useLoadFilters } from '../filters'
import { AppLogo } from '../components/AppLogo'
import { RupeeIcon } from '../components/RupeeIcon'
import { HomeCockpitScreen } from '../screens/HomeCockpitScreen'
import { LoadFeedScreen } from '../screens/LoadFeedScreen'
import { MarketScreen } from '../screens/MarketScreen'
import { MyLoads } from '../screens/MyLoadsScreen'
import { TripsScreen } from '../screens/TripsScreen'
import { PassbookScreen } from '../screens/PassbookScreen'
import { ProfileScreen } from '../screens/ProfileScreen'
import type { LoadFilters } from '../screens/FiltersScreen'

export type UnifiedTabParamList = {
  Home: undefined
  Marketplace: undefined
  Trips: undefined
  Finance: undefined
  Account: undefined
}

const Tab = createBottomTabNavigator<UnifiedTabParamList>()

const TAB_ICONS: Record<string, string> = {
  Home: '🏠',
  Marketplace: '🧭',
  Trips: '🚚',
  Finance: '💰',
  Account: '👤',
}

function baseTabOptions(theme: ReturnType<typeof createTheme>) {
  return {
    headerShown: false,
    tabBarActiveTintColor: theme.primary,
    tabBarInactiveTintColor: theme.mutedForeground,
    tabBarStyle: {
      backgroundColor: 'transparent',
      borderTopWidth: 0,
      elevation: 0,
      height: 90,
      position: 'absolute' as const,
      left: 0,
      right: 0,
      bottom: 0,
    },
    tabBarLabelStyle: { fontSize: 11, fontWeight: '600' as const },
  }
}

const TAB_LABEL_KEY: Record<string, string> = {
  Home: 'nav.home',
  Marketplace: 'nav.marketplace',
  Trips: 'nav.trips',
  Finance: 'nav.finance',
  Account: 'nav.account',
}

/** Floating pill tab bar — a raised, rounded navigation dock. */
function FloatingTabBar({ state, descriptors, navigation }: any) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { t } = useI18n()
  return (
    <View style={[styles.floatingWrap, { bottom: Math.max(insets.bottom, spacing.md) }]}>
      <View style={[styles.floatingBar, styles.floatingShadow]}>
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key]
          const isFocused = state.index === index
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name)
          }
          const label = t(TAB_LABEL_KEY[route.name] ?? route.name) ?? options.tabBarLabel ?? options.title ?? route.name
          return (
            <Pressable key={route.key} style={styles.floatingTab} onPress={onPress} accessibilityRole="button" accessibilityState={isFocused ? { selected: true } : {}}>
              <View style={[styles.floatingIcon, isFocused && { backgroundColor: 'rgba(249,115,22,0.22)' }]}>
                {route.name === 'Finance' ? (
                  <RupeeIcon size={20} filled={isFocused} color="#FDBA74" />
                ) : (
                  <Text style={[styles.floatingIconText, { opacity: isFocused ? 1 : 0.55 }]}>{TAB_ICONS[route.name] ?? '•'}</Text>
                )}
                {isFocused && <View style={[styles.floatingIndicator, { backgroundColor: '#F97316' }]} />}
              </View>
              <Text style={[styles.floatingLabel, { color: isFocused ? '#fff' : 'rgba(255,255,255,0.6)' }, isFocused && { fontWeight: '800' }]}>
                {typeof label === 'string' ? label : route.name}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function HomeTab({ navigation }: any) {
  const root = navigation.getParent()
  return (
    <HomeCockpitScreen
      onOpenLoad={(load) => root?.navigate('LoadDetail', { load })}
      onOpenTrips={() => navigation.navigate('Trips')}
      onOpenMarketplace={() => navigation.navigate('Marketplace')}
      onPostLoad={() => root?.navigate('PostLoadWizard')}
      onOpenMarket={() => root?.navigate('Market')}
    />
  )
}

/** Marketplace adapts: transporters browse the feed, suppliers manage their loads. */
function MarketplaceTab({ navigation }: any) {
  const { t } = useI18n()
  const { session, logout } = useAuth()
  const activeMode = useActiveMode()
  const filters = useLoadFilters()
  const caps = session?.profile.capabilities?.length ? session.profile.capabilities : [session?.profile.role ?? '']
  const isSupplier = caps.includes('supplier')
  const isTransporter = caps.includes('transporter')
  // Sync the working surface with the persisted active mode.
  const initialMode = activeMode === 'supplier' ? 'myloads' : 'browse'
  const [mode, setMode] = useState<'browse' | 'myloads'>(isTransporter ? initialMode : 'myloads')
  const root = navigation.getParent()

  if (isTransporter && isSupplier) {
    return (
      <View style={{ flex: 1 }}>
        <SafeAreaTop>
          <View style={styles.marketHeader}>
            <AppLogo height={22} />
          </View>
          <View style={styles.segWrap}>
            <Segmented
              value={mode}
              onChange={setMode}
              left={{ key: 'browse', label: t('nav.browse') }}
              right={{ key: 'myloads', label: t('nav.myLoads') }}
            />
          </View>
        </SafeAreaTop>
        {mode === 'browse' ? (
          <LoadFeedScreen
            onSelect={(load) => root?.navigate('LoadDetail', { load })}
            onOpenTrips={() => navigation.navigate('Trips')}
            onOpenKyc={() => root?.navigate('Kyc')}
            filters={filters}
            onOpenFilters={() => root?.navigate('Filters')}
            embedded
          />
        ) : (
          <MyLoads
            onPostLoad={() => root?.navigate('PostLoadWizard')}
            onLogout={logout}
            onSelectLoad={(loadId) => root?.navigate('TripDetail', { loadId })}
            onOpenKyc={() => root?.navigate('Kyc')}
            onOpenDecisionRoom={(loadId) => root?.navigate('DecisionRoom', { loadId })}
            embedded
          />
        )}
      </View>
    )
  }

  if (isTransporter) {
    return (
      <LoadFeedScreen
        onSelect={(load) => root?.navigate('LoadDetail', { load })}
        onOpenTrips={() => navigation.navigate('Trips')}
        onOpenKyc={() => root?.navigate('Kyc')}
        filters={filters}
        onOpenFilters={() => root?.navigate('Filters')}
      />
    )
  }

  // Suppliers see their own loads. Transporters see the load feed. Everyone
  // else (forwarder/warehouse/carrier/enablement) sees the cross-type capability
  // marketplace — the road-load feed isn't actionable for them.
  if (isSupplier) {
    return (
      <MyLoads
        onPostLoad={() => root?.navigate('PostLoadWizard')}
        onLogout={logout}
        onSelectLoad={(loadId) => root?.navigate('TripDetail', { loadId })}
        onOpenKyc={() => root?.navigate('Kyc')}
        onOpenDecisionRoom={(loadId) => root?.navigate('DecisionRoom', { loadId })}
      />
    )
  }

  if (isTransporter) {
    return (
      <LoadFeedScreen
        onSelect={(load) => root?.navigate('LoadDetail', { load })}
        onOpenTrips={() => navigation.navigate('Trips')}
        onOpenKyc={() => root?.navigate('Kyc')}
        filters={filters}
        onOpenFilters={() => root?.navigate('Filters')}
      />
    )
  }

  // Enablement-only users (no supplier/transporter capability): cross-type market.
  return <MarketScreen onBack={() => navigation.navigate('Home')} capabilities={caps} />
}

function TripsTab({ navigation }: any) {
  const root = navigation.getParent()
  const { session } = useAuth()
  return (
    <TripsScreen
      onBack={() => navigation.navigate('Home')}
      onOpenPassbook={() => root?.navigate('Passbook')}
      onOpenExecution={(tripId) => root?.navigate('TripExecute', { tripId })}
      onReturnLoads={(tripId) => root?.navigate('ReturnLoads', { tripId })}
      capabilities={session?.profile?.capabilities ?? []}
    />
  )
}

function FinanceTab({ navigation }: any) {
  const root = navigation.getParent()
  return <PassbookScreen onBack={() => navigation.navigate('Home')} onOpenBank={() => root?.navigate('Bank')} onOpenInvoices={() => root?.navigate('Invoices')} />
}

function AccountTab({ navigation }: any) {
  const { logout } = useAuth()
  const root = navigation.getParent()
  return (
    <ProfileScreen
      onOpenKyc={() => root?.navigate('Kyc')}
      onLogout={logout}
      onOpenTrucks={() => root?.navigate('MyTrucks')}
      onOpenDrivers={() => root?.navigate('Drivers')}
      onOpenRateCard={() => root?.navigate('RateCard')}
      onOpenNotifications={() => root?.navigate('Notifications')}
      onOpenSettings={() => root?.navigate('Settings')}
      onOpenSearch={() => root?.navigate('Search')}
      onOpenFinance={() => root?.navigate('Finance')}
      onOpenReviews={() => root?.navigate('Reviews')}
      onOpenTickets={() => root?.navigate('Tickets')}
      onOpenEmergency={() => root?.navigate('Emergency')}
      onOpenChat={() => root?.navigate('ChatList')}
      onOpenFleet={() => root?.navigate('Fleet')}
      onOpenNotifPrefs={() => root?.navigate('NotifPrefs')}
      onOpenInvoices={() => root?.navigate('Invoices')}
      onOpenLoadHistory={() => root?.navigate('LoadHistory')}
      onOpenQuests={() => root?.navigate('Quests', { role: 'transporter' })}
      onOpenSaved={() => root?.navigate('Favorites')}
      onOpenBids={() => root?.navigate('MyBids')}
      onOpenDisputes={() => root?.navigate('Disputes')}
      onOpenEnablement={() => root?.navigate('EnablementHub')}
      onOpenMarket={() => root?.navigate('Market')}
    />
  )
}
function SafeAreaTop({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets()
  return <View style={{ paddingTop: insets.top }}>{children}</View>
}

function Segmented({ value, onChange, left, right }: { value: string; onChange: (v: any) => void; left: { key: string; label: string }; right: { key: string; label: string } }) {
  const theme = useTheme()
  return (
    <View style={[styles.seg, { backgroundColor: theme.muted, borderColor: theme.border }]}>
      {[left, right].map((o) => {
        const active = value === o.key
        return (
          <Pressable
            key={o.key}
            style={[styles.segBtn, active && { backgroundColor: theme.primary }]}
            onPress={() => onChange(o.key)}
          >
            <Text style={[styles.segLabel, active ? { color: '#fff', fontWeight: '800' } : { color: theme.mutedForeground, fontWeight: '700' }]}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function UnifiedTabs() {
  const { isDark } = useThemeMode()
  const theme = createTheme(isDark)
  return (
    <Tab.Navigator tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={({ route }) => ({ ...baseTabOptions(theme) })}>
      <Tab.Screen name="Home" component={HomeTab} />
      <Tab.Screen name="Marketplace" component={MarketplaceTab} />
      <Tab.Screen name="Trips" component={TripsTab} />
      <Tab.Screen name="Finance" component={FinanceTab} />
      <Tab.Screen name="Account" component={AccountTab} />
    </Tab.Navigator>
  )
}

const styles = StyleSheet.create({
  seg: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 4,
    overflow: 'hidden',
  },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.lg },
  segLabel: { fontSize: 14, textAlign: 'center' },
  segWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  marketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  floatingWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  floatingBar: {
    flexDirection: 'row',
    borderRadius: radius.xxl,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.lg,
    backgroundColor: '#0B1B2B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  floatingTab: { flex: 1, alignItems: 'center', gap: 3 },
  floatingIcon: { width: 46, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  floatingIconText: { fontSize: 19 },
  floatingIndicator: { position: 'absolute', bottom: 0, width: 6, height: 3, borderRadius: 2 },
  floatingLabel: { fontSize: 10, fontWeight: '600' },
  floatingShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
})
