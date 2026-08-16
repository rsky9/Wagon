/**
 * Tiny cross-screen refresh bus. Screens that mutate money/operational state
 * (trips, escrow, bookings) call `notifyDataChanged('trips'|'finance'|...)`;
 * cockpit/home screens subscribe and re-fetch. Keeps shared views in sync
 * without a global store.
 */
const listeners = new Map<string, Set<() => void>>()

export function notifyDataChanged(topic: string): void {
  listeners.get(topic)?.forEach((fn) => { try { fn() } catch { /* noop */ } })
}

export function subscribeDataChanged(topic: string, fn: () => void): () => void {
  const set = listeners.get(topic) ?? new Set<() => void>()
  set.add(fn)
  listeners.set(topic, set)
  return () => { set.delete(fn) }
}
