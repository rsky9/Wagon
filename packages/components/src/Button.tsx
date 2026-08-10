import React from 'react'
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native'
import { useTheme, radius, spacing, typography, shadows } from '@wagon/design'

interface Props {
  label: string
  onPress?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'
  loading?: boolean
  disabled?: boolean
  icon?: string
  fullWidth?: boolean
  size?: 'md' | 'lg'
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  fullWidth = true,
  size = 'lg',
}: Props) {
  const theme = useTheme()

  const bg =
    variant === 'primary'
      ? theme.primary
      : variant === 'destructive'
        ? theme.destructive
        : variant === 'secondary'
          ? theme.secondary
          : 'transparent'

  const fg =
    variant === 'primary' || variant === 'destructive'
      ? '#fff'
      : variant === 'secondary'
        ? theme.secondaryForeground
        : theme.primary

  const border =
    variant === 'ghost' || variant === 'secondary'
      ? { borderWidth: 1, borderColor: variant === 'secondary' ? theme.border : theme.primary + '44' }
      : null

  const height = size === 'lg' ? 56 : 48

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          backgroundColor: bg,
          borderRadius: radius.md,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          paddingHorizontal: spacing.xl,
        },
        border,
        variant === 'primary' && shadows.orange,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.content}>
          {icon ? <Text style={styles.icon}>{icon}</Text> : null}
          <Text style={[styles.label, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { fontSize: 18 },
  label: { fontSize: 16, fontWeight: '700' },
})
