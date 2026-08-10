import { Image, StyleSheet } from 'react-native'
import { useThemeMode } from '../theme'

interface Props {
  /** Height in dp for the wide lockup, or size for the square launcher asset. */
  height?: number
  square?: boolean
  /** Force a wordmark variant. 'auto' follows the active theme. */
  variant?: 'auto' | 'white' | 'dark'
}

/**
 * Theme-aware brand logo.
 * - Dark/navy backgrounds -> white wordmark (`logo_dark.png`)
 * - Light backgrounds -> dark wordmark (`logo_light.png`)
 * Pass `variant="white"` to force the white wordmark on fixed-dark surfaces.
 */
export function AppLogo({ height = 28, square = false, variant = 'auto' }: Props) {
  const { isDark } = useThemeMode()
  const white = variant === 'white' || (variant === 'auto' && isDark)
  const source = square
    ? require('../../assets/logo_square.png')
    : white
      ? require('../../assets/logo_dark.png')
      : require('../../assets/logo_light.png')
  const aspect = white ? 1163 / 278 : 1311 / 325
  const style = square
    ? { width: height, height }
    : { width: height * aspect, height }
  return <Image source={source} style={[style, styles.img]} resizeMode="contain" />
}

const styles = StyleSheet.create({
  img: {},
})
