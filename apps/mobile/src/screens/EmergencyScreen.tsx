import { SafeAreaView } from 'react-native-safe-area-context'
import { StyleSheet, Text, View, ScrollView, Pressable, Linking, Alert } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'
import { Button } from '@wagon/components'
import { useI18n } from '@wagon/i18n'

interface Props {
  onBack: () => void
}

export function EmergencyScreen({ onBack }: Props) {
  const theme = useTheme()
  const { t } = useI18n()

  const call = (num: string) => {
    Linking.openURL(`tel:${num}`).catch(() => Alert.alert('Unable to call'))
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('emergency.title')}</Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Pressable style={[styles.sos, { backgroundColor: theme.danger }]} onPress={() => call('112')}>
          <Text style={styles.sosText}>{t('emergency.sos')}</Text>
          <Text style={styles.sosSub}>{t('emergency.sosHint')}</Text>
        </Pressable>

        <Text style={[styles.sectionLabel, { color: theme.mutedForeground }]}>{t('emergency.helplines')}</Text>
        <HelpRow icon="🚨" label={t('emergency.police')} num="100" onPress={() => call('100')} theme={theme} />
        <HelpRow icon="🚑" label={t('emergency.ambulance')} num="108" onPress={() => call('108')} theme={theme} />
        <HelpRow icon="🔥" label={t('emergency.fire')} num="101" onPress={() => call('101')} theme={theme} />
        <HelpRow icon="👨‍👩‍👧" label={t('emergency.womenHelpline')} num="1091" onPress={() => call('1091')} theme={theme} />
        <HelpRow icon="🧒" label={t('emergency.childHelpline')} num="1098" onPress={() => call('1098')} theme={theme} />

        <View style={[styles.note, { backgroundColor: theme.accent, borderColor: theme.border }]}>
          <Text style={[styles.noteText, { color: theme.accentForeground }]}>
            Wagon support is also available 24x7 for trip emergencies.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function HelpRow({ icon, label, num, onPress, theme }: { icon: string; label: string; num: string; onPress: () => void; theme: ReturnType<typeof useTheme> }) {
  const { t } = useI18n()
  return (
    <Pressable style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={onPress}>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Text style={[styles.rowLabel, { color: theme.foreground }]}>{label}</Text>
        <Text style={[styles.rowNum, { color: theme.mutedForeground }]}>{num}</Text>
      </View>
      <Text style={{ color: theme.primary, fontWeight: '800' }}>{t('emergency.call')}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  body: { padding: spacing.lg },
  sos: { borderRadius: radius.xl, paddingVertical: spacing.xxxl, alignItems: 'center', marginBottom: spacing.xl },
  sosText: { color: '#fff', fontSize: 40, fontWeight: '900', letterSpacing: 4 },
  sosSub: { color: '#fff', fontSize: 14, marginTop: 4, opacity: 0.9 },
  sectionLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, marginBottom: spacing.sm },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowNum: { fontSize: 13, marginTop: 1 },
  note: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, marginTop: spacing.md },
  noteText: { fontSize: 14 },
})
