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
import { useTheme, spacing, radius, shadows, gradients } from '@wagon/design'
import { Button } from '@wagon/components'
import { useI18n, SUPPORTED_LANGUAGES } from '@wagon/i18n'
import { LinearGradient } from 'expo-linear-gradient'
import { AppLogo } from '../components/AppLogo'
import type { useAuth } from '../auth'

type Auth = ReturnType<typeof useAuth>

export function LoginScreen({ auth }: { auth: Auth }) {
  const theme = useTheme()
  const { t, lang, setLang } = useI18n()
  const [mobile, setMobile] = useState('')
  const [code, setCode] = useState('')
  const otpInputRef = useRef<TextInput>(null)

  const langPicker = (
    <View style={styles.langRow}>
      {SUPPORTED_LANGUAGES.slice(0, 4).map((l) => (
        <Pressable
          key={l.code}
          style={[styles.langChip, lang === l.code && { borderColor: '#F97316', backgroundColor: 'rgba(249,115,22,0.15)' }]}
          onPress={() => setLang(l.code)}
        >
          <Text style={[styles.langText, lang === l.code && { color: '#FDBA74' }]}>{l.native}</Text>
        </Pressable>
      ))}
    </View>
  )

  if (!auth.otpRequested) {
    return (
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <LinearGradient colors={['#020617', '#0F172A', '#1E293B']} style={styles.gradient}>
          <SafeAreaView style={styles.safe}>
            <ScrollView
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.hero}>
                <AppLogo height={40} />
                <Text style={styles.tagline}>
                  {t('auth.enterMobile')}
                </Text>
                {langPicker}
              </View>

              <View style={styles.form}>
                <Text style={styles.fieldLabel}>Mobile number</Text>
                <View style={[styles.phoneRow, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' }]}>
                  <View style={styles.countryCode}>
                    <Text style={styles.ccText}>🇮🇳 +91</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="Enter mobile number"
                    placeholderTextColor="rgba(255,255,255,0.35)"
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

                {auth.error && <Text style={styles.error}>{auth.error}</Text>}

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
      <LinearGradient colors={['#020617', '#0F172A', '#1E293B']} style={styles.gradient}>
        <SafeAreaView style={styles.safe}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.hero}>
              <AppLogo height={40} />
              <Text style={styles.otpTitle}>Enter OTP</Text>
              <Text style={styles.otpSubtitle}>
                We sent a 4-digit code to <Text style={styles.ccText}>+91 {mobile}</Text>
              </Text>
              {auth.devCode && (
                <View style={[styles.devBox, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
                  <Text style={styles.devLabel}>DEV (mock provider)</Text>
                  <Text style={styles.devCode}>{auth.devCode}</Text>
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
                      { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' },
                      i === code.length && { borderColor: '#F97316' },
                    ]}
                  >
                    <Text style={styles.otpDigit}>{code[i] ?? ''}</Text>
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

              {auth.error && <Text style={styles.error}>{auth.error}</Text>}

              <Button
                label="Verify & continue"
                onPress={() => auth.verifyOtp(mobile, code)}
                disabled={code.length !== 4 || auth.loading}
                loading={auth.loading}
              />

              <Pressable onPress={() => auth.requestOtp(mobile)} disabled={auth.loading} style={styles.resend}>
                <Text style={styles.resendText}>Resend OTP</Text>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </KeyboardAvoidingView>
  )
}

function TrustChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={[styles.trustChip, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
      <Text style={styles.trustIcon}>{icon}</Text>
      <Text style={styles.trustLabel}>{label}</Text>
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
  tagline: { color: 'rgba(255,255,255,0.7)', fontSize: 20, lineHeight: 28, fontWeight: '600', marginTop: spacing.lg },
  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  langChip: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 6 },
  langText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  otpTitle: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: spacing.xxl },
  otpSubtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 15, marginTop: spacing.sm },
  form: { paddingBottom: spacing.xl, gap: spacing.md },
  fieldLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  countryCode: { paddingRight: spacing.md, borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.12)' },
  ccText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  phoneInput: { flex: 1, color: '#fff', fontSize: 18, paddingVertical: 18, paddingLeft: spacing.md },
  trustRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  trustChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full },
  trustIcon: { fontSize: 12 },
  trustLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '500' },
  error: { color: '#FCA5A5', fontSize: 14 },
  devBox: { borderRadius: radius.sm, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  devLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  devCode: { color: '#FDBA74', fontSize: 28, fontWeight: '800', marginTop: 2 },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  otpBox: {
    flex: 1,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDigit: { color: '#fff', fontSize: 28, fontWeight: '800' },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  resend: { alignItems: 'center', paddingVertical: spacing.sm },
  resendText: { color: '#FB923C', fontSize: 15, fontWeight: '600' },
})
