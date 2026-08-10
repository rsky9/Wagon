import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { useTheme, spacing, radius, shadows } from '@wagon/design'

export interface TabItem {
  key: string
  label: string
  icon: string
}

interface Props {
  tabs: TabItem[]
  active: string
  onChange: (key: string) => void
  centerAction?: { icon: string; onPress: () => void }
}

/** Premium bottom tab bar with optional raised center action (Uber-style FAB). */
export function BottomTabs({ tabs, active, onChange, centerAction }: Props) {
  const theme = useTheme()
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
        },
        shadows.md,
      ]}
    >
      {centerAction && (
        <Pressable
          style={[styles.centerFab, { backgroundColor: theme.primary }, shadows.orange]}
          onPress={centerAction.onPress}
        >
          <Text style={styles.centerFabIcon}>{centerAction.icon}</Text>
        </Pressable>
      )}
      {tabs.map((tab) => {
        const isActive = tab.key === active
        return (
          <Pressable key={tab.key} style={styles.tab} onPress={() => onChange(tab.key)}>
            <View
              style={[
                styles.iconWrap,
                isActive && { backgroundColor: theme.accent },
              ]}
            >
              <Text style={[styles.icon, isActive && { opacity: 1 }]}>{tab.icon}</Text>
              {isActive && <View style={[styles.indicator, { backgroundColor: theme.primary }]} />}
            </View>
            <Text
              style={[
                styles.label,
                { color: theme.mutedForeground },
                isActive && { color: theme.primary, fontWeight: '700' },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: spacing.sm,
    paddingBottom: 18,
    paddingHorizontal: spacing.sm,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  iconWrap: { width: 44, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  icon: { fontSize: 20, opacity: 0.55 },
  indicator: { position: 'absolute', bottom: 0, width: 4, height: 4, borderRadius: 2 },
  label: { fontSize: 11, fontWeight: '600' },
  centerFab: {
    position: 'absolute',
    top: -24,
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  centerFabIcon: { color: '#fff', fontSize: 26, fontWeight: '700' },
})
