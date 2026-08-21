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

const _rawApi = createApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => accessToken,
  onUnauthorized: () => refreshAccessToken(),
})

// Offline queue: failed mutating calls are stashed in AsyncStorage and
// replayed when connectivity returns. The banner's Retry replays; a
// background effect in useOffline replays on reconnect. Only idempotent
// retries are attempted — callers still see the original network error so
// they can show "Queued" UI.

const OFFLINE_QUEUE_KEY = 'wagon.offlineQueue'
const MAX_QUEUED = 50
const QUEUEABLE = new Set(['/loads', '/market/requests', '/market/listings', '/bidding/bid', '/support/tickets', '/chat/'])

function isQueueable(path: string) {
  for (const p of QUEUEABLE) if (path.startsWith(p)) return true
  return false
}

async function enqueueOffline(method: string, path: string, body?: unknown) {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY).catch(() => null)
    const q: Array<{ method: string; path: string; body?: unknown; at: number }> = raw ? JSON.parse(raw) : []
    if (q.length >= MAX_QUEUED) q.shift()
    q.push({ method, path, body, at: Date.now() })
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q)).catch(() => {})
  } catch {}
}

export async function replayOfflineQueue(): Promise<{ ok: number; failed: number }> {
  let ok = 0
  let failed = 0
  while (true) {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY).catch(() => null)
    const q: Array<{ method: string; path: string; body?: unknown }> = raw ? JSON.parse(raw) : []
    const next = q[0]
    if (!next) break
    try {
      await _rawApi.request(next.method, next.path, next.body)
      q.shift()
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q)).catch(() => {})
      ok++
    } catch {
      failed++
      break
    }
  }
  return { ok, failed }
}

export async function offlineQueueSize(): Promise<number> {
  const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY).catch(() => null)
  const q: unknown[] = raw ? JSON.parse(raw) : []
  return q.length
}

function isNetworkError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  return /network|fetch|failed to fetch|load failed|timeout|abort/i.test(msg)
}

function wrapWithQueue<T>(method: string, path: string, body: unknown, call: () => Promise<T>): Promise<T> {
  return call().catch((e) => {
    if (isQueueable(path) && isNetworkError(e)) {
      void enqueueOffline(method, path, body)
    }
    throw e
  })
}

export const api = {
  ..._rawApi,
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    wrapWithQueue('POST', path, body, () => _rawApi.post<T>(path, body, headers)),
  patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    wrapWithQueue('PATCH', path, body, () => _rawApi.patch<T>(path, body, headers)),
  request: _rawApi.request.bind(_rawApi),
  get: _rawApi.get.bind(_rawApi),
} as typeof _rawApi
