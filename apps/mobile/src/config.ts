import { createApiClient } from '@wagon/api-client'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4020/api/v1'

const SESSION_KEY = 'wagon.session'

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

function getRefreshToken() {
  return refreshToken
}

/** Single-flight refresh so parallel 401s share one refresh call. */
let refreshing: Promise<boolean> | null = null

async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken()
  if (!refresh) return false
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refresh }),
        })
        if (!res.ok) {
          await AsyncStorage.removeItem(SESSION_KEY).catch(() => {})
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
