import { useSyncExternalStore } from 'react'
import type { LoadFilters } from './screens/FiltersScreen'

let state: { filters?: LoadFilters } = {}
const listeners = new Set<() => void>()

function setState(patch: Partial<{ filters?: LoadFilters }>) {
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

export const filtersActions = {
  apply: (filters?: LoadFilters) => setState({ filters }),
  clear: () => setState({ filters: undefined }),
}

/** Shared load-filters state shared between the Filters screen and the Marketplace feed. */
export function useLoadFilters(): LoadFilters | undefined {
  return useSyncExternalStore(subscribe, getSnapshot).filters
}
