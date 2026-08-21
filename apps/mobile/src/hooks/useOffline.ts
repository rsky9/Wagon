import { useEffect, useState, useCallback } from 'react'
import { API_BASE_URL, replayOfflineQueue, offlineQueueSize } from '../config'

/** Lightweight offline detection: pings /health + replays the offline queue on reconnect. */
export function useOffline() {
  const [offline, setOffline] = useState(false)
  const [queued, setQueued] = useState(0)

  const refreshQueued = useCallback(async () => {
    setQueued(await offlineQueueSize())
  }, [])

  const check = useCallback(async () => {
    const wasOffline = offline
    let nowOffline = false
    try {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 4000)
      const res = await fetch(`${API_BASE_URL.replace(/\/api\/v1\/?$/, '')}/health`, {
        signal: controller.signal,
      })
      clearTimeout(t)
      nowOffline = !res.ok
    } catch {
      try {
        const c2 = new AbortController()
        const t2 = setTimeout(() => c2.abort(), 4000)
        const r2 = await fetch(API_BASE_URL.replace(/\/api\/v1\/?$/, '') + '/api/v1/health', { signal: c2.signal })
        clearTimeout(t2)
        nowOffline = !r2.ok
      } catch {
        nowOffline = true
      }
    }
    setOffline(nowOffline)
    // Came back online: replay any queued mutating calls.
    if (wasOffline && !nowOffline) {
      await replayOfflineQueue().catch(() => {})
      await refreshQueued()
    } else {
      await refreshQueued()
    }
  }, [offline, refreshQueued])

  useEffect(() => {
    check()
    refreshQueued()
    const id = setInterval(check, 30000)
    return () => clearInterval(id)
  }, [check, refreshQueued])

  const retry = useCallback(async () => {
    await check()
    const { ok } = await replayOfflineQueue().catch(() => ({ ok: 0, failed: 0 }))
    await refreshQueued()
    return ok
  }, [check, refreshQueued])

  return { offline, queued, retry }
}
