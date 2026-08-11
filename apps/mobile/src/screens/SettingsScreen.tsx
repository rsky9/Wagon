import { SafeAreaView } from 'react-native-safe-area-context'
import { useState } from 'react'
import { StyleSheet, Text, View, ScrollView, Pressable, Linking, Alert } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'
import { SUPPORTED_LANGUAGES, useI18n } from '@wagon/i18n'
import { api } from '../config'
import { useAuth } from '../auth'
import { useThemeMode } from '../theme'

interface Props {
  onBack: () => void
  onChangeRole?: () => void
}

type Section = 'main' | 'language' | 'help' | 'privacy' | 'security' | 'account'

export function SettingsScreen({ onBack, onChangeRole }: Props) {
  const theme = useTheme()
  const { t, lang, setLang } = useI18n()
  const { logout } = useAuth()
  const [section, setSection] = useState<Section>('main')

  if (section === 'account') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <Header title={t('settings.account')} onBack={() => setSection('main')} theme={theme} />
        <ScrollView contentContainerStyle={styles.body}>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.foreground }]}>{t('settings.manageAccount')}</Text>
            <Text style={[styles.cardText, { color: theme.mutedForeground }]}>
              Switch between working as a transporter, supplier or driver, or log out securely.
            </Text>
          </View>
          <Pressable
            style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={onChangeRole}
          >
            <Text style={{ fontSize: 18 }}>🔄</Text>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={[styles.rowTitle, { color: theme.foreground }]}>{t('settings.changeUserType')}</Text>
              <Text style={[styles.rowSub, { color: theme.mutedForeground }]}>{t('settings.changeUserTypeSub')}</Text>
            </View>
            <Text style={{ color: theme.mutedForeground }}>›</Text>
          </Pressable>
          <Pressable
            style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() =>
              Alert.alert('Logout?', 'You will need to verify your number again to sign in.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Logout', style: 'destructive', onPress: logout },
              ])
            }
          >
            <Text style={{ fontSize: 18 }}>⎋</Text>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={[styles.rowTitle, { color: theme.danger }]}>Logout</Text>
              <Text style={[styles.rowSub, { color: theme.mutedForeground }]}>{t('settings.logoutConfirm')}</Text>
            </View>
            <Text style={{ color: theme.mutedForeground }}>›</Text>
          </Pressable>
          <Pressable
            style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() =>
              Alert.alert(
                'Delete account?',
                'This permanently deletes your profile, trucks and trip history. This cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete my account',
                    style: 'destructive',
                    onPress: () => {
                      api.post('/auth/delete').then(() => {
                        Alert.alert('Deleted', 'Your account has been permanently deleted.', [{ text: 'OK', onPress: logout }])
                      }).catch(() => Alert.alert('Error', 'Could not delete account. Contact support.'))
                    },
                  },
                ],
              )
            }
          >
            <Text style={{ fontSize: 18 }}>🗑️</Text>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={[styles.rowTitle, { color: theme.danger }]}>{t('settings.deleteAccount')}</Text>
              <Text style={[styles.rowSub, { color: theme.mutedForeground }]}>{t('settings.deleteSub')}</Text>
            </View>
            <Text style={{ color: theme.mutedForeground }}>›</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (section === 'privacy') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <Header title={t('settings.privacy')} onBack={() => setSection('main')} theme={theme} />
        <ScrollView contentContainerStyle={styles.body}>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.foreground }]}>{t('settings.privacyMatters')}</Text>
            <Text style={[styles.cardText, { color: theme.mutedForeground }]}>
              Wagon collects only what's needed to run the marketplace: your profile, vehicle and bank details for payouts, and location during active trips.
            </Text>
          </View>
          <PrivacyRow title="Phone number" desc="Used for login and trip communication" on={true} theme={theme} />
          <PrivacyRow title="Location" desc="Shared only during in-transit trips" on={true} theme={theme} />
          <PrivacyRow title="Trip history" desc="Kept for accounting and ratings" on={true} theme={theme} />
          <PrivacyRow title="Marketing updates" desc="Optional promotional messages" on={false} theme={theme} />
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (section === 'security') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <Header title={t('settings.security')} onBack={() => setSection('main')} theme={theme} />
        <ScrollView contentContainerStyle={styles.body}>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.foreground }]}>{t('settings.accountSecurity')}</Text>
            <Text style={[styles.cardText, { color: theme.mutedForeground }]}>
              We use OTP-based login with no passwords. Your session is encrypted on-device.
            </Text>
          </View>
          <SecurityRow icon="📱" label="Biometric lock" desc="Unlock the app with fingerprint / face" theme={theme} />
          <SecurityRow icon="🛡️" label="KYC verification" desc="Full verification unlocks payments" theme={theme} />
          <SecurityRow icon="🔐" label="Escrow protection" desc="Payments held until delivery confirmed" theme={theme} />
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (section === 'language') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <Header title={t('settings.language')} onBack={() => setSection('main')} theme={theme} />
        <ScrollView contentContainerStyle={styles.body}>
          {SUPPORTED_LANGUAGES.map((l) => (
            <Pressable key={l.code} style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => setLang(l.code)}>
              <Text style={[styles.rowTitle, { color: theme.foreground }]}>{l.native} · {l.name}</Text>
              {lang === l.code && <Text style={{ color: theme.primary, fontWeight: '800' }}>✓</Text>}
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (section === 'help') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <Header title={t('settings.helpSupport')} onBack={() => setSection('main')} theme={theme} />
        <ScrollView contentContainerStyle={styles.body}>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.foreground }]}>{t('settings.needHelp')}</Text>
            <Text style={[styles.cardText, { color: theme.mutedForeground }]}>
              Get support for loads, payments, KYC and more. Our team is available 9am–6pm.
            </Text>
          </View>
          <Pressable style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => Linking.openURL('tel:18001234567').catch(() => Alert.alert('Unable to call'))}>
            <Text style={{ fontSize: 18 }}>📞</Text>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={[styles.rowTitle, { color: theme.foreground }]}>{t('settings.callSupport')}</Text>
              <Text style={[styles.rowSub, { color: theme.mutedForeground }]}>1800-123-4567</Text>
            </View>
          </Pressable>
          <Pressable style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => Linking.openURL('https://wa.me/919000000000').catch(() => {})}>
            <Text style={{ fontSize: 18 }}>💬</Text>
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={[styles.rowTitle, { color: theme.foreground }]}>{t('settings.whatsapp')}</Text>
              <Text style={[styles.rowSub, { color: theme.mutedForeground }]}>{t('settings.chatWithUs')}</Text>
            </View>
          </Pressable>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.foreground }]}>{t('settings.faq')}</Text>
            <Faq q="How do I get paid?" a="Payouts are released after delivery + POD upload, usually within 1-2 hours." theme={theme} />
            <Faq q="Why is my KYC pending?" a="Documents are reviewed within 24 hours. Rejected docs can be re-uploaded." theme={theme} />
            <Faq q="How are fares calculated?" a="Fares use the rate card based on truck type, distance and weight." theme={theme} />
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <Header title={t('settings.title')} onBack={onBack} theme={theme} />
      <ScrollView contentContainerStyle={styles.body}>
        <Pressable style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => setSection('language')}>
          <Text style={{ fontSize: 18 }}>🌐</Text>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={[styles.rowTitle, { color: theme.foreground }]}>{t('settings.language')}</Text>
            <Text style={[styles.rowSub, { color: theme.mutedForeground }]}>{SUPPORTED_LANGUAGES.find((l) => l.code === lang)?.native}</Text>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>
        <ThemeModeRow theme={theme} />
        <Pressable style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => setSection('help')}>
          <Text style={{ fontSize: 18 }}>🛟</Text>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={[styles.rowTitle, { color: theme.foreground }]}>{t('settings.helpSupport')}</Text>
            <Text style={[styles.rowSub, { color: theme.mutedForeground }]}>{t('settings.helpSub')}</Text>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>
        <Pressable style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => setSection('account')}>
          <Text style={{ fontSize: 18 }}>👤</Text>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={[styles.rowTitle, { color: theme.foreground }]}>{t('settings.account')}</Text>
            <Text style={[styles.rowSub, { color: theme.mutedForeground }]}>{t('settings.accountSub')}</Text>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>
        <Pressable style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => setSection('privacy')}>
          <Text style={{ fontSize: 18 }}>🕶️</Text>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={[styles.rowTitle, { color: theme.foreground }]}>{t('settings.privacy')}</Text>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>
        <Pressable style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => setSection('security')}>
          <Text style={{ fontSize: 18 }}>🔐</Text>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={[styles.rowTitle, { color: theme.foreground }]}>{t('settings.security')}</Text>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>
        <Pressable style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => Linking.openURL('https://wagon.app/privacy').catch(() => {})}>
          <Text style={{ fontSize: 18 }}>🔒</Text>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={[styles.rowTitle, { color: theme.foreground }]}>{t('settings.privacyPolicy')}</Text>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.rowSub, { color: theme.mutedForeground }]}>Wagon v0.1.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function Faq({ q, a, theme }: { q: string; a: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={[styles.rowTitle, { color: theme.foreground }]}>{q}</Text>
      <Text style={[styles.cardText, { color: theme.mutedForeground }]}>{a}</Text>
    </View>
  )
}

