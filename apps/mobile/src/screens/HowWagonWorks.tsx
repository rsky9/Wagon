import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { useI18n } from '@wagon/i18n'
import { Button } from '@wagon/components'
import { AppLogo } from '../components/AppLogo'

interface Props {
  onContinue: () => void
}

const STEPS = [
  { icon: '📝', key: 'onboard', titleKey: 'how.onboard', subKey: 'how.onboardSub' },
  { icon: '🔀', key: 'choose', titleKey: 'how.choose', subKey: 'how.chooseSub' },
  { icon: '🚀', key: 'execute', titleKey: 'how.execute', subKey: 'how.executeSub' },
]

const ROLES = [
  { icon: '📦', key: 'shipper', labelKey: 'role.shipper' },
  { icon: '🚛', key: 'transporter', labelKey: 'role.transporter' },
  { icon: '🧭', key: 'forwarder', labelKey: 'role.forwarder' },
  { icon: '🏬', key: 'warehouse', labelKey: 'role.warehouse' },
  { icon: '🧑‍✈️', key: 'driver', labelKey: 'role.driver' },
]

/** Visual, icon-first explanation of how Wagon works — no clutter, anyone gets it in 10 seconds. */
export function HowWagonWorks({ onContinue }: Props) {
  const theme = useTheme()
  const { t } = useI18n()

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: '#0F172A' }]}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.brand}>
          <AppLogo height={36} variant="white" />
          <Text style={styles.headline}>{t('how.headline')}</Text>
          <Text style={styles.subheadline}>{t('how.subheadline')}</Text>
        </View>

        {/* 3 steps — the whole model in three icons */}
        <View style={styles.stepsRow}>
          {STEPS.map((s, i) => (
            <View key={s.key} style={styles.step}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepIcon}>{s.icon}</Text>
                <View style={styles.stepDot}>
                  <Text style={styles.stepNum}>{i + 1}</Text>
                </View>
              </View>
              <Text style={styles.stepTitle}>{t(s.titleKey)}</Text>
              <Text style={styles.stepSub}>{t(s.subKey)}</Text>
            </View>
          ))}
        </View>

        {/* freedom of choice: who's on the network */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('how.forEveryone')}</Text>
          <View style={styles.rolesWrap}>
            {ROLES.map((r) => (
              <View key={r.key} style={[styles.roleChip, { backgroundColor: 'rgba(249,115,22,0.10)', borderColor: 'rgba(249,115,22,0.25)' }]}>
                <Text style={styles.roleIcon}>{r.icon}</Text>
                <Text style={styles.roleLabel}>{t(r.labelKey)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* the one-line promise */}
        <View style={[styles.promise, { backgroundColor: theme.primary }]}>
          <Text style={styles.promiseIcon}>💪</Text>
          <Text style={styles.promiseText}>{t('how.promise')}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button label={t('common.continue')} onPress={onContinue} size="lg" />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: spacing.xl, paddingBottom: spacing.xxl },
  brand: { alignItems: 'center', marginTop: spacing.md },
  headline: { color: '#fff', fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: spacing.lg },
  subheadline: { color: 'rgba(255,255,255,0.6)', fontSize: 15, textAlign: 'center', marginTop: 6, lineHeight: 22 },
  stepsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  step: { flex: 1, alignItems: 'center', gap: 6 },
  stepBadge: { position: 'relative', width: 68, height: 68, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  stepIcon: { fontSize: 30 },
  stepDot: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: { color: '#fff', fontSize: 12, fontWeight: '800' },
  stepTitle: { color: '#fff', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  stepSub: { color: 'rgba(255,255,255,0.5)', fontSize: 12, textAlign: 'center', lineHeight: 17 },
  section: { marginTop: spacing.xl },
  sectionTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' },
  rolesWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md },
  roleChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.full, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 8 },
  roleIcon: { fontSize: 16 },
  roleLabel: { color: '#FDBA74', fontSize: 13, fontWeight: '700' },
  promise: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  promiseIcon: { fontSize: 22 },
  promiseText: { color: '#fff', fontSize: 15, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  footer: { padding: spacing.lg, paddingBottom: spacing.xl },
})
