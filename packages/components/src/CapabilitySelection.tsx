import { useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { spacing, radius } from '@wagon/design'
import { useI18n } from '@wagon/i18n'
import { Button } from './Button'

export interface CapabilityChoice {
  label: string
  capabilities: string[]
}

interface Props {
  onSelect: (capabilities: string[]) => void
}

const OPTIONS: Array<{ key: string; icon: string; title: string; sub: string; caps: string[]; recommended?: boolean }> = [
  {
    key: 'both',
    icon: '🔁',
    title: 'Do both',
    sub: 'Move your goods and haul others’ loads — one account',
    caps: ['supplier', 'transporter'],
    recommended: true,
  },
  {
    key: 'supplier',
    icon: '📦',
    title: 'Move goods',
    sub: 'Post loads, find trucks, track deliveries',
    caps: ['supplier'],
  },
  {
    key: 'transporter',
    icon: '🚛',
    title: 'Find loads',
    sub: 'Get trips for your trucks & drivers, earn',
    caps: ['transporter'],
  },
  {
    key: 'driver',
    icon: '🧑‍✈️',
    title: "I'm a driver",
    sub: 'Get trips, share location, upload POD',
    caps: ['driver'],
  },
]

/** Unified capability selection: one account, choose what you can do. */
export function CapabilitySelection({ onSelect }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const { t } = useI18n()

  return (
    <View style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('ui.chooseCapability')}</Text>
          <Text style={styles.subtitle}>{t('ui.capabilityHint')}</Text>
        </View>

        <View style={styles.cards}>
          {OPTIONS.map((o) => {
            const active = selected === o.key
            return (
              <Pressable
                key={o.key}
                style={[styles.card, active && styles.cardActive]}
                onPress={() => setSelected(o.key)}
              >
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active && <View style={styles.radioDot} />}
                </View>
                <View style={styles.iconBox}>
                  <Text style={styles.icon}>{o.icon}</Text>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardTitle}>{o.title}</Text>
                    {o.recommended && (
                      <View style={styles.recoBadge}>
                        <Text style={styles.recoText}>{t('ui.recommended')}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.cardSub}>{o.sub}</Text>
                </View>
              </Pressable>
            )
          })}
        </View>

        <View style={styles.footer}>
          <Button
            label={t('common.continue')}
            disabled={!selected}
            onPress={() => {
              const opt = OPTIONS.find((o) => o.key === selected)
              if (opt) onSelect(opt.caps)
            }}
          />
          <Text style={styles.note}>You can add or change capabilities later in Settings.</Text>
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
  cards: { padding: spacing.xl, gap: spacing.md, flex: 1, justifyContent: 'center' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.xl,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cardActive: { backgroundColor: 'rgba(249,115,22,0.1)', borderColor: '#F97316' },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: '#F97316' },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#F97316' },
  iconBox: { width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(249,115,22,0.15)', alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 26 },
  cardBody: { flex: 1 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { color: '#fff', fontSize: 19, fontWeight: '800' },
  recoBadge: { backgroundColor: 'rgba(249,115,22,0.25)', borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  recoText: { color: '#FDBA74', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 3, lineHeight: 19 },
  footer: { padding: spacing.xl, gap: spacing.md },
  note: { color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center' },
})
