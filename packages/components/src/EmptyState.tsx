import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'

interface Props {
  title: string
  message: string
  icon?: string
  actionLabel?: string
  onAction?: () => void
}

/** Designed destination for empty states — never a blank screen. */
export function EmptyState({ title, message, icon = '🚛', actionLabel, onAction }: Props) {
  const theme = useTheme()
  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: theme.muted }]}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <Text style={[styles.title, { color: theme.foreground }]}>{title}</Text>
      <Text style={[styles.message, { color: theme.mutedForeground }]}>{message}</Text>
      {actionLabel && (
        <Pressable
          style={[styles.action, { backgroundColor: theme.primary }]}
          onPress={onAction}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  iconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  icon: { fontSize: 32 },
  title: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 4, maxWidth: 280 },
  action: { marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
