import { useCallback, useEffect, useRef, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { Button } from '@wagon/components'
import { api } from '../config'
import { completeQuestWithXp } from '../gamification'
import { uploadToPresignedUrl } from '@wagon/api-client'
import * as ImagePicker from 'expo-image-picker'
import { useI18n } from '@wagon/i18n'
import { useAuth } from '../auth'

interface Props {
  onBack: () => void
}

interface KycDoc {
  id: string
  kind: string
  status: string
}

const DOC_LABELS: Record<string, { label: string; icon: string; hint: string }> = {
  aadhar: { label: 'Aadhaar', icon: '🆔', hint: 'Person identification (Setu)' },
  selfie: { label: 'Selfie', icon: '🤳', hint: 'Face verification (face API)' },
  pan: { label: 'PAN card', icon: '🪪', hint: 'Financial verification (Setu)' },
  bank: { label: 'Bank / cheque', icon: '🏦', hint: 'Payout account (Setu)' },
  rc: { label: 'Vehicle RC', icon: '🚛', hint: 'Vehicle verification (Vahan)' },
  license: { label: 'Driving license', icon: '📄', hint: 'Driver verification (DigiLocker)' },
  company: { label: 'Company proof', icon: '🏢', hint: 'Business verification (KYB)' },
}

// Docs that are verified by submitting data (Setu / face) rather than an image review.
const DATA_DOCS = ['aadhar', 'pan', 'bank']
const IMAGE_DOCS = ['selfie', 'rc', 'license']

export function KycScreen({ onBack }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const { session } = useAuth()
  const [required, setRequired] = useState<string[]>([])
  const [docs, setDocs] = useState<KycDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [verifyKind, setVerifyKind] = useState<string | null>(null)
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const fetchAll = useCallback(() => {
    Promise.all([
      api.get<{ requirements: string[] }>('/kyc/requirements').then((r) => setRequired(r.requirements)).catch(() => {}),
      api.get<{ docs: KycDoc[] }>('/kyc/mine').then((r) => setDocs(r.docs)).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const statusFor = (kind: string) => docs.find((d) => d.kind === kind)?.status
  const done = required.filter((k) => statusFor(k) === 'approved').length
  const pct = required.length ? Math.round((done / required.length) * 100) : 0

  // Award the KYC quest XP once identity (aadhar + selfie) is verified.
  const kycQuestAwarded = useRef(false)
  useEffect(() => {
    if (kycQuestAwarded.current) return
    const identity = ['aadhar', 'selfie']
    const approvedAll = identity.every((k) => required.includes(k) && statusFor(k) === 'approved')
    if (approvedAll) {
      kycQuestAwarded.current = true
      void completeQuestWithXp('kyc', 60)
    }
  }, [docs, required])

  const pickAndUpload = async (kind: string) => {
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      })
      if (picked.canceled || !picked.assets?.[0]) return
      const asset = picked.assets[0]
      setBusy(true)
      const presigned = await api.post<{ uploadUrl: string; documentId: string }>('/kyc/upload', {
        kind,
        mimeType: asset.mimeType ?? 'image/jpeg',
        size: asset.fileSize ?? 0,
      })
      await uploadToPresignedUrl(presigned.uploadUrl, {
        uri: asset.uri,
        name: `${kind}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      })
      // Run provider verification: selfie → face API, rc/license → Vahan/DigiLocker.
      await api.post('/kyc/verify', {
        kind,
        selfieKey: kind === 'selfie' ? `${kind}-uploaded` : undefined,
        rcNumber: kind === 'rc' ? inputs.rcNumber ?? '' : undefined,
        licenseNumber: kind === 'license' ? inputs.licenseNumber ?? '' : undefined,
      })
      Alert.alert('Verified', `${DOC_LABELS[kind]?.label ?? kind} verified`)
      fetchAll()
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Verification failed')
    } finally {
      setBusy(false)
    }
  }

  const verifyData = async (kind: string) => {
    setBusy(true)
    try {
      const payload: Record<string, string> = { kind }
      if (kind === 'pan') payload.pan = inputs.pan ?? ''
      if (kind === 'aadhar') payload.aadhar = inputs.aadhar ?? ''
      if (kind === 'bank') {
        payload.account = inputs.account ?? ''
        payload.ifsc = inputs.ifsc ?? ''
        payload.upi = inputs.upi ?? ''
        payload.statementKey = inputs.statementKey ?? ''
      }
      const res = await api.post<{ verified: boolean; source: string }>('/kyc/verify', payload)
      Alert.alert(res.verified ? 'Verified' : 'Not verified', res.verified ? `Verified via ${res.source}` : 'Please check your details and try again')
      if (res.verified) setVerifyKind(null)
      fetchAll()
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Verification failed')
    } finally {
      setBusy(false)
    }
  }

  const renderVerifyForm = (kind: string) => {
    const isImage = IMAGE_DOCS.includes(kind)
    return (
      <View style={[styles.form, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {kind === 'pan' && (
          <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={inputs.pan ?? ''} onChangeText={(v) => setInputs((s) => ({ ...s, pan: v }))} placeholder="PAN number (e.g. ABCDE1234F)" placeholderTextColor={theme.mutedForeground + '88'} autoCapitalize="characters" />
        )}
        {kind === 'aadhar' && (
          <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={inputs.aadhar ?? ''} onChangeText={(v) => setInputs((s) => ({ ...s, aadhar: v }))} placeholder="Aadhaar number (12 digits)" placeholderTextColor={theme.mutedForeground + '88'} keyboardType="number-pad" maxLength={12} />
        )}
        {kind === 'bank' && (
          <>
            <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={inputs.account ?? ''} onChangeText={(v) => setInputs((s) => ({ ...s, account: v }))} placeholder="Bank account number" placeholderTextColor={theme.mutedForeground + '88'} keyboardType="number-pad" />
            <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={inputs.ifsc ?? ''} onChangeText={(v) => setInputs((s) => ({ ...s, ifsc: v }))} placeholder="IFSC code" placeholderTextColor={theme.mutedForeground + '88'} autoCapitalize="characters" />
            <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={inputs.upi ?? ''} onChangeText={(v) => setInputs((s) => ({ ...s, upi: v }))} placeholder="UPI ID (optional)" placeholderTextColor={theme.mutedForeground + '88'} />
          </>
        )}
        {kind === 'rc' && (
          <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={inputs.rcNumber ?? ''} onChangeText={(v) => setInputs((s) => ({ ...s, rcNumber: v }))} placeholder="RC / vehicle number" placeholderTextColor={theme.mutedForeground + '88'} autoCapitalize="characters" />
        )}
        {kind === 'license' && (
          <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={inputs.licenseNumber ?? ''} onChangeText={(v) => setInputs((s) => ({ ...s, licenseNumber: v }))} placeholder="Driving license number" placeholderTextColor={theme.mutedForeground + '88'} autoCapitalize="characters" />
        )}
        {isImage ? (
          <Button label={`Upload & verify ${DOC_LABELS[kind]?.label ?? kind}`} onPress={() => pickAndUpload(kind)} loading={busy} size="md" />
        ) : (
          <Button label="Verify" onPress={() => verifyData(kind)} loading={busy} size="md" />
        )}
        <Pressable onPress={() => setVerifyKind(null)} hitSlop={8}>
          <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: spacing.sm }}>Cancel</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={[styles.back, { color: theme.mutedForeground }]}>←</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.foreground }]}>{t('kyc.title')}</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.progressCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.progressTop}>
            <Text style={[styles.progressTitle, { color: theme.foreground }]}>Identity {pct}% complete</Text>
            <Text style={[styles.progressSub, { color: theme.mutedForeground }]}>
              {done}/{required.length} verified
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: theme.muted }]}>
            <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: theme.primary }]} />
          </View>
          <Text style={[styles.waitNote, { color: theme.mutedForeground }]}>
            Explore the app freely — verification is only needed when you post a load, bid, accept or get paid.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: spacing.xxl }} />
        ) : required.length === 0 ? (
          <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>
            No additional verification needed for your account.
          </Text>
        ) : (
          required.map((kind) => {
            const status = statusFor(kind)
            const meta = DOC_LABELS[kind] ?? { label: kind, icon: '📄', hint: '' }
            return (
              <View key={kind}>
                <Pressable
                  style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
                  onPress={() => { setVerifyKind(kind); setInputs({}) }}
                  disabled={busy || status === 'approved'}
                >
                  <View style={[styles.rowIcon, { backgroundColor: theme.muted }]}>
                    <Text style={{ fontSize: 20 }}>{meta.icon}</Text>
                  </View>
                  <View style={styles.rowLeft}>
                    <Text style={[styles.rowLabel, { color: theme.foreground }]}>{meta.label}</Text>
                    <Text style={{ color: theme.mutedForeground, fontSize: 12 }}>{meta.hint}</Text>
                    <Text
                      style={[
                        styles.rowStatus,
                        { color: status === 'approved' ? theme.success : status === 'pending' ? theme.warning : status === 'rejected' ? theme.danger : theme.mutedForeground },
                      ]}
                    >
                      {status === 'approved' ? '✓ Verified' : status === 'pending' ? 'Under review' : status === 'rejected' ? 'Rejected — tap to retry' : 'Tap to verify'}
                    </Text>
                  </View>
                  {status === 'approved' ? <Text style={{ color: theme.success, fontWeight: '800' }}>✓</Text> : <Text style={{ color: theme.primary, fontWeight: '700' }}>Verify</Text>}
                </Pressable>
                {verifyKind === kind && renderVerifyForm(kind)}
              </View>
            )
          })
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  back: { fontSize: 20, fontWeight: '600', width: 30 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  body: { padding: spacing.lg },
  progressCard: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, marginBottom: spacing.lg },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  progressTitle: { fontSize: 17, fontWeight: '800' },
  progressSub: { fontSize: 12, marginTop: 2 },
  progressTrack: { height: 8, borderRadius: 4, marginTop: spacing.md, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  waitNote: { fontSize: 12, marginTop: spacing.sm, lineHeight: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  rowIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  rowLeft: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowStatus: { fontSize: 13, marginTop: 1 },
  form: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.md },
  input: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 15 },
})
