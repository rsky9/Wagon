export const palette = {
  // Neutrals (slate ramp)
  slate50: '#F8FAFC',
  slate100: '#F1F5F9',
  slate200: '#E2E8F0',
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate500: '#64748B',
  slate600: '#475569',
  slate700: '#334155',
  slate800: '#1E293B',
  slate900: '#0F172A',
  slate950: '#020617',

  // Brand orange ramp
  orange50: '#FFF7ED',
  orange100: '#FFEDD5',
  orange200: '#FED7AA',
  orange300: '#FDBA74',
  orange400: '#FB923C',
  orange500: '#F97316',
  orange600: '#EA580C',
  orange700: '#C2410C',
  orange800: '#9A3412',
  orange900: '#7C2D12',
  orange950: '#431407',

  // Semantic
  success: '#10B981',
  successDark: '#047857',
  warning: '#F59E0B',
  danger: '#EF4444',
  dangerDark: '#B91C1C',
  info: '#3B82F6',
  infoDark: '#1D4ED8',
} as const

export type PaletteKey = keyof typeof palette

export const lightTheme = {
  background: palette.slate50,
  foreground: palette.slate900,
  card: '#FFFFFF',
  cardForeground: palette.slate900,
  muted: palette.slate100,
  mutedForeground: palette.slate500,
  primary: palette.orange500,
  primaryForeground: '#FFFFFF',
  primaryHover: palette.orange600,
  accent: palette.orange50,
  accentForeground: palette.orange700,
  secondary: palette.slate100,
  secondaryForeground: palette.slate900,
  destructive: palette.danger,
  border: palette.slate200,
  ring: palette.orange400,
  success: palette.success,
  warning: palette.warning,
  danger: palette.danger,
  info: palette.info,
  // Chart
  chart1: palette.orange500,
  chart2: palette.slate900,
  chart3: palette.warning,
  chart4: palette.success,
  chart5: palette.info,
} as const

export const darkTheme = {
  background: palette.slate950,
  foreground: palette.slate50,
  card: palette.slate900,
  cardForeground: palette.slate50,
  muted: palette.slate800,
  mutedForeground: palette.slate400,
  primary: palette.orange500,
  primaryForeground: '#FFFFFF',
  primaryHover: palette.orange600,
  accent: '#2A1603',
  accentForeground: palette.orange300,
  secondary: palette.slate800,
  secondaryForeground: palette.slate100,
  destructive: palette.danger,
  border: 'rgba(255,255,255,0.10)',
  ring: palette.orange400,
  success: palette.success,
  warning: palette.warning,
  danger: palette.danger,
  info: palette.info,
  chart1: palette.orange500,
  chart2: palette.orange300,
  chart3: palette.warning,
  chart4: palette.success,
  chart5: palette.info,
} as const

export type Theme = {
  [K in keyof typeof lightTheme]: string
}

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 40,
} as const

export const radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  full: 9999,
} as const

export const typography = {
  // Display
  display1: { fontSize: 48, lineHeight: 54, fontWeight: '800' },
  display2: { fontSize: 40, lineHeight: 46, fontWeight: '800' },
  display3: { fontSize: 34, lineHeight: 40, fontWeight: '800' },
  // Title
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  // Heading
  heading1: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  heading2: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  // Body
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyMedium: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  bodySemibold: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  // Label
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  labelMedium: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  labelSemibold: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  // Caption
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  captionMedium: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  captionMuted: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  // Small / micro
  small: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  // Amount (tabular focus)
  amount: { fontSize: 22, lineHeight: 28, fontWeight: '800' },
  amountLarge: { fontSize: 32, lineHeight: 38, fontWeight: '800' },
  amountDisplay: { fontSize: 40, lineHeight: 46, fontWeight: '800' },
} as const

export const shadows = {
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 6,
  },
  orange: {
    shadowColor: '#F97316',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
} as const

export const fontFamilies = {
  regular: undefined, // system default
  medium: undefined,
  semibold: undefined,
  bold: undefined,
  mono: 'monospace',
} as const

export const touchTarget = {
  min: 48,
  moneyButton: 56,
} as const

export const gradients = {
  brand: ['#F97316', '#FB923C'] as const,
  navy: ['#0F172A', '#1E293B'] as const,
  navyDeep: ['#020617', '#0F172A'] as const,
  success: ['#10B981', '#34D399'] as const,
  warning: ['#F59E0B', '#FBBF24'] as const,
} as const

/**
 * Semantic colour codes — the app's shared icon/tile tint language. Each tone
 * carries a background, foreground (glyph/text) and border for BOTH themes so
 * emoji glyphs and tinted tiles stay legible on dark surfaces. Call
 * `toneFor('primary', isDark)` to resolve the active palette.
 */
export const tones = {
  primary: {
    light: { bg: 'rgba(249,115,22,0.12)', fg: palette.orange700, border: 'rgba(249,115,22,0.30)' },
    dark: { bg: 'rgba(249,115,22,0.20)', fg: palette.orange300, border: 'rgba(249,115,22,0.45)' },
  },
  success: {
    light: { bg: 'rgba(16,185,129,0.12)', fg: palette.successDark, border: 'rgba(16,185,129,0.30)' },
    dark: { bg: 'rgba(16,185,129,0.20)', fg: '#6EE7B7', border: 'rgba(16,185,129,0.45)' },
  },
  warning: {
    light: { bg: 'rgba(245,158,11,0.14)', fg: '#B45309', border: 'rgba(245,158,11,0.35)' },
    dark: { bg: 'rgba(245,158,11,0.20)', fg: '#FBBF24', border: 'rgba(245,158,11,0.45)' },
  },
  danger: {
    light: { bg: 'rgba(239,68,68,0.12)', fg: palette.dangerDark, border: 'rgba(239,68,68,0.30)' },
    dark: { bg: 'rgba(239,68,68,0.20)', fg: '#FCA5A5', border: 'rgba(239,68,68,0.45)' },
  },
  info: {
    light: { bg: 'rgba(59,130,246,0.12)', fg: palette.infoDark, border: 'rgba(59,130,246,0.30)' },
    dark: { bg: 'rgba(59,130,246,0.20)', fg: '#93C5FD', border: 'rgba(59,130,246,0.45)' },
  },
  muted: {
    light: { bg: palette.slate100, fg: palette.slate600, border: palette.slate200 },
    dark: { bg: palette.slate800, fg: palette.slate300, border: 'rgba(255,255,255,0.10)' },
  },
  navy: {
    light: { bg: 'rgba(15,23,42,0.08)', fg: palette.slate700, border: 'rgba(15,23,42,0.20)' },
    dark: { bg: 'rgba(148,163,184,0.12)', fg: palette.slate200, border: 'rgba(148,163,184,0.30)' },
  },
} as const

export type ToneKey = keyof typeof tones
export type ToneVariant = { bg: string; fg: string; border: string }

export function toneFor(key: ToneKey, dark = false): ToneVariant {
  return tones[key][dark ? 'dark' : 'light']
}

export function createTheme(dark = false): Theme {
  return dark ? darkTheme : lightTheme
}
