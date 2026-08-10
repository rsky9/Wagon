import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme, radius, spacing, typography } from '@wagon/design'

interface Step {
  label: string
  detail?: string
  state: 'done' | 'active' | 'upcoming'
  icon?: string
}

interface Props {
  steps: Step[]
}

/** Vertical timeline status tracker — latest state prominent at top. */
export function StatusStepper({ steps }: Props) {
  const theme = useTheme()
  return (
    <View style={styles.container}>
      {steps.map((step, i) => {
        const isDone = step.state === 'done'
        const isActive = step.state === 'active'
        const isLast = i === steps.length - 1
        return (
          <View key={i} style={styles.row}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.node,
                  isDone && { backgroundColor: theme.success },
                  isActive && { backgroundColor: theme.primary },
                  !isDone && !isActive && { backgroundColor: theme.border },
                ]}
              >
                {isDone && <Text style={styles.check}>✓</Text>}
              </View>
              {!isLast && (
                <View
                  style={[
                    styles.line,
                    isDone ? { backgroundColor: theme.success } : { backgroundColor: theme.border },
                  ]}
                />
              )}
            </View>
            <View style={[styles.content, { backgroundColor: isActive ? theme.accent : 'transparent' }]}>
              <Text
                style={[
                  styles.label,
                  { color: theme.foreground },
                  isActive && { color: theme.primary },
                  !isDone && !isActive && { color: theme.mutedForeground },
                ]}
              >
                {step.label}
              </Text>
              {step.detail && (
                <Text style={[styles.detail, { color: theme.mutedForeground }]}>{step.detail}</Text>
              )}
            </View>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 0 },
  row: { flexDirection: 'row' },
  rail: { width: 28, alignItems: 'center' },
  node: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: { color: '#fff', fontSize: 13, fontWeight: '700' },
  line: { width: 2, flex: 1, marginVertical: 2 },
  content: {
    flex: 1,
    paddingLeft: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: 2,
  },
  label: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  detail: { fontSize: 13, lineHeight: 18, marginTop: 1 },
})
