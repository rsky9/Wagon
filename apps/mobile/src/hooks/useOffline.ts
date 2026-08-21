import { useEffect, useState, useCallback } from 'react'
import { API_BASE_URL } from '../config'

/** Lightweight offline detection without extra deps: pings /health. */
export function useOffline() {
  const [offline, setOffline] = useState(false)

  const check = useCallback(async () => {
    try {
      const controller = new AbortController()
      const t = setTimeout(() => controller.abort(), 4000)
      const res = await fetch(`${API_BASE_URL.replace(/\/api\/v1\/?$/, '')}/health`, {
        signal: controller.signal,
      })
      clearTimeout(t)
      setOffline(!res.ok)
    } catch {
      // Fallback: ping the API base itself.
      try {
        const c2 = new AbortController()
        const t2 = setTimeout(() => c2.abort(), 4000)
        const r2 = await fetch(API_BASE_URL.replace(/\/api\/v1\/?$/, '') + '/api/v1/health', { signal: c2.signal })
        clearTimeout(t2)
        setOffline(!r2.ok)
      } catch {
        setOffline(true)
      }
    }
  }, [])

  useEffect(() => {
    check()
    const id = setInterval(check, 30000)
    return () => clearInterval(id)
  }, [check])

  return { offline, retry: check }
}
