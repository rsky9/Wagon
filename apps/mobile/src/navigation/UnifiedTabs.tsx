import { View, Text, StyleSheet, Pressable } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createTheme, useTheme, spacing, radius } from '@wagon/design'
import { useThemeMode } from '../theme'
import { useI18n } from '@wagon/i18n'
import { useAuth } from '../auth'
import { RupeeIcon } from '../components/RupeeIcon'
import { HomeCockpitScreen } from '../screens/HomeCockpitScreen'
import { DriverHomeScreen } from '../screens/DriverHomeScreen'
import { MarketScreen } from '../screens/MarketScreen'
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
  Marketplace: '📦',
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
  const { session } = useAuth()
  const caps = session?.profile.capabilities?.length ? session.profile.capabilities : [session?.profile.role ?? '']
  const isDriverOnly = caps.includes('driver') && !caps.some((c) => c === 'supplier' || c === 'transporter')
  if (isDriverOnly) {
    return <DriverHomeScreen onOpenTrip={(tripId) => root?.navigate('TripExecute', { tripId })} />
  }
  return (
    <HomeCockpitScreen
      onOpenLoad={(load) => root?.navigate('LoadDetail', { load })}
      onOpenTrips={() => navigation.navigate('Trips')}
      onOpenMarketplace={() => navigation.navigate('Marketplace')}
      onPostLoad={() => root?.navigate('PostLoadWizard')}
      onOpenMarket={() => root?.navigate('Market')}
      onOpenMarketRequests={() => root?.navigate('Market', { initialTab: 'requests' } as never)}
      onOpenMarketMine={() => root?.navigate('Market', { initialTab: 'mine' } as never)}
      onOpenLoadFeed={() => root?.navigate('LoadFeed')}
      onOpenMyLoads={() => root?.navigate('MyLoads')}
      onOpenNotifications={() => root?.navigate('Notifications')}
      onOpenKyc={() => root?.navigate('Kyc')}
      onOpenFleet={() => root?.navigate('Fleet')}
    />
  )
}

/** Marketplace is the cross-type capability exchange and is shown to EVERY
 *  user type from the nav bar. The classic road-load feed and "My loads" live
 *  on the Home screen quick actions, not here — so a supplier, transporter or
 *  enablement user always sees the same marketplace surface. */
function MarketplaceTab({ navigation }: any) {
  const { session } = useAuth()
  const caps = session?.profile.capabilities?.length ? session.profile.capabilities : [session?.profile.role ?? '']
  return <MarketScreen onBack={() => navigation.navigate('Home')} capabilities={caps} />
}

function TripsTab({ navigation }: any) {
  const root = navigation.getParent()
  const { session } = useAuth()
  return (
    <TripsScreen
      onBack={() => navigation.navigate('Home')}
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
      onOpenTrucks={() => root?.navigate('MyVehicles')}
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
      onOpenQuests={() => root?.navigate('Quests')}
      onOpenSaved={() => root?.navigate('Favorites')}
      onOpenBids={() => root?.navigate('MyBids')}
      onOpenDisputes={() => root?.navigate('Disputes')}
      onOpenEnablement={() => root?.navigate('EnablementHub')}
      onOpenMarket={() => root?.navigate('Market')}
      onOpenAddressBook={() => root?.navigate('AddressBook')}
      onOpenLaneAlerts={() => root?.navigate('LaneAlerts')}
    />
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
