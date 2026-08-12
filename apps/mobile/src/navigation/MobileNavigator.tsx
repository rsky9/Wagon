import { StatusBar } from 'expo-status-bar'
import { View, Text } from 'react-native'
import { useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ThemeContext, createTheme } from '@wagon/design'
import { I18nProvider } from '@wagon/i18n'
import { useThemeMode } from '../theme'
import { useAuth, authActions } from '../auth'
import { LoginScreen } from '../screens/LoginScreen'
import { LoadDetailScreen } from '../screens/LoadDetailScreen'
import { TripsScreen } from '../screens/TripsScreen'
import { PassbookScreen } from '../screens/PassbookScreen'
import { BankScreen } from '../screens/BankScreen'
import { DriverHomeScreen } from '../screens/DriverHomeScreen'
import { MyBidsScreen } from '../screens/MyBidsScreen'
import { FavoritesScreen } from '../screens/FavoritesScreen'
import { DisputesScreen } from '../screens/DisputesScreen'
import { RaiseDisputeScreen } from '../screens/RaiseDisputeScreen'
import { KycScreen } from '../screens/KycScreen'
import { ProfileScreen } from '../screens/ProfileScreen'
import { PostLoadScreen } from '../screens/PostLoadScreen'
import { PostLoadWizard } from '../screens/PostLoadWizard'
import { TripDetailScreen } from '../screens/TripDetailScreen'
import { TrackingScreen } from '../screens/TrackingScreen'
import { MyTrucksScreen } from '../screens/MyTrucksScreen'
import { AddTruckScreen } from '../screens/AddTruckScreen'
import { DriversScreen } from '../screens/DriversScreen'
import { RateCardScreen } from '../screens/RateCardScreen'
import { NotificationsScreen } from '../screens/NotificationsScreen'
import { QuestsScreen } from '../screens/QuestsScreen'
import { SettingsScreen } from '../screens/SettingsScreen'
import { HowWagonWorks } from '../screens/HowWagonWorks'
import { SearchScreen } from '../screens/SearchScreen'
import { FiltersScreen } from '../screens/FiltersScreen'
import { useLoadFilters, filtersActions } from '../filters'
import { FinanceScreen } from '../screens/FinanceScreen'
import { ReviewsScreen } from '../screens/ReviewsScreen'
import { TicketsScreen } from '../screens/TicketsScreen'
import { EmergencyScreen } from '../screens/EmergencyScreen'
import { ChatScreen } from '../screens/ChatScreen'
import { ChatListScreen } from '../screens/ChatListScreen'
import { TripExecutionScreen } from '../screens/TripExecutionScreen'
import { DecisionRoomScreen } from '../screens/DecisionRoomScreen'
import { BidFormScreen } from '../screens/BidFormScreen'
import { NegotiationScreen } from '../screens/NegotiationScreen'
import { TripExceptionsScreen } from '../screens/TripExceptionsScreen'
import { ReturnLoadsScreen } from '../screens/ReturnLoadsScreen'
import { TransporterOnboarding } from '../screens/TransporterOnboarding'
import { SupplierOnboarding } from '../screens/SupplierOnboarding'
import { FleetDashboardScreen } from '../screens/FleetDashboardScreen'
import { NotificationPrefsScreen } from '../screens/NotificationPrefsScreen'
import { TruckDetailScreen } from '../screens/TruckDetailScreen'
import { InvoicesScreen } from '../screens/InvoicesScreen'
import { LoadHistoryScreen } from '../screens/LoadHistoryScreen'
import { ResponsesScreen } from '../screens/ResponsesScreen'
import { BookingsScreen } from '../screens/BookingsScreen'
import { EnablementHub } from '../screens/EnablementHub'
import { ShipmentsScreen } from '../screens/ShipmentsScreen'
import { ShipmentDetailScreen } from '../screens/ShipmentDetailScreen'
import { ForwardingScreen } from '../screens/ForwardingScreen'
import { PlanningScreen } from '../screens/PlanningScreen'
import { EnablementFinanceScreen } from '../screens/EnablementFinanceScreen'
import { StorageScreen } from '../screens/StorageScreen'
import { GlobalScreen } from '../screens/GlobalScreen'
import { SplashScreen, LanguageSelection, RoleSelection, CapabilitySelection } from '@wagon/components'
import { AppLogo } from '../components/AppLogo'
import { UnifiedTabs } from './UnifiedTabs'
import { api } from '../config'
import { setUpNotificationHandlers } from '../push'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { LinkingOptions } from '@react-navigation/native'
import type { Load, LanguageCode } from '@wagon/contracts'

