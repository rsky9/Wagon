import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { useTheme, radius, spacing, shadows, typography } from '@wagon/design'

interface Props {
  from: string
  to: string
  distanceKm?: number
  fare?: number
  matchScore?: number
  matchReason?: string
  meta?: string[]
  footer?: string
  status?: React.ReactNode
  onPress?: () => void
}

/** Premium load card. Price is the hero; the route rail is the spine. */
export function LoadCard({
  from,
  to,
  distanceKm,
  fare,
  matchScore,
  matchReason,
  meta = [],
  footer,
  status,
  onPress,
}: Props) {
  const theme = useTheme()
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.card },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.96 },
        shadows.md,
      ]}
    >
      <View style={styles.topRow}>
        {fare != null && (
          <Text
            style={[
              styles.fare,
              { color: theme.foreground },
              { fontVariant: ['tabular-nums'] },
            ]}
          >
            <Text style={{ color: theme.primary }}>₹</Text>
            {fare.toLocaleString('en-IN')}
          </Text>
        )}
        {matchScore != null && matchScore > 0 && (
          <View style={[styles.matchBadge, { backgroundColor: theme.accent }]}>
            <Text style={{ color: theme.accentForeground, fontSize: 12, fontWeight: '800' }}>{matchScore}% match</Text>
          </View>
        )}
        {status}
      </View>

      <View style={styles.routeWrap}>
        <View style={styles.routeRail}>
          <View style={[styles.dot, { backgroundColor: theme.primary }]} />
          <View style={[styles.line, { backgroundColor: theme.border }]} />
          <View style={[styles.dot, { backgroundColor: theme.foreground }]} />
        </View>
        <View style={styles.routeText}>
          <Text style={[styles.city, { color: theme.foreground }]} numberOfLines={1}>
            {from}
          </Text>
          <Text style={[styles.city, { color: theme.foreground }]} numberOfLines={1}>
            {to}
          </Text>
        </View>
        {distanceKm != null && (
          <View style={[styles.distancePill, { backgroundColor: theme.accent }]}>
            <Text style={[styles.distanceText, { color: theme.accentForeground }]}>
              {Math.round(distanceKm).toLocaleString('en-IN')} km
            </Text>
          </View>
        )}
      </View>

      {meta.length > 0 && (
        <View style={styles.metaRow}>
          {meta.map((m, i) => (
            <React.Fragment key={i}>
              <Text style={[styles.meta, { color: theme.mutedForeground }]} numberOfLines={1}>
                {m}
              </Text>
              {i < meta.length - 1 && (
                <View style={[styles.separator, { backgroundColor: theme.border }]} />
              )}
            </React.Fragment>
          ))}
        </View>
      )}

      {footer && (
        <Text style={[styles.footer, { color: theme.mutedForeground }]} numberOfLines={1}>
          {footer}
        </Text>
      )}

      {matchReason && (
        <View style={[styles.reasonPill, { backgroundColor: theme.accent }]}>
          <Text style={{ color: theme.accentForeground, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
            {matchReason}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  matchBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  fare: { fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.02 },
  routeWrap: { flexDirection: 'row', alignItems: 'stretch' },
  routeRail: { width: 14, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  line: { flex: 1, width: 2 },
  routeText: { flex: 1, paddingLeft: spacing.sm, gap: 6 },
  city: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.01 },
  distancePill: { alignSelf: 'center', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full },
  distanceText: { fontSize: 12, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  meta: { fontSize: 13, fontWeight: '500' },
  separator: { width: 3, height: 3, borderRadius: 2 },
  footer: { fontSize: 13 },
  reasonPill: { alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
})
