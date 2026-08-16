import { createApiClient } from '@wagon/api-client'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4020/api/v1'

export const SESSION_KEY = 'wagon.session'

export interface StoredSession {
  accessToken: string
  refreshToken: string
  profile?: Record<string, unknown>
}

let accessToken: string | null = null
let refreshToken: string | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken() {
  return accessToken
}

export function setTokens(access: string | null, refresh: string | null) {
  accessToken = access
  refreshToken = refresh
}

export function getRefreshToken() {
  return refreshToken
}

const DEVICE_KEY = 'wagon_device_id'

/** Stable per-install device identifier (binds refresh sessions to this device). */
export async function getDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_KEY)
    if (existing) return existing
    const id = `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
    await AsyncStorage.setItem(DEVICE_KEY, id)
    return id
  } catch {
    return `dev_${Math.random().toString(36).slice(2)}`
  }
}

/** Single-flight refresh so parallel 401s share one refresh call. */
let refreshing: Promise<boolean> | null = null

/** Registered by the auth module: called when a refresh permanently fails. */
let onRefreshFailure: (() => void) | null = null
export function setOnRefreshFailure(fn: () => void) {
  onRefreshFailure = fn
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken()
  if (!refresh) return false
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refresh, deviceId: await getDeviceId() }),
        })
        if (!res.ok) {
          // Permanent session death (revoked/rotated token): clear persisted
          // state and force the app back to login.
          await AsyncStorage.removeItem(SESSION_KEY).catch(() => {})
          onRefreshFailure?.()
          return false
        }
        const data = await res.json()
        accessToken = data.accessToken ?? null
        refreshToken = data.refreshToken ?? refresh
        // Persist rotated tokens so the restored session stays valid.
        const raw = await AsyncStorage.getItem(SESSION_KEY).catch(() => null)
        if (raw) {
          const session = JSON.parse(raw) as StoredSession
          session.accessToken = accessToken ?? session.accessToken
          session.refreshToken = refreshToken ?? session.refreshToken
          await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session)).catch(() => {})
        }
        return Boolean(accessToken)
      } catch {
        // Transient network error: keep the session so we can retry later.
        return false
      } finally {
        refreshing = null
      }
    })()
  }
  return refreshing
}

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => accessToken,
  onUnauthorized: () => refreshAccessToken(),
})
