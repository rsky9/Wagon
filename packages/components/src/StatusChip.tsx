import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme, radius, spacing, typography } from '@wagon/design'

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand'

const TONE_COLOR: Record<StatusTone, (t: import('@wagon/design').Theme) => string> = {
  success: (t) => t.success,
  warning: (t) => t.warning,
  danger: (t) => t.danger,
  info: (t) => t.info,
  neutral: (t) => t.mutedForeground,
  brand: (t) => t.primary,
}

interface Props {
  label: string
  tone?: StatusTone
  dot?: boolean
}

export function StatusChip({ label, tone = 'neutral', dot = true }: Props) {
  const theme = useTheme()
  const color = TONE_COLOR[tone](theme)
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: color + '1A',
          borderColor: color + '33',
        },
      ]}
    >
      {dot && <View style={[styles.dot, { backgroundColor: color }]} />}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { ...typography.small, fontWeight: '700', textTransform: 'capitalize' },
})
