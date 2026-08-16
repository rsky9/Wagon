import { useEffect, useRef, useState } from 'react'
import { Modal, Text, View, Pressable, StyleSheet, ScrollView } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'

export interface ActionSheetOption {
  text: string
  onPress?: () => void
  destructive?: boolean
}

export interface ActionSheetOptions {
  title: string
  message?: string
  options: ActionSheetOption[]
  cancelText?: string
}

/**
 * Cross-platform action sheet. Android's `Alert.alert` renders at most 3
 * buttons, so multi-choice flows (ratings, carrier pickers, container
 * lifecycle) must use a modal list instead. Mirrors the `prompt()` singleton
 * pattern so it can be called from anywhere and rendered once in the app root.
 */
export function showActionSheet(opts: ActionSheetOptions): void {
  actionSheetSlot.current = opts
}

const actionSheetSlot: { current: ActionSheetOptions | null } = { current: null }

/** Mount once in the app root; renders the active action sheet. */
export function ActionSheetHost() {
  const theme = useTheme()
  const [opts, setOpts] = useState<ActionSheetOptions | null>(null)
  const latestSlot = useRef<ActionSheetOptions | null>(null)

  useEffect(() => {
    const iv = setInterval(() => {
      if (actionSheetSlot.current !== latestSlot.current) {
        latestSlot.current = actionSheetSlot.current
        setOpts(actionSheetSlot.current)
      }
    }, 100)
    return () => clearInterval(iv)
  }, [])

  const close = (option?: ActionSheetOption) => {
    setOpts(null)
    actionSheetSlot.current = null
    if (option?.onPress) option.onPress()
  }

  return (
    <Modal visible={!!opts} transparent animationType="fade" onRequestClose={() => setOpts(null)}>
      <Pressable style={styles.overlay} onPress={() => setOpts(null)}>
        <Pressable style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.title, { color: theme.foreground }]}>{opts?.title ?? ''}</Text>
          {opts?.message ? <Text style={[styles.message, { color: theme.mutedForeground }]}>{opts.message}</Text> : null}
          <ScrollView style={{ maxHeight: 380 }}>
            {opts?.options.map((o, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [
                  styles.option,
                  { backgroundColor: pressed ? theme.muted : theme.card, borderBottomColor: theme.border },
                ]}
                onPress={() => close(o)}
              >
                <Text style={[styles.optionText, { color: o.destructive ? '#dc2626' : theme.foreground }]}>{o.text}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={[styles.cancel, { backgroundColor: theme.muted }]} onPress={() => setOpts(null)}>
            <Text style={{ color: theme.foreground, fontWeight: '800' }}>{opts?.cancelText ?? 'Cancel'}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: spacing.lg },
  card: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: 17, fontWeight: '800' },
  message: { fontSize: 14 },
  option: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.md, paddingHorizontal: spacing.sm },
  optionText: { fontSize: 16, fontWeight: '600' },
  cancel: { borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
})
