import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'

interface Props {
  state: 'loading' | 'error' | 'offline' | 'empty' | 'maintenance'
  title?: string
  message?: string
  onRetry?: () => void
}

/** Shared system-state view: skeleton/error/offline/empty/maintenance. */
export function SystemState({ state, title, message, onRetry }: Props) {
  const theme = useTheme()
  const conf = {
    loading: { icon: null, title: title ?? 'Loading…', msg: message },
    error: { icon: '⚠️', title: title ?? 'Something went wrong', msg: message ?? 'Please try again.' },
    offline: { icon: '📡', title: title ?? 'You are offline', msg: message ?? 'Check your connection and retry.' },
    empty: { icon: '🗂️', title: title ?? 'Nothing here yet', msg: message },
    maintenance: { icon: '🔧', title: title ?? 'Under maintenance', msg: message ?? 'We will be back shortly.' },
  }[state]

  return (
    <View style={styles.wrap}>
      {state === 'loading' ? (
        <ActivityIndicator size="large" color={theme.primary} />
      ) : (
        <Text style={{ fontSize: 40, marginBottom: spacing.md }}>{conf.icon}</Text>
      )}
      <Text style={[styles.title, { color: theme.foreground }]}>{conf.title}</Text>
      {conf.msg ? <Text style={[styles.msg, { color: theme.mutedForeground }]}>{conf.msg}</Text> : null}
      {onRetry && state !== 'loading' && (
        <Pressable style={[styles.btn, { backgroundColor: theme.primary }]} onPress={onRetry}>
          <Text style={styles.btnText}>{state === 'offline' ? 'Retry' : 'Try again'}</Text>
        </Pressable>
      )}
    </View>
  )
}

/** Slim inline banner for transient states (offline/error) above content. */
export function StateBanner({ state, onRetry }: { state: 'offline' | 'error'; onRetry?: () => void }) {
  const theme = useTheme()
  const color = state === 'offline' ? theme.warning : theme.danger
  const text = state === 'offline' ? 'No internet connection' : 'Network error'
  return (
    <Pressable style={[styles.banner, { backgroundColor: color + '1A', borderColor: color + '44' }]} onPress={onRetry}>
      <Text style={{ color, fontSize: 13, fontWeight: '700', flex: 1 }}>{text}</Text>
      {onRetry ? <Text style={{ color, fontSize: 13, fontWeight: '800' }}>Retry</Text> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl, gap: spacing.sm },
  title: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  msg: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 280 },
  btn: { marginTop: spacing.md, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderWidth: 1, borderRadius: radius.sm },
})
