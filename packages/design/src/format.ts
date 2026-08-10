/** Format an amount in Indian grouping (₹1,25,000). */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Format a plain number with Indian grouping. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-IN').format(value)
}

/** Compact distance: 1,250 km. */
export function formatDistance(km: number): string {
  return `${formatNumber(km)} km`
}

/** Compact weight: 35 t. */
export function formatWeight(tonnes: number): string {
  return `${formatNumber(tonnes)} t`
}

/** Human relative time: "2h ago", "just now". */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** Title-case a status code like "in_transit" -> "In transit". */
export function titleCaseStatus(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
