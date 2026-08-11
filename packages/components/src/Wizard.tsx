import { View, Text, StyleSheet, Pressable, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { useI18n } from '@wagon/i18n'
import { Button } from './Button'

interface Step {
  key: string
  label: string
}

interface Props {
  title: string
  steps: Step[]
  step: number
  onNext: () => void
  onBackStep: () => void
  onSkip?: () => void
  canNext: boolean
  submitting?: boolean
  nextLabel?: string
  children: React.ReactNode
}

/** Multi-step wizard shell with progress indicator + back/next navigation. */
export function Wizard({ title, steps, step, onNext, onBackStep, onSkip, canNext, submitting, nextLabel = 'Continue', children }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const progress = ((step + 1) / steps.length) * 100

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBackStep} hitSlop={8} disabled={step === 0}>
          <Text style={{ color: step === 0 ? 'transparent' : theme.mutedForeground, fontSize: 20 }}>←</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{title}</Text>
        {onSkip ? (
          <Pressable onPress={onSkip} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 14 }}>{t('ui.skip')}</Text></Pressable>
        ) : <View style={{ width: 30 }} />}
      </View>

      <View style={[styles.steps, { backgroundColor: theme.muted }]}>
        {steps.map((s, i) => (
          <View key={s.key} style={{ flex: 1, alignItems: 'center' }}>
            <View style={[styles.stepDot, { backgroundColor: i <= step ? theme.primary : theme.border }]}>
              {i < step ? <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✓</Text> : <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{i + 1}</Text>}
            </View>
            <Text style={[styles.stepLabel, { color: i <= step ? theme.primary : theme.mutedForeground }]} numberOfLines={1}>{s.label}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.progressTrack, { backgroundColor: theme.muted }]}>
        <View style={[styles.progressFill, { backgroundColor: theme.primary, width: `${progress}%` }]} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.border, paddingBottom: 12 }]}>
          <Button label={nextLabel} onPress={onNext} disabled={!canNext} loading={submitting} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme()
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground }]}>{label}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '800' },
  steps: { flexDirection: 'row', paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.xs },
  stepDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  stepLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  progressTrack: { height: 4, borderRadius: 2, marginHorizontal: spacing.lg, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  body: { padding: spacing.lg, paddingBottom: 40 },
  footer: { padding: spacing.lg, paddingBottom: 12, borderTopWidth: 1 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
})
