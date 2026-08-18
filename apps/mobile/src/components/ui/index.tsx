import React from 'react'
import { StyleSheet, Text, View, Pressable, ViewStyle, TextStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme, spacing, radius, shadows, typography, gradients } from '@wagon/design'
import { useThemeMode } from '../../theme'

/* ------------------------------------------------------------------ */
/* Section header                                                       */
/* ------------------------------------------------------------------ */
export function SectionHeader({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void }) {
  const theme = useTheme()
  return (
    <View style={styles.sectionHead}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, { color: theme.foreground }]}>{title}</Text>
        {subtitle ? <Text style={[styles.sectionSub, { color: theme.mutedForeground }]}>{subtitle}</Text> : null}
      </View>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 13 }}>{action} ›</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Greeting                                                            */
/* ------------------------------------------------------------------ */
export function Greeting({ name, subtitle, role }: { name: string; subtitle?: string; role?: string }) {
  const theme = useTheme()
  return (
    <View style={styles.greeting}>
      <Text style={[styles.greetingHello, { color: theme.mutedForeground }]}>Good morning</Text>
      <Text style={[styles.greetingName, { color: theme.foreground }]} numberOfLines={1}>
        {name || 'Welcome'}
      </Text>
      {(subtitle || role) && <Text style={[styles.greetingSub, { color: theme.mutedForeground }]}>{subtitle ?? role}</Text>}
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* KPI hero card (gradient)                                             */
/* ------------------------------------------------------------------ */
export function KpiCard({
  label,
  value,
  sub,
  gradient = ['#0F172A', '#1E293B'],
  icon,
  onPress,
  style,
}: {
  label: string
  value: string
  sub?: string
  gradient?: readonly [string, string]
  icon?: string
  onPress?: () => void
  style?: ViewStyle
}) {
  const theme = useTheme()
  const inner = (
    <LinearGradient colors={gradient} style={[styles.kpiCard, style]}>
      <View style={styles.kpiTop}>
        <Text style={[styles.kpiLabel, { color: 'rgba(255,255,255,0.72)' }]}>{label}</Text>
        {icon ? <Text style={styles.kpiIcon}>{icon}</Text> : null}
      </View>
      <Text style={[styles.kpiValue, { color: '#fff' }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? <Text style={[styles.kpiSub, { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1}>{sub}</Text> : null}
    </LinearGradient>
  )
  if (!onPress) return inner
  return <Pressable onPress={onPress}>{inner}</Pressable>
}

/* ------------------------------------------------------------------ */
/* Stat tile (light card)                                               */
/* ------------------------------------------------------------------ */
export function StatTile({ label, value, icon, onPress }: { label: string; value: string | number; icon?: string; onPress?: () => void }) {
  const theme = useTheme()
  const body = (
    <View style={[styles.statTile, { backgroundColor: theme.card, borderColor: theme.border }, shadows.sm]}>
      <View style={styles.statIconWrap}>
        <Text style={{ fontSize: 18 }}>{icon ?? '•'}</Text>
      </View>
      <Text style={[styles.statValue, { color: theme.foreground }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.mutedForeground }]} numberOfLines={2}>{label}</Text>
    </View>
  )
  if (!onPress) return body
  return <Pressable onPress={onPress}>{body}</Pressable>
}

/* ------------------------------------------------------------------ */
/* Quick action pill                                                    */
/* ------------------------------------------------------------------ */
export function QuickAction({ icon, label, onPress, tone = 'orange' }: { icon: string; label: string; onPress: () => void; tone?: 'orange' | 'navy' | 'blue' | 'green' }) {
  const theme = useTheme()
  const { isDark } = useThemeMode()
  // Tones must stay legible in both modes: dark-mode text on a hardcoded light
  // tint is invisible (e.g. navy's #0F172A "Find loads" on a dark background).
  const tones: Record<string, { bg: string; fg: string }> = {
    orange: { bg: 'rgba(249,115,22,0.12)', fg: '#F97316' },
    navy: { bg: theme.muted, fg: theme.foreground },
    blue: { bg: isDark ? 'rgba(59,130,246,0.16)' : 'rgba(59,130,246,0.12)', fg: isDark ? '#93C5FD' : '#2563EB' },
    green: { bg: isDark ? 'rgba(16,185,129,0.16)' : 'rgba(16,185,129,0.12)', fg: isDark ? '#6EE7B7' : '#047857' },
  }
  const t = tones[tone] ?? tones.orange!
  return (
    <Pressable style={[styles.quickAction, { backgroundColor: t.bg, borderColor: t.bg }]} onPress={onPress}>
      <Text style={{ fontSize: 20 }}>{icon}</Text>
      <Text style={[styles.quickLabel, { color: t.fg }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  )
}

/* ------------------------------------------------------------------ */
/* Capability chip                                                      */
/* ------------------------------------------------------------------ */
export function CapabilityChip({ label, verified }: { label: string; verified?: boolean }) {
  const theme = useTheme()
  return (
    <View style={[styles.capChip, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
      <Text style={{ color: theme.accentForeground, fontSize: 12, fontWeight: '700' }}>{label}</Text>
      {verified ? <Text style={{ color: theme.success, fontSize: 12, fontWeight: '800' }}> ✓</Text> : null}
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Trust badge                                                          */
/* ------------------------------------------------------------------ */
export function TrustBadge({ rating, completion }: { rating?: number | null; completion?: number | null }) {
  const theme = useTheme()
  return (
    <View style={[styles.trustBadge, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
      <Text style={{ color: theme.accentForeground, fontSize: 12, fontWeight: '800' }}>
        ★ {rating != null ? rating.toFixed(1) : 'new'}
      </Text>
      {completion != null && (
        <Text style={{ color: theme.accentForeground, fontSize: 12, fontWeight: '700' }}> · {completion}% done</Text>
      )}
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Live-state badge (Layer 2)                                           */
/* ------------------------------------------------------------------ */
export function LiveStateBadge({ onMarketNow, fresh, claimRate }: { onMarketNow?: boolean; fresh?: number | null; claimRate?: number | null }) {
  const theme = useTheme()
  const color = onMarketNow === false ? theme.danger : fresh != null && fresh < 1 ? theme.success : theme.warning
  const text = onMarketNow === false ? 'not now' : fresh != null && fresh < 1 ? 'active now' : fresh != null ? `${fresh}h ago` : 'listed'
  return (
    <View style={[styles.liveBadge, { backgroundColor: color + '1A', borderColor: color + '44' }]}>
      <Text style={{ color, fontSize: 11, fontWeight: '800' }}>{text}</Text>
      {claimRate != null ? <Text style={{ color: theme.mutedForeground, fontSize: 11 }}> · {Math.round(claimRate * 100)}% claims</Text> : null}
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Grouped settings section (Account)                                   */
/* ------------------------------------------------------------------ */
export function SettingRow({ icon, label, sub, onPress, danger, trailing }: { icon: string; label: string; sub?: string; onPress?: () => void; danger?: boolean; trailing?: string }) {
  const theme = useTheme()
  return (
    <Pressable style={[styles.settingRow, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={onPress}>
      <View style={[styles.settingIcon, { backgroundColor: theme.accent }]}>
        <Text style={{ fontSize: 17 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.settingLabel, { color: danger ? theme.danger : theme.foreground }]}>{label}</Text>
        {sub ? <Text style={[styles.settingSub, { color: theme.mutedForeground }]}>{sub}</Text> : null}
      </View>
      {trailing ? <Text style={[styles.settingTrailing, { color: theme.mutedForeground }]}>{trailing}</Text> : null}
      {onPress ? <Text style={{ color: theme.mutedForeground, fontSize: 16 }}>›</Text> : null}
    </Pressable>
  )
}

/* ------------------------------------------------------------------ */
/* Group title for settings                                             */
/* ------------------------------------------------------------------ */
export function GroupTitle({ children }: { children: React.ReactNode }) {
  const theme = useTheme()
  return (
    <Text style={[styles.groupTitle, { color: theme.mutedForeground }]}>{children}</Text>
  )
}

/* ------------------------------------------------------------------ */
/* Market card — consistent card shell for marketplace tabs             */
/* ------------------------------------------------------------------ */
export function MarketCard({
  icon,
  title,
  subtitle,
  status,
  statusColor,
  children,
  footer,
  onPress,
}: {
  icon?: string
  title: string
  subtitle?: string
  status?: string
  statusColor?: string
  children?: React.ReactNode
  footer?: React.ReactNode
  onPress?: () => void
}) {
  const theme = useTheme()
  const sc = statusColor ?? theme.success
  const body = (
    <View style={[styles.marketCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.marketCardTop}>
        {icon ? (
          <View style={[styles.marketIcon, { backgroundColor: 'rgba(249,115,22,0.12)' }]}>
            <Text style={{ fontSize: 18 }}>{icon}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <View style={styles.marketCardTitleRow}>
            <Text style={[styles.marketCardTitle, { color: theme.foreground }]} numberOfLines={1}>{title}</Text>
            {status ? (
              <View style={[styles.marketStatusChip, { backgroundColor: sc + '1A' }]}>
                <Text style={{ color: sc, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>{status}</Text>
              </View>
            ) : null}
          </View>
          {subtitle ? <Text style={[styles.marketCardSub, { color: theme.mutedForeground }]} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
      </View>
      {children ? <View style={styles.marketCardBody}>{children}</View> : null}
      {footer ? <View style={styles.marketCardFooter}>{footer}</View> : null}
    </View>
  )
  if (!onPress) return body
  return <Pressable onPress={onPress}>{body}</Pressable>
}

/* ------------------------------------------------------------------ */
/* Styles                                                               */
/* ------------------------------------------------------------------ */
const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.sm, gap: spacing.md },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  sectionSub: { fontSize: 13, marginTop: 1 },
  greeting: { marginBottom: spacing.lg },
  greetingHello: { fontSize: 13, fontWeight: '600' },
  greetingName: { fontSize: 26, fontWeight: '800', letterSpacing: -0.02, marginTop: 2 },
  greetingSub: { fontSize: 13, marginTop: 3 },
  kpiCard: { borderRadius: radius.xl, padding: spacing.xl, gap: spacing.sm, justifyContent: 'flex-end', minHeight: 132 },
  kpiTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kpiLabel: { fontSize: 13, fontWeight: '700' },
  kpiIcon: { fontSize: 20 },
  kpiValue: { fontSize: 32, fontWeight: '800', letterSpacing: -0.02 },
  kpiSub: { fontSize: 13, fontWeight: '600' },
  statTile: { flex: 1, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, gap: spacing.xs },
  statIconWrap: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(249,115,22,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600' },
  quickAction: { flex: 1, borderRadius: radius.lg, borderWidth: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, alignItems: 'center', gap: 4 },
  quickLabel: { fontSize: 12, fontWeight: '800' },
  capChip: { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, flexDirection: 'row', alignItems: 'center' },
  trustBadge: { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, flexDirection: 'row', alignItems: 'center' },
  liveBadge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3, flexDirection: 'row', alignItems: 'center' },
  settingRow: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  settingIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { fontSize: 15, fontWeight: '700' },
  settingSub: { fontSize: 12, marginTop: 1 },
  settingTrailing: { fontSize: 12, fontWeight: '700' },
  groupTitle: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.xl, marginBottom: spacing.sm, paddingHorizontal: spacing.xs },
  marketCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.md, marginBottom: spacing.md },
  marketCardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  marketIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  marketCardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  marketCardTitle: { fontSize: 15, fontWeight: '800' },
  marketStatusChip: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  marketCardSub: { fontSize: 13, marginTop: 2 },
  marketCardBody: { gap: spacing.sm },
  marketCardFooter: { borderTopWidth: 1, paddingTop: spacing.sm, gap: spacing.sm },
})
