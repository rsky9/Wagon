import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme, radius, spacing, typography } from '@wagon/design'

interface Props {
  from: string
  to: string
  stops?: string[]
  distanceKm?: number
  showStops?: boolean
}

/** A→B route rail with stops — the "spine" of a load card. */
export function RouteRail({ from, to, stops = [], distanceKm, showStops = true }: Props) {
  const theme = useTheme()
  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <View style={[styles.node, { backgroundColor: theme.primary }]} />
        {showStops && stops.length > 0 ? (
          <>
            {stops.map((s, i) => (
              <View key={i} style={[styles.nodeSmall, { backgroundColor: theme.mutedForeground }]} />
            ))}
          </>
        ) : (
          <View style={styles.connector} />
        )}
        <View style={[styles.node, { backgroundColor: theme.foreground }]} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.city, { color: theme.foreground }]} numberOfLines={1}>
          {from}
        </Text>
        {showStops && stops.length > 0 && (
          <Text style={[styles.stop, { color: theme.mutedForeground }]} numberOfLines={1}>
            via {stops.join(', ')}
          </Text>
        )}
        <Text style={[styles.city, { color: theme.foreground }]} numberOfLines={1}>
          {to}
        </Text>
      </View>
      {distanceKm != null && (
        <View style={styles.distance}>
          <Text style={[styles.distanceText, { color: theme.primary, backgroundColor: theme.accent }]}>
            {Math.round(distanceKm).toLocaleString('en-IN')} km
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  rail: { alignItems: 'center', paddingTop: 6 },
  node: { width: 12, height: 12, borderRadius: 6 },
  nodeSmall: { width: 7, height: 7, borderRadius: 4, marginVertical: 3 },
  connector: {
    width: 2,
    height: 18,
    marginVertical: 2,
    backgroundColor: '#CBD5E1',
    opacity: 0.6,
  },
  text: { flex: 1, paddingTop: 2 },
  city: { fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.01 },
  stop: { fontSize: 12, lineHeight: 16, marginVertical: 2 },
  distance: { paddingTop: 6 },
  distanceText: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
})
