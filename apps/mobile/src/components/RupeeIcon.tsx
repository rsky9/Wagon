import { View, Text, StyleSheet } from 'react-native'
import { useTheme, radius } from '@wagon/design'

interface Props {
  size?: number
  /** Fill the badge with the brand orange; otherwise outline style. */
  filled?: boolean
  /** Icon glyph color when not filled. */
  color?: string
}

/**
 * India-specific rupee icon — a bold ₹ in a rounded badge.
 * Used in the nav bar, account rows, quests and notifications instead of
 * generic money emoji (💰/💵/💲) which aren't rupee-specific.
 */
export function RupeeIcon({ size = 28, filled = false, color }: Props) {
  const theme = useTheme()
  const glyphColor = filled ? '#fff' : (color ?? theme.primary)
  const bg = filled ? theme.primary : 'transparent'
  const border = filled ? 'transparent' : theme.primary + '55'
  const glyphSize = Math.round(size * 0.66)

  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2.6, backgroundColor: bg, borderColor: border },
        !filled && { borderWidth: 1.5 },
      ]}
    >
      <Text
        style={[
          styles.glyph,
          { color: glyphColor, fontSize: glyphSize, lineHeight: size, minHeight: size },
        ]}
        adjustsFontSizeToFit
        numberOfLines={1}
      >
        ₹
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
  glyph: { fontWeight: '900', includeFontPadding: false, textAlign: 'center' },
})
