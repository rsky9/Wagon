import { Image, StyleSheet } from 'react-native'
import { useThemeMode } from '../theme'

interface Props {
  /** Height in dp for the wide lockup, or size for the square launcher asset. */
  height?: number
  square?: boolean
}

/**
 * Theme-aware brand logo.
 * - Dark theme (navy backgrounds) -> white wordmark variant (1.svg)
 * - Light theme (light backgrounds) -> dark wordmark variant (2.svg)
 */
export function AppLogo({ height = 28, square = false }: Props) {
  const { isDark } = useThemeMode()
  const source = square
    ? require('../../assets/logo_square.png')
    : isDark
      ? require('../../assets/logo_dark.png')
      : require('../../assets/logo_light.png')
  const aspect = isDark ? 1163 / 278 : 1311 / 325
  const style = square
    ? { width: height, height }
    : { width: height * aspect, height }
  return <Image source={source} style={[style, styles.img]} resizeMode="contain" />
}

const styles = StyleSheet.create({
  img: {},
})