function PrivacyRow({ title, desc, on, theme }: { title: string; desc: string; on: boolean; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: theme.foreground }]}>{title}</Text>
        <Text style={[styles.rowSub, { color: theme.mutedForeground }]}>{desc}</Text>
      </View>
      <Text style={{ color: on ? theme.success : theme.mutedForeground, fontWeight: '700' }}>{on ? 'ON' : 'OFF'}</Text>
    </View>
  )
}

function SecurityRow({ icon, label, desc, theme }: { icon: string; label: string; desc: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <Pressable style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={[styles.rowTitle, { color: theme.foreground }]}>{label}</Text>
        <Text style={[styles.rowSub, { color: theme.mutedForeground }]}>{desc}</Text>
      </View>
    </Pressable>
  )
}

function Header({ title, onBack, theme }: { title: string; onBack: () => void; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={[styles.header, { borderBottomColor: theme.border }]}>
      <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
      <Text style={[styles.title, { color: theme.foreground }]}>{title}</Text>
      <View style={{ width: 20 }} />
    </View>
  )
}


function ThemeModeRow({ theme }: { theme: ReturnType<typeof useTheme> }) {
  const { mode, cycle } = useThemeMode()
  const label = mode === 'system' ? 'System' : mode === 'light' ? 'Light' : 'Dark'
  return (
    <Pressable style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={cycle}>
      <Text style={{ fontSize: 18 }}>🎨</Text>
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={[styles.rowTitle, { color: theme.foreground }]}>Theme</Text>
        <Text style={[styles.rowSub, { color: theme.mutedForeground }]}>Appearance · tap to change</Text>
      </View>
      <Text style={{ color: theme.primary, fontWeight: '800', fontSize: 14 }}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  body: { padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSub: { fontSize: 13, marginTop: 1 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardText: { fontSize: 14, lineHeight: 20, marginTop: 4 },
})
