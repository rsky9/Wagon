import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, TextInput, Pressable, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { Button } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'
import { useStepUp } from '../hooks/useStepUp'

interface BankInfo {
  account: string | null
  ifsc: string | null
  holder: string | null
}

interface Props {
  onBack: () => void
}

export function BankScreen({ onBack }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const { stepUp } = useStepUp()
  const [bank, setBank] = useState<BankInfo | null>(null)
  const [account, setAccount] = useState('')
  const [ifsc, setIfsc] = useState('')
  const [holder, setHolder] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = () => {
    setError(null)
    api.get<{ bank: BankInfo | null }>('/auth/bank').then((res) => {
      setBank(res.bank)
      if (res.bank) {
        setAccount(res.bank.account ?? '')
        setIfsc(res.bank.ifsc ?? '')
        setHolder(res.bank.holder ?? '')
      }
    }).catch((e) => setError(e instanceof Error ? e.message : 'Failed to load bank details'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetch() }, [])

  const save = async () => {
    if (!account.trim() || !ifsc.trim()) { Alert.alert(t('ui.required'), 'Enter account number and IFSC'); return }
    // Changing the payout destination redirects future money — verify identity
    // with a fresh action OTP before the backend accepts the new account.
    const token = await stepUp('update_bank')
    if (!token) return
    setSaving(true)
    try {
      await api.patch('/auth/bank', { account: account.trim(), ifsc: ifsc.trim(), holder: holder.trim() }, { 'x-action-token': token })
      Alert.alert(t('ui.saved'), 'Payout details updated')
      fetch()
    } catch (e) {
      Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  const inputStyle = {
    backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground,
    borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 15,
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('bank.title')}</Text>
        <View style={{ width: 20 }} />
      </View>

      <View style={styles.body}>
        {loading ? (
          <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 40 }}>{t('common.loading')}</Text>
        ) : error ? (
          <View style={{ alignItems: 'center', gap: spacing.md, marginTop: 40 }}>
            <Text style={{ color: theme.foreground, fontWeight: '800' }}>Could not load bank details</Text>
            <Text style={{ color: theme.mutedForeground, textAlign: 'center' }}>{error}</Text>
            <Pressable style={{ padding: spacing.md, backgroundColor: '#F97316', borderRadius: radius.md }} onPress={() => { setLoading(true); fetch() }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Retry</Text>
            </Pressable>
          </View>
        ) : (
        <>
        <View style={[styles.info, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={{ color: theme.mutedForeground, fontSize: 13, lineHeight: 19 }}>
            Your payout details are used to settle trips. They're stored securely and only shown to you.
          </Text>
        </View>

        <Field label={t('bank.accountNumber')} theme={theme}>
          <TextInput style={inputStyle} value={account} onChangeText={setAccount} keyboardType="number-pad" placeholder={t('bank.bankAccountNumber')} placeholderTextColor={theme.mutedForeground + '88'} />
        </Field>
        <Field label={t('bank.ifsc')} theme={theme}>
          <TextInput style={inputStyle} value={ifsc} onChangeText={setIfsc} placeholder={t('bank.ifscExample')} autoCapitalize="characters" placeholderTextColor={theme.mutedForeground + '88'} />
        </Field>
        <Field label={t('bank.accountHolder')} theme={theme}>
          <TextInput style={inputStyle} value={holder} onChangeText={setHolder} placeholder={t('bank.holderHint')} placeholderTextColor={theme.mutedForeground + '88'} />
        </Field>

        <Button label={t('bank.save')} onPress={save} loading={saving} />
        </>
        )}
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
  info: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, marginBottom: spacing.lg },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
})
