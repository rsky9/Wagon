import { useState } from 'react'
import { StyleSheet, Text, View, TextInput, Pressable, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { Button } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'

interface Props {
  onBack: () => void
  onSubmitted: () => void
}

const TYPES = ['Damaged goods', 'Missing goods', 'Delay', 'Payment dispute', 'POD dispute', 'Unexpected charges', 'Other']

export function RaiseDisputeScreen({ onBack, onSubmitted }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [tripId, setTripId] = useState('')
  const [subject, setSubject] = useState('')
  const [evidence, setEvidence] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const inputStyle = {
    backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground,
    borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 15,
  }

  const submit = async () => {
    if (!tripId.trim() || !subject.trim()) { Alert.alert(t('ui.required'), 'Enter trip ID and describe the issue'); return }
    setSubmitting(true)
    try {
      await api.post('/disputes', {
        tripId: tripId.trim(),
        subject: subject.trim(),
        evidenceKeys: evidence.trim() ? [evidence.trim()] : undefined,
      })
      Alert.alert(t('ui.raised'), 'Our team will review the dispute with the full trip timeline.', [{ text: 'OK', onPress: onSubmitted }])
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed to raise')
    } finally { setSubmitting(false) }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('raiseDispute.title')}</Text>
        <View style={{ width: 20 }} />
      </View>

      <View style={styles.body}>
        <Text style={[styles.hint, { color: theme.mutedForeground }]}>
          Disputes are reviewed against the booking snapshot, negotiation history and trip events — no need to explain everything again.
        </Text>

        <Field label={t('raiseDispute.tripIdHint')} theme={theme}>
          <TextInput style={inputStyle} value={tripId} onChangeText={setTripId} placeholder={t('raiseDispute.tripId')} placeholderTextColor={theme.mutedForeground + '88'} />
        </Field>

        <Field label={t('raiseDispute.issueType')} theme={theme}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {TYPES.map((t) => (
              <Pressable key={t} onPress={() => setSubject(t)} style={{ borderRadius: radius.full, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: subject === t ? theme.primary : theme.background, borderColor: subject === t ? theme.primary : theme.border }}>
                <Text style={{ color: subject === t ? '#fff' : theme.mutedForeground, fontSize: 12, fontWeight: '600' }}>{t}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label={t('raiseDispute.description')} theme={theme}>
          <TextInput style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]} value={subject && !TYPES.includes(subject) ? subject : ''} onChangeText={setSubject} placeholder={t('raiseDispute.describe')} multiline placeholderTextColor={theme.mutedForeground + '88'} />
        </Field>

        <Field label={t('raiseDispute.evidence')} theme={theme}>
          <TextInput style={inputStyle} value={evidence} onChangeText={setEvidence} placeholder={t('raiseDispute.evidenceExample')} placeholderTextColor={theme.mutedForeground + '88'} />
        </Field>

        <Button label={t('raiseDispute.submit')} onPress={submit} loading={submitting} />
      </View>
    </SafeAreaView>
  )
}

function Field({ label, children, theme }: { label: string; children: React.ReactNode; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[styles.label, { color: theme.mutedForeground }]}>{label}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  body: { padding: spacing.lg },
  hint: { fontSize: 13, lineHeight: 19, marginBottom: spacing.lg },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
})
