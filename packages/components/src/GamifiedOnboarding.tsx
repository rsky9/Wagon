import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView, KeyboardAvoidingView, Platform, Animated, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius, shadows } from '@wagon/design'
import { Button } from './Button'

interface PhaseStep {
  key: string
  title: string
  icon: string
  hint?: string
  render: () => React.ReactNode
  valid: boolean
}

interface Props {
  roleName: string
  phaseTitle: string
  phaseSubtitle: string
  steps: PhaseStep[]
  xpPerStep: number
  onSubmit: () => Promise<void>
  onComplete: () => void
  onSkip: () => void
  nextLabel?: string
}

/** Gamified, phased onboarding: 3-4 essential steps with XP + badge celebration. */
export function GamifiedOnboarding({ roleName, phaseTitle, phaseSubtitle, steps, xpPerStep, onSubmit, onComplete, onSkip, nextLabel = 'Continue' }: Props) {
  const theme = useTheme()
  const [step, setStep] = useState(0)
  const [xp, setXp] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const pulse = useRef(new Animated.Value(0)).current

  const progress = ((step + 1) / (steps.length + 1)) * 100
  const totalXp = steps.length * xpPerStep

  useEffect(() => {
    if (step > 0) {
      setXp(step * xpPerStep)
      Animated.timing(pulse, { toValue: 1, duration: 350, useNativeDriver: true }).start(() => pulse.setValue(0))
    }
  }, [step, xpPerStep, pulse])

  const advance = () => {
    if (step < steps.length - 1) {
      setStep(step + 1)
    } else {
      setStep(steps.length) // celebration screen
    }
  }

  const finish = async () => {
    setSubmitting(true)
    try {
      await onSubmit()
      setCelebrate(true)
      onComplete()
    } catch {
      setSubmitting(false)
    }
  }

  const renderHeader = () => (
    <>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => step > 0 && setStep(step - 1)} hitSlop={8} disabled={step === 0}>
          <Text style={{ color: step === 0 ? 'transparent' : theme.mutedForeground, fontSize: 20 }}>←</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{phaseTitle}</Text>
        <Pressable onPress={onSkip} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 14 }}>Skip</Text></Pressable>
      </View>

      <View style={[styles.levelBar, { backgroundColor: theme.muted }]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={[styles.levelLabel, { color: theme.mutedForeground }]}>Level {1 + Math.floor(xp / 120)}</Text>
            <Text style={[styles.xpLabel, { color: theme.primary, fontWeight: '800' }]}>+{xp} XP</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
            <View style={[styles.progressFill, { backgroundColor: theme.primary, width: `${Math.min((xp / totalXp) * 100, 100)}%` }]} />
          </View>
        </View>
        <Animated.View style={[styles.xpChip, { backgroundColor: theme.accent, transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }] }]}>
          <Text style={{ color: theme.accentForeground, fontSize: 12, fontWeight: '800' }}>⚡ {xp}</Text>
        </Animated.View>
      </View>
    </>
  )

  if (celebrate) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        {renderHeader()}
        <View style={styles.celebrateBody}>
          <Text style={{ fontSize: 64, textAlign: 'center' }}>🎉</Text>
          <Text style={[styles.celebrateTitle, { color: theme.foreground }]}>Welcome aboard, {roleName}!</Text>
          <Text style={[styles.celebrateSub, { color: theme.mutedForeground }]}>
            You've unlocked <Text style={{ color: theme.primary, fontWeight: '800' }}>Phase 1</Text>. More quests and rewards open up as you use Wagon.
          </Text>
          <View style={[styles.badgeRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={{ fontSize: 22 }}>🎓</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.badgeTitle, { color: theme.foreground }]}>Onboarded badge unlocked</Text>
              <Text style={[styles.badgeSub, { color: theme.mutedForeground }]}>+{totalXp} XP earned in Phase 1</Text>
            </View>
          </View>
        </View>
        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <Button label="Start using Wagon" onPress={onComplete} />
        </View>
      </SafeAreaView>
    )
  }

  const isDoneStep = step >= steps.length
  const current = isDoneStep ? null : steps[step]

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      {renderHeader()}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {isDoneStep ? (
            <View style={styles.doneCard}>
              <Text style={{ fontSize: 56, textAlign: 'center' }}>🏁</Text>
              <Text style={[styles.doneTitle, { color: theme.foreground }]}>Phase 1 complete!</Text>
              <Text style={[styles.doneSub, { color: theme.mutedForeground }]}>
                {phaseSubtitle} You earned <Text style={{ color: theme.primary, fontWeight: '800' }}>+{totalXp} XP</Text> and the <Text style={{ color: theme.primary, fontWeight: '800' }}>Onboarded</Text> badge.
              </Text>
              <View style={[styles.nextPhase, { backgroundColor: theme.accent, borderColor: theme.primary + '33' }]}>
                <Text style={{ color: theme.accentForeground, fontSize: 13, fontWeight: '700' }}>🔓 What's next in Phase 2</Text>
                <Text style={{ color: theme.accentForeground, fontSize: 12, marginTop: 2, opacity: 0.85 }}>
                  Add trucks & drivers (transporter) or post your first load (supplier) — each quest earns XP and badges.
                </Text>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.stepBadge}>
                <Text style={{ fontSize: 40 }}>{current!.icon}</Text>
              </View>
              <Text style={[styles.stepTitle, { color: theme.foreground }]}>{current!.title}</Text>
              {current!.hint && <Text style={[styles.stepHint, { color: theme.mutedForeground }]}>{current!.hint}</Text>}
              <View style={styles.stepBody}>{current!.render()}</View>
            </>
          )}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          {isDoneStep ? (
            <Button label="Finish & see rewards" onPress={finish} loading={submitting} />
          ) : (
            <Button label={nextLabel} onPress={advance} disabled={!current!.valid} />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export function QuestField({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme()
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground }]}>{label}</Text>
      {children}
    </View>
  )
}

export function questInputStyle(theme: ReturnType<typeof useTheme>) {
  return {
    backgroundColor: theme.background,
    borderColor: theme.border,
    color: theme.foreground,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 17, fontWeight: '800' },
  levelBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  levelLabel: { fontSize: 11, fontWeight: '600' },
  xpLabel: { fontSize: 11 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  xpChip: { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6 },
  body: { padding: spacing.lg, alignItems: 'center' },
  stepBadge: { width: 84, height: 84, borderRadius: 42, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  stepTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: spacing.md },
  stepHint: { fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: spacing.lg },
  stepBody: { alignSelf: 'stretch', marginTop: spacing.sm },
  doneCard: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.md, width: '100%' },
  doneTitle: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  doneSub: { fontSize: 14, textAlign: 'center', lineHeight: 21, paddingHorizontal: spacing.md },
  nextPhase: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, width: '100%', marginTop: spacing.md },
  celebrateBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  celebrateTitle: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  celebrateSub: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, width: '100%', marginTop: spacing.md },
  badgeTitle: { fontSize: 15, fontWeight: '800' },
  badgeSub: { fontSize: 12, marginTop: 2 },
  footer: { padding: spacing.lg, paddingBottom: 12, borderTopWidth: 1 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
})