export type RootStackParamList = {
  UnifiedTabs: undefined
  DriverHome: undefined
  LoadDetail: { load: Load }
  TripDetail: { loadId: string }
  Track: { tripId: string }
  Kyc: undefined
  Passbook: undefined
  Bank: undefined
  MyBids: undefined
  Favorites: undefined
  Disputes: undefined
  RaiseDispute: undefined
  Notifications: undefined
  MyTrucks: undefined
  AddTruck: undefined
  Drivers: undefined
  RateCard: undefined
  Settings: undefined
  Filters: undefined
  Search: { preset?: string } | undefined
  Finance: undefined
  Reviews: undefined
  Tickets: undefined
  Emergency: undefined
  Chat: { contactName: string; contactPhone: string; contactId?: string; tripId?: string }
  Responses: undefined
  Bookings: undefined
  TripExecute: { tripId: string }
  ReturnLoads: { tripId: string }
  ChatList: undefined
  Fleet: undefined
  NotifPrefs: undefined
  TruckDetail: { truckId: string }
  Invoices: undefined
  LoadHistory: undefined
  Quests: { role: 'transporter' | 'supplier' } | undefined
  RoleChange: undefined
  PostLoadWizard: undefined
  DecisionRoom: { loadId: string }
  BidForm: { load: Load }
  Negotiation: { loadId: string }
  TripExceptions: { tripId: string }
  EnablementHub: undefined
  Shipments: undefined
  ShipmentDetail: { shipmentId: string }
  Forwarding: undefined
  Planning: undefined
  EnablementFinance: undefined
  Storage: undefined
  Global: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()

const navigationRef = createNavigationContainerRef<RootStackParamList>()

/**
 * Routes a `wagon://` deep link to the matching screen. `load/{id}` and
 * `trip/{id}` both go to TripDetail by id (safe path — LoadDetail needs a
 * full load object). Best-effort: unknown/missing params fall back safely.
 */
function navigateToUrl(nav: any, url: string) {
  if (!url) return
  const m = url.match(/^wagon:\/\/(load|trip)\/(.+)$/)
  if (m && m[2]) {
    nav.navigate('TripDetail', { loadId: m[2] })
  } else if (url.endsWith('loads')) {
    nav.navigate('UnifiedTabs', { screen: 'Marketplace' } as never)
  } else if (url.endsWith('trips')) {
    nav.navigate('UnifiedTabs', { screen: 'Trips' } as never)
  } else if (url.endsWith('kyc')) {
    nav.navigate('Kyc')
  } else if (url.endsWith('search')) {
    nav.navigate('Search', {})
  } else if (url.endsWith('notifications')) {
    nav.navigate('Notifications')
  }
}

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['wagon://'],
  config: {
    screens: {
      LoadDetail: 'load/:id',
      TripDetail: 'trip/:tripId',
      Track: 'track/:tripId',
      Kyc: 'kyc',
      Notifications: 'notifications',
      Search: 'search',
      UnifiedTabs: {
        screens: {
          Marketplace: 'loads',
          Trips: 'trips',
        },
      },
    },
  },
}

