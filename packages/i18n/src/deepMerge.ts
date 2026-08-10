export function deepMerge<T>(base: T, override: Record<string, unknown>): T {
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key]
    if (
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing) &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      result[key] = deepMerge(existing, value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result as T
}
