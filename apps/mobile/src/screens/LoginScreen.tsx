import { useRef, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius, shadows, gradients, palette } from '@wagon/design'
import { Button } from '@wagon/components'
import { useI18n, SUPPORTED_LANGUAGES } from '@wagon/i18n'
import { LinearGradient } from 'expo-linear-gradient'
import { AppLogo } from '../components/AppLogo'
import { useThemeMode } from '../theme'
import type { useAuth } from '../auth'

type Auth = ReturnType<typeof useAuth>

export function LoginScreen({ auth }: { auth: Auth }) {
  const theme = useTheme()
  const { isDark } = useThemeMode()
  const { t, lang, setLang } = useI18n()
  const [mobile, setMobile] = useState('')
  const [code, setCode] = useState('')
  const otpInputRef = useRef<TextInput>(null)

  // Theme-aware surface colors. Dark = navy gradient + white text, light = soft slate.
  const gradientColors = isDark
    ? (['#020617', '#0F172A', '#1E293B'] as const)
    : (['#F8FAFC', '#F1F5F9', '#E2E8F0'] as const)
  const c = {
    text: theme.foreground,
    muted: theme.mutedForeground,
    subtle: theme.mutedForeground,
    fieldBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
    fieldBorder: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
    chipBorder: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.15)',
    chipActiveBorder: palette.orange500,
    chipActiveBg: isDark ? 'rgba(249,115,22,0.15)' : 'rgba(249,115,22,0.10)',
    chipActiveText: isDark ? palette.orange300 : palette.orange600,
    devBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(249,115,22,0.10)',
    devBorder: isDark ? 'rgba(249,115,22,0.30)' : 'rgba(249,115,22,0.40)',
    devLabel: isDark ? 'rgba(255,255,255,0.4)' : palette.orange700,
    devCode: isDark ? palette.orange300 : palette.orange600,
    error: isDark ? '#FCA5A5' : '#DC2626',
    resend: isDark ? palette.orange300 : palette.orange600,
  }

  const langPicker = (
    <View style={styles.langRow}>
      {SUPPORTED_LANGUAGES.slice(0, 4).map((l) => (
        <Pressable
          key={l.code}
          style={[
            styles.langChip,
            { borderColor: c.chipBorder },
            lang === l.code && { borderColor: c.chipActiveBorder, backgroundColor: c.chipActiveBg },
          ]}
          onPress={() => setLang(l.code)}
        >
          <Text style={[styles.langText, { color: c.muted }, lang === l.code && { color: c.chipActiveText }]}>{l.native}</Text>
        </Pressable>
      ))}
    </View>
  )

  if (!auth.otpRequested) {
    return (
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <LinearGradient colors={gradientColors} style={styles.gradient}>
          <SafeAreaView style={styles.safe}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.hero}>
                <AppLogo height={40} />
                <Text style={[styles.tagline, { color: isDark ? 'rgba(255,255,255,0.7)' : palette.slate600 }]}>
                  {t('auth.enterMobile')}
                </Text>
                {langPicker}
              </View>

              <View style={styles.form}>
                <Text style={[styles.fieldLabel, { color: isDark ? 'rgba(255,255,255,0.5)' : palette.slate500 }]}>Mobile number</Text>
                <View style={[styles.phoneRow, { backgroundColor: c.fieldBg, borderColor: c.fieldBorder }]}>
                  <View style={[styles.countryCode, { borderRightColor: c.fieldBorder }]}>
                    <Text style={[styles.ccText, { color: c.text }]}>🇮🇳 +91</Text>
                  </View>
                  <TextInput
                    style={[styles.phoneInput, { color: c.text }]}
                    placeholder="Enter mobile number"
                    placeholderTextColor={c.muted}
                    keyboardType="number-pad"
                    maxLength={10}
                    value={mobile}
                    onChangeText={setMobile}
                  />
                </View>

                <View style={styles.trustRow}>
                  <TrustChip icon="✅" label="KYC verified" />
                  <TrustChip icon="🛡️" label="Escrow protected" />
                  <TrustChip icon="🆓" label="Free to join" />
                </View>

                {auth.error && <Text style={[styles.error, { color: c.error }]}>{auth.error}</Text>}

                <Button
                  label={t('common.continue')}
                  onPress={() => auth.requestOtp(mobile)}
                  disabled={mobile.length !== 10 || auth.loading}
                  loading={auth.loading}
                  size="lg"
                />
              </View>
            </ScrollView>
          </SafeAreaView>
        </LinearGradient>
      </KeyboardAvoidingView>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <LinearGradient colors={gradientColors} style={styles.gradient}>
        <SafeAreaView style={styles.safe}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.hero}>
              <AppLogo height={40} />
              <Text style={[styles.otpTitle, { color: c.text }]}>Enter OTP</Text>
              <Text style={[styles.otpSubtitle, { color: isDark ? 'rgba(255,255,255,0.6)' : palette.slate600 }]}>
                We sent a 4-digit code to <Text style={[styles.ccText, { color: c.text }]}>+91 {mobile}</Text>
              </Text>
              {auth.devCode && (
                <View style={[styles.devBox, { backgroundColor: c.devBg, borderColor: c.devBorder }]}>
                  <Text style={[styles.devLabel, { color: c.devLabel }]}>DEV (mock provider)</Text>
                  <Text style={[styles.devCode, { color: c.devCode }]}>{auth.devCode}</Text>
                </View>
              )}
            </View>

            <View style={styles.form}>
              <Pressable style={styles.otpRow} onPress={() => otpInputRef.current?.focus()}>
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.otpBox,
                      { backgroundColor: c.fieldBg, borderColor: c.fieldBorder },
                      i === code.length && { borderColor: '#F97316' },
                    ]}
                  >
                    <Text style={[styles.otpDigit, { color: c.text }]}>{code[i] ?? ''}</Text>
                  </View>
                ))}
              </Pressable>
              <TextInput
                ref={otpInputRef}
                style={styles.hiddenInput}
                keyboardType="number-pad"
                maxLength={4}
                value={code}
                onChangeText={setCode}
                autoFocus
              />

              {auth.error && <Text style={[styles.error, { color: c.error }]}>{auth.error}</Text>}

              <Button
                label="Verify & continue"
                onPress={() => auth.verifyOtp(mobile, code)}
                disabled={code.length !== 4 || auth.loading}
                loading={auth.loading}
              />

              <Pressable onPress={() => auth.requestOtp(mobile)} disabled={auth.loading} style={styles.resend}>
                <Text style={[styles.resendText, { color: c.resend }]}>Resend OTP</Text>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </KeyboardAvoidingView>
  )
}

