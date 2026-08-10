import { useSyncExternalStore } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type ThemeMode = 'system' | 'light' | 'dark'

interface ThemeState {
  mode: ThemeMode
}

const STORAGE_KEY = 'wagon_theme_mode'

let state: ThemeState = { mode: 'system' }
const listeners = new Set<() => void>()

function setState(patch: Partial<ThemeState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): ThemeState {
  return state
}

let restored = false
function restore() {
  if (restored) return
  restored = true
  AsyncStorage.getItem(STORAGE_KEY)
    .then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') {
        setState({ mode: v })
      }
    })
    .catch(() => {})
}

export const themeActions = {
  setMode: (mode: ThemeMode) => {
    setState({ mode })
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {})
  },
  cycle: () => {
    const next: ThemeMode = state.mode === 'system' ? 'light' : state.mode === 'light' ? 'dark' : 'system'
    themeActions.setMode(next)
  },
}

/** Resolves the effective scheme: manual override wins, else system. */
export function useThemeMode() {
  restore()
  const s = useSyncExternalStore(subscribe, getSnapshot)
  const system = useColorScheme()
  const effective = s.mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : s.mode
  return {
    mode: s.mode,
    effective,
    isDark: effective === 'dark',
    setMode: themeActions.setMode,
    cycle: themeActions.cycle,
  }
}
