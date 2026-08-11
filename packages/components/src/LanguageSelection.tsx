import { View, Text, StyleSheet, Pressable, FlatList } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { spacing, radius } from '@wagon/design'
import { SUPPORTED_LANGUAGES, useI18n } from '@wagon/i18n'
import { Button } from './Button'

interface Props {
  onDone: () => void
}

/** Full-screen language selection shown on first run (PhonePe-style). */
export function LanguageSelection({ onDone }: Props) {
  const { lang, setLang, t } = useI18n()

  return (
    <View style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('ui.chooseLanguage')}</Text>
          <Text style={styles.subtitle}>आपकी भाषा चुनें · మీ భాషను ఎంచుకోండి</Text>
        </View>

        <FlatList
          data={SUPPORTED_LANGUAGES}
          keyExtractor={(l) => l.code}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const active = lang === item.code
            return (
              <Pressable
                style={[
                  styles.row,
                  { backgroundColor: active ? 'rgba(249,115,22,0.15)' : 'rgba(255,255,255,0.05)' },
                  active && styles.rowActive,
                ]}
                onPress={() => setLang(item.code)}
              >
                <Text style={styles.native}>{item.native}</Text>
                <Text style={styles.english}>{item.name}</Text>
                {active && <Text style={styles.check}>✓</Text>}
              </Pressable>
            )
          }}
        />

        <View style={styles.footer}>
          <Button label={t('common.continue')} onPress={onDone} />
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  gradient: { flex: 1, backgroundColor: '#0F172A' },
  safe: { flex: 1 },
  header: { padding: spacing.xl, paddingTop: spacing.xxxxl },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  subtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 6 },
  list: { paddingHorizontal: spacing.xl, paddingBottom: 100 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 18,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rowActive: { borderColor: '#F97316' },
  native: { color: '#fff', fontSize: 18, fontWeight: '700', width: 110 },
  english: { color: 'rgba(255,255,255,0.6)', fontSize: 14, flex: 1 },
  check: { color: '#FDBA74', fontSize: 20, fontWeight: '800' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: spacing.xl, backgroundColor: 'transparent' },
})
