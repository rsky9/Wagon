import { useEffect, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { api } from '../config'
import { completeQuestWithXp } from '../gamification'
import { uploadToPresignedUrl } from '@wagon/api-client'
import * as ImagePicker from 'expo-image-picker'
import { useI18n } from '@wagon/i18n'

interface Props {
  onBack: () => void
}

const DOCS = [
  { kind: 'pan', label: 'PAN card', icon: '🪪' },
  { kind: 'aadhar', label: 'Aadhaar card', icon: '🆔' },
  { kind: 'rc', label: 'Vehicle RC', icon: '🚛' },
  { kind: 'license', label: 'Driving license', icon: '📄' },
  { kind: 'selfie', label: 'Selfie', icon: '🤳' },
  { kind: 'bank', label: 'Bank / cheque', icon: '🏦' },
] as const

interface KycDoc {
  id: string
  kind: string
  status: string
}

export function KycScreen({ onBack }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [docs, setDocs] = useState<KycDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)

  const fetchDocs = () => {
    api
      .get<{ docs: KycDoc[] }>('/kyc/mine')
      .then((res) => setDocs(res.docs))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchDocs()
  }, [])

  const done = docs.filter((d) => d.status === 'approved').length
  const pct = Math.round((done / DOCS.length) * 100)

  const upload = async (kind: string) => {
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      })
      if (picked.canceled || !picked.assets?.[0]) return
      const asset = picked.assets[0]

      setUploading(kind)
      const presigned = await api.post<{ uploadUrl: string }>('/kyc/upload', {
        kind,
        mimeType: asset.mimeType ?? 'image/jpeg',
        size: asset.fileSize ?? 0,
      })
      await uploadToPresignedUrl(presigned.uploadUrl, {
        uri: asset.uri,
        name: `${kind}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      })
      Alert.alert('Uploaded', `${kind} submitted for review`)
      completeQuestWithXp('kyc', 60)
      fetchDocs()
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(null)
    }
  }

  const statusFor = (kind: string) => docs.find((d) => d.kind === kind)?.status

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
            <Text style={[styles.progressTitle, { color: theme.foreground }]}>KYC {pct}% complete</Text>
            <Text style={[styles.progressSub, { color: theme.mutedForeground }]}>
              Unlock payments, payouts & full quoting
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: theme.muted }]}>
            <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: theme.primary }]} />
          </View>
          <Text style={[styles.waitNote, { color: theme.mutedForeground }]}>
            Usually approved in under 24 hours
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: spacing.xxl }} />
        ) : (
          DOCS.map((doc) => {
            const status = statusFor(doc.kind)
            return (
              <Pressable
                key={doc.kind}
                style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => upload(doc.kind)}
                disabled={uploading !== null}
              >
                <View style={[styles.rowIcon, { backgroundColor: theme.muted }]}>
                  <Text style={{ fontSize: 20 }}>{doc.icon}</Text>
                </View>
                <View style={styles.rowLeft}>
                  <Text style={[styles.rowLabel, { color: theme.foreground }]}>{doc.label}</Text>
                  <Text
                    style={[
                      styles.rowStatus,
                      { color: status === 'approved' ? theme.success : status === 'pending' ? theme.warning : status === 'rejected' ? theme.danger : theme.mutedForeground },
                    ]}
                  >
                    {status === 'approved' ? '✓ Verified' : status === 'pending' ? 'Under review' : status === 'rejected' ? 'Rejected — tap to retry' : 'Not uploaded'}
                  </Text>
                </View>
                {uploading === doc.kind ? (
                  <ActivityIndicator color={theme.primary} />
                ) : (
                  <Text style={[styles.uploadText, { color: status === 'approved' ? theme.success : theme.primary }]}>
                    {status === 'approved' ? '✓' : status === 'pending' ? '•••' : 'Upload'}
                  </Text>
                )}
              </Pressable>
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
  waitNote: { fontSize: 12, marginTop: spacing.sm },
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
  uploadText: { fontWeight: '700', fontSize: 14 },
})
