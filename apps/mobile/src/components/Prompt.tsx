import { useEffect, useRef, useState } from 'react'
import { Modal, Text, TextInput, View, Pressable, StyleSheet, Platform } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'

export interface PromptOptions {
  title: string
  message?: string
  placeholder?: string
  defaultValue?: string
  keyboardType?: 'default' | 'numeric' | 'email-address'
  confirmText?: string
  cancelText?: string
}

/**
 * Cross-platform text prompt. `Alert.prompt` is iOS-only and crashes on
 * Android, so this renders a Modal input and returns a Promise<string|null>
 * (null when cancelled). Used for all free-text capture across the app.
 */
export function prompt(opts: PromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false
    const done = (val: string | null) => {
      if (resolved) return
      resolved = true
      if (promptSlot.current) promptSlot.current = null
      resolve(val)
    }
    promptSlot.current = { opts, done }
  })
}

interface Slot {
  opts: PromptOptions
  done: (val: string | null) => void
}

/**
 * Drop-in replacement for the iOS-only `Alert.prompt` API. Accepts the same
 * `[button, button]` shape; the confirm button's `onPress` receives the typed
 * value. Returns a no-op for cancelled flows.
 */
export function alertPrompt(
  title: string,
  message?: string,
  buttons?: Array<{ text: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: (value?: string) => void }>,
  keyboardType?: 'default' | 'numeric',
) {
  const cancel = buttons?.find((b) => b.style === 'cancel')
  const confirm = buttons?.find((b) => b.style !== 'cancel')
  void prompt({
    title,
    message,
    placeholder: message,
    keyboardType,
    confirmText: confirm?.text ?? 'OK',
    cancelText: cancel?.text ?? 'Cancel',
  }).then((value) => {
    if (value != null && confirm?.onPress) confirm.onPress(value)
    else if (value == null && cancel?.onPress) cancel.onPress(undefined)
  })
}

const promptSlot: { current: Slot | null } = { current: null }

/** Mount once in the app root; renders the active prompt. */
export function PromptHost() {
  const theme = useTheme()
  const [slot, setSlot] = useState<Slot | null>(null)
  const [value, setValue] = useState('')
  const latestSlot = useRef<Slot | null>(null)

  useEffect(() => {
    // Poll the singleton slot so the host re-renders when prompt() is called.
    const iv = setInterval(() => {
      if (promptSlot.current !== latestSlot.current) {
        latestSlot.current = promptSlot.current
        setSlot(promptSlot.current)
        setValue(promptSlot.current?.opts.defaultValue ?? '')
      }
    }, 100)
    return () => clearInterval(iv)
  }, [])

  const cancel = () => { slot?.done(null); setSlot(null) }
  const confirm = () => { slot?.done(value); setSlot(null) }

  return (
    <Modal visible={!!slot} transparent animationType="fade" onRequestClose={cancel}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.foreground }]}>{slot?.opts.title ?? ''}</Text>
          {slot?.opts.message ? <Text style={[styles.message, { color: theme.mutedForeground }]}>{slot.opts.message}</Text> : null}
          <TextInput
            style={[styles.input, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]}
            placeholder={slot?.opts.placeholder}
            placeholderTextColor={theme.mutedForeground}
            value={value}
            onChangeText={setValue}
            keyboardType={slot?.opts.keyboardType ?? 'default'}
            autoFocus
          />
          <View style={styles.actions}>
            <Pressable style={[styles.btn, { backgroundColor: theme.muted }]} onPress={cancel}>
              <Text style={{ color: theme.foreground, fontWeight: '700' }}>{slot?.opts.cancelText ?? 'Cancel'}</Text>
            </Pressable>
            <Pressable style={[styles.btn, { backgroundColor: theme.primary }]} onPress={confirm}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>{slot?.opts.confirmText ?? 'OK'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.xl },
  card: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 17, fontWeight: '800' },
  message: { fontSize: 14 },
  input: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, fontSize: 15 },
  actions: { flexDirection: 'row', gap: spacing.md },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
})
