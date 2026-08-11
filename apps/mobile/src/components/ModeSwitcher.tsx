import { View, Text, StyleSheet, Pressable } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'
import { useI18n } from '@wagon/i18n'
import { useActiveMode, modeActions, type ActiveMode } from '../mode'

const OPTIONS: Array<{ key: ActiveMode; icon: string; labelKey: string }> = [
  { key: 'supplier', icon: '📦', labelKey: 'nav.movingGoods' },
  { key: 'transporter', icon: '🚛', labelKey: 'nav.haulingLoads' },
]

/**
 * Global mode switcher shown when a user can act as both supplier and transporter.
 * Switches which working surface is surfaced across the app (Home, Marketplace).
 */
export function ModeSwitcher() {
  const theme = useTheme()
  const { t } = useI18n()
  const mode = useActiveMode()

  return (
    <View style={[styles.wrap, { backgroundColor: theme.muted, borderColor: theme.border }]}>
      {OPTIONS.map((o) => {
        const active = mode === o.key
        return (
          <Pressable
            key={o.key}
            style={[styles.btn, active && { backgroundColor: theme.primary }]}
            onPress={() => modeActions.setMode(o.key)}
          >
            <Text style={styles.icon}>{o.icon}</Text>
            <Text style={[styles.label, active ? { color: '#fff', fontWeight: '800' } : { color: theme.mutedForeground, fontWeight: '700' }]}>
              {t(o.labelKey)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: 4,
    overflow: 'hidden',
  },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.md, borderRadius: radius.lg },
  icon: { fontSize: 15 },
  label: { fontSize: 13, textAlign: 'center' },
})
