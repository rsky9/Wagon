import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { setAccessToken } from './config'
import { api } from './config'
import { registerForPushNotifications } from './push'

export interface Session {
  accessToken: string
  refreshToken: string
  profile: {
    id: string
    mobile: string
    role: string
    capabilities?: string[]
    name?: string
    tier: string
    verified: boolean
    supplierVerified?: boolean
    transporterVerified?: boolean
  }
}

interface AuthState {
  session: Session | null
  restoring: boolean
  otpRequested: boolean
  loading: boolean
  error: string | null
  devCode: string | null
}

const SESSION_KEY = 'wagon_session'

// ---- Shared module-level store (single source of truth) ----
let state: AuthState = {
  session: null,
  restoring: true,
  otpRequested: false,
  loading: false,
  error: null,
  devCode: null,
}

const listeners = new Set<() => void>()

function setState(patch: Partial<AuthState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): AuthState {
  return state
}

// Restore persisted session on launch (single fire)
let restored = false
function restoreSession() {
  if (restored) return
  restored = true
  AsyncStorage.getItem(SESSION_KEY)
    .then((raw) => {
      if (raw) {
        const saved = JSON.parse(raw) as Session
        setAccessToken(saved.accessToken)
        setState({ session: saved })
      }
    })
    .catch(() => {})
    .finally(() => setState({ restoring: false }))
}

const persist = (s: Session) => {
  setAccessToken(s.accessToken)
  setState({ session: s })
  AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s)).catch(() => {})
}

export const authActions = {
  requestOtp: async (mobile: string) => {
    setState({ loading: true, error: null })
    try {
      const res = await api.post<{ devCode?: string }>('/auth/otp', { mobile })
      setState({ devCode: res.devCode ?? null, otpRequested: true })
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : 'Failed to request OTP' })
    } finally {
      setState({ loading: false })
    }
  },

  verifyOtp: async (mobile: string, code: string) => {
    setState({ loading: true, error: null })
    try {
      const res = await api.post<Session>('/auth/verify', { mobile, code })
      persist(res)
      void registerForPushNotifications()
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : 'Invalid OTP' })
    } finally {
      setState({ loading: false })
    }
  },

  logout: () => {
    setAccessToken(null)
    setState({ session: null, otpRequested: false, devCode: null, error: null })
    AsyncStorage.removeItem(SESSION_KEY).catch(() => {})
  },

  updateRole: (role: string) => {
    if (!state.session) return
    const next: Session = { ...state.session, profile: { ...state.session.profile, role } }
    persist(next)
  },

  setCapabilities: async (capabilities: string[]) => {
    if (!state.session) return
    try {
      await api.patch('/auth/capabilities', { capabilities })
    } catch {}
    const next: Session = {
      ...state.session,
      profile: { ...state.session.profile, capabilities, role: (capabilities[0] ?? state.session.profile.role) },
    }
    persist(next)
  },

  resetOtp: () => setState({ otpRequested: false, devCode: null, error: null }),

  clearError: () => setState({ error: null }),
}

export function useAuth() {
  restoreSession()
  const s = useSyncExternalStore(subscribe, getSnapshot)
  return {
    ...s,
    requestOtp: authActions.requestOtp,
    verifyOtp: authActions.verifyOtp,
    logout: authActions.logout,
    updateRole: authActions.updateRole,
    setCapabilities: authActions.setCapabilities,
  }
}
