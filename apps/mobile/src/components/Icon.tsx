import type { ComponentProps } from 'react'
import { StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { toneFor, type ToneKey } from '@wagon/design'
import { useThemeMode } from '../theme'

type IoniconName = ComponentProps<typeof Ionicons>['name']

/** The app's icon vocabulary — semantic keys mapped to Ionicons glyphs (outline by default, -sharp filled variant). */
export const ICONS = {
  load: 'cube-outline' as const,
  truck: 'car-sport-outline' as const,
  truckLarge: 'car-sport' as const,
  shipment: 'cube-outline' as const,
  warehouse: 'business-outline' as const,
  facility: 'business-outline' as const,
  carrier: 'boat-outline' as const,
  vessel: 'boat-outline' as const,
  forwarding: 'swap-horizontal-outline' as const,
  freight: 'cube-outline' as const,
  container: 'cube-outline' as const,
  insurance: 'shield-checkmark-outline' as const,
  shield: 'shield-checkmark-outline' as const,
  kyc: 'shield-checkmark-outline' as const,
  alert: 'warning-outline' as const,
  bell: 'notifications-outline' as const,
  booking: 'calendar-outline' as const,
  doc: 'document-text-outline' as const,
  invoice: 'receipt-outline' as const,
  receipt: 'receipt-outline' as const,
  money: 'cash-outline' as const,
  wallet: 'wallet-outline' as const,
  bank: 'business-outline' as const,
  card: 'card-outline' as const,
  search: 'search-outline' as const,
  plus: 'add-circle-outline' as const,
  target: 'locate-outline' as const,
  pending: 'time-outline' as const,
  done: 'checkmark-circle-outline' as const,
  check: 'checkmark-circle-outline' as const,
  active: 'radio-button-on' as const,
  user: 'person-outline' as const,
  userFilled: 'person' as const,
  home: 'home-outline' as const,
  homeFilled: 'home' as const,
  shipmentFilled: 'cube' as const,
  truckFilled: 'car-sport' as const,
  walletFilled: 'wallet' as const,
  fleet: 'car-sport-outline' as const,
  driver: 'person-circle-outline' as const,
  crew: 'people-outline' as const,
  route: 'map-outline' as const,
  map: 'map-outline' as const,
  bid: 'briefcase-outline' as const,
  quote: 'chatbubble-outline' as const,
  chat: 'chatbubble-outline' as const,
  messages: 'chatbubbles-outline' as const,
  star: 'star-outline' as const,
  rate: 'star-outline' as const,
  dispute: 'scale-outline' as const,
  balance: 'scale-outline' as const,
  support: 'headset-outline' as const,
  ticket: 'ticket-outline' as const,
  emergency: 'warning-outline' as const,
  returns: 'return-down-back-outline' as const,
  handover: 'hand-left-outline' as const,
  customs: 'shield-outline' as const,
  globe: 'globe-outline' as const,
  country: 'globe-outline' as const,
  trade: 'document-text-outline' as const,
  edi: 'sync-outline' as const,
  integrations: 'extension-puzzle-outline' as const,
  webhook: 'link-outline' as const,
  plan: 'map-outline' as const,
  leg: 'trail-sign-outline' as const,
  fleetmaint: 'construct-outline' as const,
  wrench: 'construct-outline' as const,
  arrow: 'arrow-forward-outline' as const,
  chevron: 'chevron-forward-outline' as const,
  empty: 'cube-outline' as const,
  rocket: 'rocket-outline' as const,
  notification: 'notifications-outline' as const,
  notificationOff: 'notifications-off-outline' as const,
  megaphone: 'megaphone-outline' as const,
  bookmark: 'bookmark-outline' as const,
  prefs: 'settings-outline' as const,
  settings: 'settings-outline' as const,
  favorite: 'heart-outline' as const,
  heart: 'heart-outline' as const,
  logout: 'log-out-outline' as const,
  menu: 'menu-outline' as const,
  back: 'arrow-back-outline' as const,
  close: 'close-outline' as const,
  info: 'information-circle-outline' as const,
  help: 'help-circle-outline' as const,
  location: 'location-outline' as const,
  pin: 'location-outline' as const,
  odo: 'timer-outline' as const,
  clock: 'time-outline' as const,
  calendar: 'calendar-outline' as const,
  camera: 'camera-outline' as const,
  upload: 'cloud-upload-outline' as const,
  download: 'cloud-download-outline' as const,
  scan: 'scan-outline' as const,
  otp: 'key-outline' as const,
  lock: 'lock-closed-outline' as const,
  security: 'shield-checkmark-outline' as const,
  split: 'cut-outline' as const,
  merge: 'git-merge-outline' as const,
  layers: 'layers-outline' as const,
  network: 'git-network-outline' as const,
  grid: 'grid-outline' as const,
  eye: 'eye-outline' as const,
  hide: 'eye-off-outline' as const,
} as const

export type IconName = keyof typeof ICONS

/** Resolve a semantic key to its vector glyph, or null when it isn't part of the vocabulary. */
export function glyphName(key: string): IoniconName | null {
  const name = ICONS[key as IconName]
  return (name as IoniconName) ?? null
}

/** Themed vector icon — renders a glyph from the semantic vocabulary at any size/color. */
export function Icon({ name, size = 22, color, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <Ionicons name={ICONS[name]} size={size} color={color} style={style} />
}

/**
 * Render any icon value: semantic keys map to themed vector glyphs, anything
 * else (legacy emoji) is rendered as text — so surfaces can adopt the vector
 * vocabulary incrementally without breaking old callers.
 */
export function Glyph({ icon, size = 18, color, style }: { icon: string; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  const name = glyphName(icon)
  if (name) return <Ionicons name={name} size={size} color={color} style={style} />
  return <Text style={[{ fontSize: size, lineHeight: size * 1.2 }, style]}>{icon}</Text>
}

/** Themed circular icon tile — the shared presentation for glyphs across the app. */
export function IconTile({
  icon,
  tone = 'primary' as ToneKey,
  size = 34,
  radius: borderRadius,
  style,
}: {
  icon: string
  tone?: ToneKey
  size?: number
  radius?: number
  style?: StyleProp<ViewStyle>
}) {
  const { isDark } = useThemeMode()
  const t = toneFor(tone, isDark)
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: borderRadius ?? size / 2,
          backgroundColor: t.bg,
          borderColor: t.border,
          borderWidth: 1,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
        },
        style,
      ]}
    >
      <Glyph icon={icon} size={size * 0.52} color={t.fg} />
    </View>
  )
}

export default Icon