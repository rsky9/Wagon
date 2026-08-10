import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type ActiveMode = 'supplier' | 'transporter' | 'driver'

const STORAGE_KEY = 'wagon_active_mode'

let state: { mode: ActiveMode | null } = { mode: null }
const listeners = new Set<() => void>()

function setState(patch: Partial<{ mode: ActiveMode | null }>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return state
}

let restored = false
function restore() {
  if (restored) return
  restored = true
  AsyncStorage.getItem(STORAGE_KEY)
    .then((v) => {
      if (v === 'supplier' || v === 'transporter' || v === 'driver') {
        setState({ mode: v })
      }
    })
    .catch(() => {})
}

export const modeActions = {
  setMode: (mode: ActiveMode) => {
    setState({ mode })
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {})
  },
}

/**
 * Active mode for users with multiple capabilities (e.g. supplier + transporter).
 * Persisted so the user's chosen working mode survives relaunches.
 */
export function useActiveMode() {
  restore()
  return useSyncExternalStore(subscribe, getSnapshot).mode
}