// Route wrappers (all shared stack screens)
function LoadDetailRoute({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'LoadDetail'>) {
  const load = route.params?.load
  const deepId = (route.params as { id?: string })?.id
  if (!load && deepId) {
    return <TripDetailScreen loadId={deepId} onBack={() => navigation.goBack()} onTrack={(tripId) => navigation.navigate('Track', { tripId })} />
  }
  if (!load) return null
  return <LoadDetailScreen load={load} onBack={() => navigation.goBack()} onAccepted={() => navigation.navigate('UnifiedTabs', { screen: 'Trips' } as never)} onOpenBid={() => navigation.navigate('BidForm', { load })} />
}

function TripDetailRoute({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'TripDetail'>) {
  const p = route.params as { loadId?: string; tripId?: string }
  const loadId = p?.loadId ?? p?.tripId ?? ''
  return (
    <TripDetailScreen
      loadId={loadId}
      onBack={() => navigation.goBack()}
      onTrack={(tripId) => navigation.navigate('Track', { tripId })}
      onOpenShipment={(shipmentId) => navigation.navigate('ShipmentDetail', { shipmentId })}
    />
  )
}

function TrackRoute({ route, navigation }: NativeStackScreenProps<RootStackParamList, 'Track'>) {
  return <TrackingScreen tripId={route.params.tripId} onBack={() => navigation.goBack()} />
}

function KycRoute({ navigation }: any) {
  return <KycScreen onBack={() => navigation.goBack()} />
}

function PassbookRoute({ navigation }: any) {
  return <PassbookScreen onBack={() => navigation.goBack()} />
}

function BankRoute({ navigation }: any) {
  return <BankScreen onBack={() => navigation.goBack()} />
}

function MyBidsRoute({ navigation }: any) {
  return <MyBidsScreen onBack={() => navigation.goBack()} onOpenLoad={(load) => navigation.navigate('LoadDetail', { load })} />
}

function FavoritesRoute({ navigation }: any) {
  return (
    <FavoritesScreen
      onBack={() => navigation.goBack()}
      onOpenLoad={(load) => navigation.navigate('LoadDetail', { load })}
      onRunSearch={(query) => navigation.navigate('Search', { preset: query })}
    />
  )
}

function DisputesRoute({ navigation }: any) {
  return <DisputesScreen onBack={() => navigation.goBack()} onRaise={() => navigation.navigate('RaiseDispute')} />
}

function RaiseDisputeRoute({ navigation }: any) {
  return <RaiseDisputeScreen onBack={() => navigation.goBack()} onSubmitted={() => navigation.goBack()} />
}

function NotificationsRoute({ navigation }: any) {
  return (
    <NotificationsScreen
      onBack={() => navigation.goBack()}
      onNavigate={(route) => {
        navigateToUrl(navigation, route)
      }}
    />
  )
}

function MyTrucksRoute({ navigation }: any) {
  return <MyTrucksScreen onBack={() => navigation.goBack()} onAdd={() => navigation.navigate('AddTruck')} />
}

function AddTruckRoute({ navigation }: any) {
  return <AddTruckScreen onBack={() => navigation.goBack()} onDone={() => navigation.goBack()} />
}

function DriversRoute({ navigation }: any) {
  return <DriversScreen onBack={() => navigation.goBack()} />
}

function RateCardRoute({ navigation }: any) {
  return <RateCardScreen onBack={() => navigation.goBack()} />
}
function SettingsRoute({ navigation }: any) {
  return (
    <SettingsScreen
      onBack={() => navigation.goBack()}
      onChangeRole={() => navigation.navigate('RoleChange')}
    />
  )
}

function PostLoadWizardRoute({ navigation }: any) {
  return (
    <PostLoadWizard
      onComplete={() => navigation.goBack()}
      onCancel={() => navigation.goBack()}
    />
  )
}

function DecisionRoomRoute({ navigation, route }: any) {
  return (
    <DecisionRoomScreen
      loadId={route.params?.loadId}
      onBack={() => navigation.goBack()}
      onConfirmed={() => navigation.goBack()}
      onNegotiate={() => navigation.navigate('Negotiation', { loadId: route.params?.loadId })}
    />
  )
}

function BidFormRoute({ navigation, route }: any) {
  const load = route.params?.load
  return (
    <BidFormScreen
      load={load}
      onBack={() => navigation.goBack()}
      onSubmitted={() => navigation.goBack()}
    />
  )
}

function NegotiationRoute({ navigation, route }: any) {
  return <NegotiationScreen loadId={route.params?.loadId} onBack={() => navigation.goBack()} />
}

function TripExceptionsRoute({ navigation, route }: any) {
  return <TripExceptionsScreen tripId={route.params?.tripId} onBack={() => navigation.goBack()} />
}

function EnablementHubRoute({ navigation }: any) {
  const { session } = useAuth()
  return (
    <EnablementHub
      capabilities={session?.profile?.capabilities ?? []}
      onOpen={(screen) => {
        if (screen === 'shipments') navigation.navigate('Shipments')
        else if (screen === 'forwarding') navigation.navigate('Forwarding')
        else if (screen === 'planning') navigation.navigate('Planning')
        else if (screen === 'finance') navigation.navigate('EnablementFinance')
        else if (screen === 'storage') navigation.navigate('Storage')
        else if (screen === 'global') navigation.navigate('Global')
      }}
    />
  )
}

function ShipmentsRoute({ navigation }: any) {
  return <ShipmentsScreen onBack={() => navigation.goBack()} onOpen={(shipmentId) => navigation.navigate('ShipmentDetail', { shipmentId })} />
}

function ShipmentDetailRoute({ navigation, route }: any) {
  return (
    <ShipmentDetailScreen
      shipmentId={route.params?.shipmentId}
      onBack={() => navigation.goBack()}
      onOpenLoad={(loadId) => navigation.navigate('TripDetail', { loadId })}
    />
  )
}

function ForwardingRoute({ navigation }: any) {
  return (
    <ForwardingScreen
      onBack={() => navigation.goBack()}
      onOpenShipments={() => navigation.navigate('Shipments')}
    />
  )
}

function PlanningRoute({ navigation }: any) {
  return <PlanningScreen onBack={() => navigation.goBack()} />
}

function EnablementFinanceRoute({ navigation }: any) {
  return <EnablementFinanceScreen onBack={() => navigation.goBack()} />
}

function StorageRoute({ navigation }: any) {
  return <StorageScreen onBack={() => navigation.goBack()} />
}

function GlobalRoute({ navigation }: any) {
  return <GlobalScreen onBack={() => navigation.goBack()} />
}

function RoleChangeRoute({ navigation }: any) {
  const change = async (caps: string[]) => {
    await authActions.setCapabilities(caps)
    navigation.goBack()
  }
  return <CapabilitySelection onSelect={change} />
}

function SearchRoute({ navigation, route }: any) {
  return (
    <SearchScreen
      onBack={() => navigation.goBack()}
      onSelect={(load) => navigation.navigate('LoadDetail', { load })}
      initialQuery={route.params?.preset}
    />
  )
}

function FiltersRoute({ navigation }: any) {
  const filters = useLoadFilters()
  return (
    <FiltersScreen
      initial={filters}
      onClose={() => navigation.goBack()}
      onApply={(f) => {
        filtersActions.apply(f)
        navigation.goBack()
      }}
    />
  )
}

function FinanceRoute({ navigation }: any) {
  return (
    <FinanceScreen
      onBack={() => navigation.goBack()}
      onOpenBank={() => navigation.navigate('Bank')}
      onOpenInvoices={() => navigation.navigate('Invoices')}
    />
  )
}

function ReviewsRoute({ navigation }: any) {
  return <ReviewsScreen onBack={() => navigation.goBack()} />
}

function TicketsRoute({ navigation }: any) {
  return <TicketsScreen onBack={() => navigation.goBack()} />
}

function EmergencyRoute({ navigation }: any) {
  return <EmergencyScreen onBack={() => navigation.goBack()} />
}

function ChatRoute({ navigation, route }: any) {
  return (
    <ChatScreen
      onBack={() => navigation.goBack()}
      contactName={route.params?.contactName ?? 'Contact'}
      contactPhone={route.params?.contactPhone ?? ''}
      contactId={route.params?.contactId}
      tripId={route.params?.tripId}
    />
  )
}

function ChatListRoute({ navigation }: any) {
  return (
    <ChatListScreen
      onBack={() => navigation.goBack()}
      onOpenThread={(t) => navigation.navigate('Chat', { contactName: t.otherName ?? 'Trip', contactPhone: '', tripId: t.tripId })}
    />
  )
}

function FleetRoute({ navigation }: any) {
  return (
    <FleetDashboardScreen
      onBack={() => navigation.goBack()}
      onOpenTruck={(id) => navigation.navigate('TruckDetail', { truckId: id })}
      onAddTruck={() => navigation.navigate('AddTruck')}
    />
  )
}

function NotifPrefsRoute({ navigation }: any) {
  return <NotificationPrefsScreen onBack={() => navigation.goBack()} />
}

function TruckDetailRoute({ navigation, route }: any) {
  return <TruckDetailScreen truckId={route.params?.truckId} onBack={() => navigation.goBack()} />
}

function InvoicesRoute({ navigation }: any) {
  return <InvoicesScreen onBack={() => navigation.goBack()} />
}

function LoadHistoryRoute({ navigation }: any) {
  return <LoadHistoryScreen onBack={() => navigation.goBack()} />
}

function QuestsRoute({ navigation, route }: any) {
  const role = route.params?.role as 'transporter' | 'supplier'
  return (
    <QuestsScreen
      role={role}
      onBack={() => navigation.goBack()}
      onOpenQuest={(target) => {
        if (!target) return
        navigation.navigate(target)
      }}
    />
  )
}

function ResponsesRoute({ navigation }: any) {
  return <ResponsesScreen onBack={() => navigation.goBack()} onSelectLoad={(id) => navigation.navigate('TripDetail', { loadId: id })} />
}

function BookingsRoute({ navigation }: any) {
  return <BookingsScreen onBack={() => navigation.goBack()} onSelectLoad={(id) => navigation.navigate('TripDetail', { loadId: id })} />
}

function TripExecuteRoute({ navigation, route }: any) {
  return <TripExecutionScreen tripId={route.params?.tripId} onBack={() => navigation.goBack()} onExceptions={() => navigation.navigate('TripExceptions', { tripId: route.params?.tripId })} />
}

function ReturnLoadsRoute({ navigation, route }: any) {
  return (
    <ReturnLoadsScreen
      tripId={route.params?.tripId}
      onBack={() => navigation.goBack()}
      onSelectLoad={(load) => navigation.navigate('LoadDetail', { load })}
    />
  )
}

function DriverHomeRoute({ navigation }: any) {
  return <DriverHomeScreen onOpenTrip={(tripId) => navigation.navigate('TripExecute', { tripId })} />
}

export function MobileNavigator() {
  const auth = useAuth()
  const { isDark } = useThemeMode()
  const theme = createTheme(isDark)
  const navTheme = isDark ? DarkTheme : DefaultTheme
  const [lang, setLang] = useState<LanguageCode>('en')
  const [firstRun, setFirstRun] = useState<boolean | null>(null)
  const [needRole, setNeedRole] = useState(false)
  const [showHowWorks, setShowHowWorks] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('wagon_lang'),
      AsyncStorage.getItem('wagon_first_run'),
      AsyncStorage.getItem('wagon_role'),
      AsyncStorage.getItem('wagon_onboarded'),
      AsyncStorage.getItem('wagon_capabilities'),
    ]).then(([l, fr, role, onboarded, caps]) => {
      if (l) setLang(l as LanguageCode)
      setFirstRun(fr === null)
      setNeedRole(role === null && !caps)
      setShowOnboarding(onboarded === null)
    })
  }, [])

  useEffect(() => {
    if (!auth.session) return
    setUpNotificationHandlers((url) => {
      if (navigationRef.isReady()) navigateToUrl(navigationRef, url)
    })
  }, [auth.session])

  const persistLang = (l: LanguageCode) => {
    setLang(l)
    AsyncStorage.setItem('wagon_lang', l).catch(() => {})
  }

  const finishFirstRun = () => {
    setFirstRun(false)
    AsyncStorage.setItem('wagon_first_run', 'done').catch(() => {})
  }

  const chooseRole = async (role: 'transporter' | 'supplier' | 'driver') => {
    setNeedRole(false)
    AsyncStorage.setItem('wagon_role', role).catch(() => {})
    try {
      await api.patch('/auth/role', { role })
      auth.updateRole(role)
    } catch {}
  }

  const chooseCapabilities = async (caps: string[]) => {
    setNeedRole(false)
    AsyncStorage.setItem('wagon_capabilities', JSON.stringify(caps)).catch(() => {})
    await auth.setCapabilities(caps)
    // Create the matching organization so enablement endpoints stop 403-ing.
    await auth.ensureOrganization()
  }

  const finishOnboarding = () => {
    setShowOnboarding(false)
    AsyncStorage.setItem('wagon_onboarded', 'done').catch(() => {})
  }

  // First-run: language selection
  if (firstRun === true) {
    return (
      <I18nProvider initialLang={lang} onChange={persistLang}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <LanguageSelection onDone={finishFirstRun} />
        </SafeAreaProvider>
      </I18nProvider>
    )
  }

  return (
    <I18nProvider initialLang={lang} onChange={persistLang}>
      <SafeAreaProvider>
        {auth.restoring || firstRun === null ? (
          <ThemeContext.Provider value={theme}>
            <StatusBar style="light" />
            <SplashScreen logo={require('../../assets/logo_square.png')} />
          </ThemeContext.Provider>
        ) : !auth.session ? (
          <ThemeContext.Provider value={theme}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <LoginScreen auth={auth} />
          </ThemeContext.Provider>
        ) : needRole ? showHowWorks ? (
          <ThemeContext.Provider value={theme}>
            <StatusBar style="light" />
            <HowWagonWorks onContinue={() => setShowHowWorks(false)} />
          </ThemeContext.Provider>
        ) : (
          <ThemeContext.Provider value={theme}>
            <StatusBar style="light" />
            <CapabilitySelection onSelect={chooseCapabilities} />
          </ThemeContext.Provider>
        ) : showOnboarding && auth.session.profile.role !== 'driver' && !auth.session.profile.capabilities?.some((c: string) => ['forwarder', 'warehouse', 'carrier'].includes(c)) ? (
          <ThemeContext.Provider value={theme}>
            <StatusBar style="light" />
            {auth.session.profile.role === 'supplier' ? (
              <SupplierOnboarding onComplete={finishOnboarding} onSkip={finishOnboarding} />
            ) : (
              <TransporterOnboarding onComplete={finishOnboarding} onSkip={finishOnboarding} />
            )}
          </ThemeContext.Provider>
        ) : (
          <ThemeContext.Provider value={theme}>
            <NavigationContainer ref={navigationRef} theme={navTheme} linking={linking}>
              <StatusBar style={isDark ? 'light' : 'dark'} />
              <Stack.Navigator
                screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
                initialRouteName={auth.session?.profile.capabilities?.includes('driver') && !auth.session?.profile.capabilities?.some((c: string) => c === 'supplier' || c === 'transporter') ? 'DriverHome' : 'UnifiedTabs'}
              >
                <Stack.Screen name="UnifiedTabs" component={UnifiedTabs} />
                <Stack.Screen name="DriverHome" component={DriverHomeRoute} />
                <Stack.Screen name="LoadDetail" component={LoadDetailRoute} />
                <Stack.Screen name="TripDetail" component={TripDetailRoute} />
                <Stack.Screen name="Track" component={TrackRoute} />
                <Stack.Screen name="PostLoadWizard" component={PostLoadWizardRoute} />
                <Stack.Screen name="DecisionRoom" component={DecisionRoomRoute} />
                <Stack.Screen name="BidForm" component={BidFormRoute} />
                <Stack.Screen name="Negotiation" component={NegotiationRoute} />
                <Stack.Screen name="TripExceptions" component={TripExceptionsRoute} />
                <Stack.Screen name="Kyc" component={KycRoute} />
                <Stack.Screen name="Passbook" component={PassbookRoute} />
                <Stack.Screen name="Bank" component={BankRoute} />
                <Stack.Screen name="MyBids" component={MyBidsRoute} />
                <Stack.Screen name="Favorites" component={FavoritesRoute} />
                <Stack.Screen name="Disputes" component={DisputesRoute} />
                <Stack.Screen name="RaiseDispute" component={RaiseDisputeRoute} />
                <Stack.Screen name="Notifications" component={NotificationsRoute} />
                <Stack.Screen name="MyTrucks" component={MyTrucksRoute} />
                <Stack.Screen name="AddTruck" component={AddTruckRoute} />
                <Stack.Screen name="Drivers" component={DriversRoute} />
                <Stack.Screen name="RateCard" component={RateCardRoute} />
                <Stack.Screen name="Settings" component={SettingsRoute} />
                <Stack.Screen name="Search" component={SearchRoute} />
                <Stack.Screen name="Filters" component={FiltersRoute} />
                <Stack.Screen name="Finance" component={FinanceRoute} />
                <Stack.Screen name="Reviews" component={ReviewsRoute} />
                <Stack.Screen name="Tickets" component={TicketsRoute} />
                <Stack.Screen name="Emergency" component={EmergencyRoute} />
                <Stack.Screen name="Chat" component={ChatRoute} />
                <Stack.Screen name="Responses" component={ResponsesRoute} />
                <Stack.Screen name="Bookings" component={BookingsRoute} />
                <Stack.Screen name="TripExecute" component={TripExecuteRoute} />
                <Stack.Screen name="ReturnLoads" component={ReturnLoadsRoute} />
                <Stack.Screen name="ChatList" component={ChatListRoute} />
                <Stack.Screen name="Fleet" component={FleetRoute} />
                <Stack.Screen name="NotifPrefs" component={NotifPrefsRoute} />
                <Stack.Screen name="TruckDetail" component={TruckDetailRoute} />
                <Stack.Screen name="Invoices" component={InvoicesRoute} />
                <Stack.Screen name="LoadHistory" component={LoadHistoryRoute} />
                <Stack.Screen name="Quests" component={QuestsRoute} />
                <Stack.Screen name="RoleChange" component={RoleChangeRoute} />
                <Stack.Screen name="EnablementHub" component={EnablementHubRoute} />
                <Stack.Screen name="Shipments" component={ShipmentsRoute} />
                <Stack.Screen name="ShipmentDetail" component={ShipmentDetailRoute} />
                <Stack.Screen name="Forwarding" component={ForwardingRoute} />
                <Stack.Screen name="Planning" component={PlanningRoute} />
                <Stack.Screen name="EnablementFinance" component={EnablementFinanceRoute} />
                <Stack.Screen name="Storage" component={StorageRoute} />
                <Stack.Screen name="Global" component={GlobalRoute} />
              </Stack.Navigator>
            </NavigationContainer>
          </ThemeContext.Provider>
        )}
      </SafeAreaProvider>
    </I18nProvider>
  )
}