function TrustChip({ icon, label }: { icon: string; label: string }) {
  const { isDark } = useThemeMode()
  return (
    <View style={[styles.trustChip, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)' }]}>
      <Text style={styles.trustIcon}>{icon}</Text>
      <Text style={[styles.trustLabel, { color: isDark ? 'rgba(255,255,255,0.75)' : palette.slate600 }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  gradient: { flex: 1 },
  inner: { flex: 1, padding: spacing.xl, justifyContent: 'space-between' },
  scrollContent: { flexGrow: 1, padding: spacing.xl, justifyContent: 'space-between', paddingBottom: spacing.xxxl },
  hero: { paddingTop: spacing.xxxxl },
  brand: { color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: -0.02 },
  dot: { color: '#F97316' },
  tagline: { fontSize: 20, lineHeight: 28, fontWeight: '600', marginTop: spacing.lg },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  langChip: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6 },
  langText: { fontSize: 13, fontWeight: '600' },
  otpTitle: { fontSize: 28, fontWeight: '800', marginTop: spacing.xxl },
  otpSubtitle: { fontSize: 15, marginTop: spacing.sm },
  form: { paddingBottom: spacing.xl, gap: spacing.md },
  fieldLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  countryCode: { paddingRight: spacing.md, borderRightWidth: 1 },
  ccText: { fontSize: 16, fontWeight: '600' },
  phoneInput: { flex: 1, fontSize: 18, paddingVertical: 18, paddingLeft: spacing.md },
  trustRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  trustChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full },
  trustIcon: { fontSize: 12 },
  trustLabel: { fontSize: 12, fontWeight: '500' },
  error: { fontSize: 14 },
  devBox: { borderRadius: radius.sm, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg, borderWidth: 1 },
  devLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  devCode: { fontSize: 28, fontWeight: '800', marginTop: 2 },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  otpBox: {
    flex: 1,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigit: { fontSize: 28, fontWeight: '800' },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  resend: { alignItems: 'center', paddingVertical: spacing.sm },
  resendText: { fontSize: 15, fontWeight: '600' },
})
