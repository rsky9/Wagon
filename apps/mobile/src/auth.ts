import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { setAccessToken, setTokens, getRefreshToken, getDeviceId, SESSION_KEY, setOnRefreshFailure } from './config'
import { api } from './config'
import { registerForPushNotifications } from './push'
import { resetTrackingSocket } from './socket'

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
        setTokens(saved.accessToken, saved.refreshToken)
        setState({ session: saved })
        // Re-register the device for push on cold launch — the FCM token can
        // rotate across installs without the login path running again.
        void registerForPushNotifications()
      }
    })
    .catch(() => {})
    .finally(() => setState({ restoring: false }))
}

const persist = (s: Session) => {
  setTokens(s.accessToken, s.refreshToken)
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
      const deviceId = await getDeviceId()
      const res = await api.post<Session>('/auth/verify', { mobile, code, deviceId })
      persist(res)
      void registerForPushNotifications()
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : 'Invalid OTP' })
    } finally {
      setState({ loading: false })
    }
  },

  logout: () => {
    // Best-effort server-side revoke of this device's refresh session.
    const refresh = getRefreshToken()
    if (refresh) {
      api.post('/auth/logout', { refreshToken: refresh }).catch(() => {})
    }
    // Drop the tracking socket so a future login never reuses the old user's
    // authenticated session (cross-account data leak).
    resetTrackingSocket()
    setAccessToken(null)
    setTokens(null, null)
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

  /**
   * Ensure the user belongs to an organization of the kind matching their first
   * capability. Without one, every enablement endpoint returns 403. Creates the
   * org on first call; idempotent afterwards.
   */
  ensureOrganization: async () => {
    if (!state.session) return
    try {
      const orgs = await api.get<{ organizations: { id: string; kind: string }[] }>('/foundation/organizations')
      if (orgs.organizations.length > 0) return
      const caps = state.session.profile.capabilities ?? [state.session.profile.role]
      const KIND: Record<string, string> = {
        supplier: 'shipper',
        transporter: 'transporter',
        forwarder: 'forwarder',
        warehouse: 'warehouse',
        carrier: 'carrier',
        driver: 'transporter',
      }
      const kind = KIND[caps[0] ?? ''] ?? 'shipper'
      const name = `${(state.session.profile.name ?? caps[0] ?? 'My').toUpperCase()} ${kind}`
      await api.post('/foundation/organizations', { name, kind })
    } catch {}
  },

  resetOtp: () => setState({ otpRequested: false, devCode: null, error: null }),

  clearError: () => setState({ error: null }),
}

export function useAuth() {
  restoreSession()
  // A permanently-dead refresh token (revoked/rotated) must drop the session,
  // otherwise the app sits logged-in-but-erroring forever.
  setOnRefreshFailure(() => {
    setAccessToken(null)
    setTokens(null, null)
    resetTrackingSocket()
    setState({ session: null, error: 'Session expired. Please sign in again.' })
    AsyncStorage.removeItem(SESSION_KEY).catch(() => {})
  })
  const s = useSyncExternalStore(subscribe, getSnapshot)
  return {
    ...s,
    requestOtp: authActions.requestOtp,
    verifyOtp: authActions.verifyOtp,
    logout: authActions.logout,
    updateRole: authActions.updateRole,
    setCapabilities: authActions.setCapabilities,
    ensureOrganization: authActions.ensureOrganization,
  }
}
