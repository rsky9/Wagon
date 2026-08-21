import { useState } from 'react'
import { StyleSheet, Text, View, TextInput, Pressable, Alert, ScrollView } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { uploadToPresignedUrl } from '@wagon/api-client'
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
  const [type, setType] = useState('')
  const [subject, setSubject] = useState('')
  const [evidence, setEvidence] = useState('')
  const [evidenceKeys, setEvidenceKeys] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const inputStyle = {
    backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground,
    borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 15,
  }

  const pickEvidence = async () => {
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 })
      if (picked.canceled || !picked.assets?.[0]) return
      const asset = picked.assets[0]
      if ((asset.fileSize ?? 0) > 10 * 1024 * 1024) { Alert.alert('File too large', 'Images must be under 10 MB'); return }
      const presigned = await api.post<{ uploadUrl: string; key: string }>(`/uploads/presign`, {
        folder: `disputes/${tripId || 'evidence'}`, mimeType: asset.mimeType ?? 'image/jpeg', size: asset.fileSize ?? 0,
      }).catch(() => api.post<{ uploadUrl: string; key: string }>(`/kyc/pod/${tripId}`, { mimeType: asset.mimeType ?? 'image/jpeg', size: asset.fileSize ?? 0 }))
      await uploadToPresignedUrl(presigned.uploadUrl, { uri: asset.uri, name: 'evidence.jpg', type: asset.mimeType ?? 'image/jpeg' })
      const key = (presigned as { key?: string }).key ?? asset.uri
      setEvidenceKeys((prev) => [...prev, key])
      Alert.alert('Evidence added', 'Photo attached to this dispute')
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed to attach evidence')
    }
  }

  const submit = async () => {
    if (!tripId.trim() || !type.trim()) { Alert.alert(t('ui.required'), 'Enter trip ID and pick an issue type'); return }
    if (!subject.trim()) { Alert.alert(t('ui.required'), 'Describe the issue'); return }
    setSubmitting(true)
    try {
      const keys = [...evidenceKeys, ...(evidence.trim() ? [evidence.trim()] : [])]
      await api.post('/disputes', {
        tripId: tripId.trim(),
        subject: subject.trim(),
        issueType: type.trim(),
        evidenceKeys: keys.length ? keys : undefined,
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
            {TYPES.map((tt) => (
              <Pressable key={tt} onPress={() => setType(tt)} style={{ borderRadius: radius.full, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: type === tt ? theme.primary : theme.background, borderColor: type === tt ? theme.primary : theme.border }}>
                <Text style={{ color: type === tt ? '#fff' : theme.mutedForeground, fontSize: 12, fontWeight: '600' }}>{tt}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label={t('raiseDispute.description')} theme={theme}>
          <TextInput style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]} value={subject} onChangeText={setSubject} placeholder={t('raiseDispute.describe')} multiline placeholderTextColor={theme.mutedForeground + '88'} />
        </Field>

        <Field label={t('raiseDispute.evidence')} theme={theme}>
          <TextInput style={inputStyle} value={evidence} onChangeText={setEvidence} placeholder={t('raiseDispute.evidenceExample')} placeholderTextColor={theme.mutedForeground + '88'} />
          <Pressable style={{ borderRadius: radius.md, borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed', padding: spacing.md, alignItems: 'center', marginTop: spacing.sm }} onPress={pickEvidence}>
            <Text style={{ color: theme.primary, fontWeight: '700' }}>📎 Attach photo evidence</Text>
          </Pressable>
          {evidenceKeys.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {evidenceKeys.map((k, i) => (
                <View key={`${k}-${i}`} style={{ borderRadius: radius.md, borderWidth: 1, borderColor: theme.border, padding: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text style={{ color: theme.foreground, fontSize: 12 }} numberOfLines={1}>Photo {i + 1}</Text>
                  <Pressable onPress={() => setEvidenceKeys((prev) => prev.filter((_, idx) => idx !== i))} hitSlop={8}>
                    <Text style={{ color: theme.danger, fontWeight: '700' }}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          )}
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
