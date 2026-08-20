import { Text, View, StyleProp, ViewStyle } from 'react-native'
import { toneFor, type ToneKey } from '@wagon/design'
import { useThemeMode } from '../theme'

/**
 * The app's icon vocabulary. Emoji glyphs (the product is emoji-native) mapped
 * to stable semantic keys so surfaces share one icon language instead of
 * re-inventing glyphs per screen.
 */
export const G: Record<string, string> = {
  load: '📦',
  truck: '🚚',
  truckLarge: '🚛',
  shipment: '📦',
  warehouse: '🏭',
  facility: '🏭',
  carrier: '🚢',
  vessel: '🚢',
  forwarding: '📦',
  freight: '📦',
  container: '🧱',
  insurance: '🛡️',
  shield: '🛡️',
  kyc: '🛡️',
  alert: '⚠️',
  bell: '🔔',
  booking: '📋',
  doc: '📄',
  invoice: '🧾',
  receipt: '🧾',
  money: '💰',
  wallet: '👛',
  bank: '🏦',
  card: '💳',
  search: '🔎',
  plus: '➕',
  target: '🎯',
  pending: '⏳',
  done: '✅',
  check: '✅',
  active: '🟢',
  user: '👤',
  fleet: '🚚',
  driver: '🧑‍✈️',
  crew: '🧑‍✈️',
  route: '🗺️',
  map: '🗺️',
  bid: '💼',
  quote: '💬',
  chat: '💬',
  messages: '💬',
  star: '⭐',
  rate: '⭐',
  dispute: '⚖️',
  balance: '⚖️',
  support: '🎧',
  ticket: '🎫',
  emergency: '🆘',
  returns: '↩️',
  handover: '🤝',
  customs: '🏛️',
  globe: '🌐',
  country: '🌐',
  trade: '📃',
  edi: '🔄',
  integrations: '🔌',
  webhook: '🪝',
  plan: '🗺️',
  leg: '🛣️',
  fleetmaint: '🔧',
  wrench: '🔧',
  arrow: '➜',
  chevron: '›',
  empty: '📦',
  rocket: '🚀',
  notification: '🔔',
  prefs: '⚙️',
  settings: '⚙️',
  favorite: '❤️',
  heart: '❤️',
  logout: '⎋',
  menu: '☰',
  back: '←',
  close: '✕',
  info: 'ℹ️',
  help: '❓',
  location: '📍',
  pin: '📍',
  odo: '⏲️',
  clock: '🕐',
  calendar: '📅',
  camera: '📷',
  upload: '⬆️',
  download: '⬇️',
  scan: '📷',
  otp: '🔐',
  lock: '🔒',
  security: '🔐',
  split: '✂️',
  merge: '🔀',
  layers: '🗂️',
  network: '🕸️',
  grid: '🔲',
  eye: '👁️',
  hide: '🙈',
}

/** Resolve a glyph by key, falling back to the glyph itself when it's already an emoji. */
export function glyph(key: string): string {
  return G[key] ?? key
}

/** A themed circular icon tile — the shared presentation for emoji glyphs across the app. */
export function IconTile({
  icon,
  tone = 'primary',
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
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={{ fontSize: size * 0.52 }}>{glyph(icon)}</Text>
    </View>
  )
}