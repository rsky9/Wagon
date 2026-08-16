import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { radius, spacing, shadows } from '@wagon/design'
import { useI18n } from '@wagon/i18n'

interface Props {
  balance: number
  hideable?: boolean
  primaryLabel?: string
  onPrimary?: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  children?: React.ReactNode
}

/** Premium wallet balance header — always a dark navy card so white text stays readable in light & dark mode. */
export function WalletHeader({ balance, hideable = true, primaryLabel, onPrimary, secondaryLabel, onSecondary, children }: Props) {
  const [hidden, setHidden] = React.useState(false)
  const { t } = useI18n()

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, shadows.lg]}>
        <View style={styles.glow} />
        <View style={styles.topRow}>
          <Text style={styles.label}>{t('ui.availableBalance')}</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{t('ui.wallet')}</Text>
          </View>
        </View>
        <View style={styles.balanceRow}>
          <Text style={[styles.balance, hidden ? styles.hidden : null]} numberOfLines={1} adjustsFontSizeToFit>
            {hidden ? '₹ ••••••' : balance < 0 ? `-₹${Math.abs(balance).toLocaleString('en-IN')}` : `₹${balance.toLocaleString('en-IN')}`}
          </Text>
          {hideable && (
            <Pressable onPress={() => setHidden((h) => !h)} hitSlop={8}>
              <Text style={styles.eye}>{hidden ? '👁' : '🙈'}</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.actions}>
          {primaryLabel && (
            <Pressable style={styles.primaryBtn} onPress={onPrimary}>
              <Text style={styles.primaryText}>{primaryLabel}</Text>
            </Pressable>
          )}
          {secondaryLabel && (
            <Pressable style={styles.secondaryBtn} onPress={onSecondary}>
              <Text style={styles.secondaryText}>{secondaryLabel}</Text>
            </Pressable>
          )}
        </View>
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {},
  card: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    backgroundColor: '#0B1B2B',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(249,115,22,0.28)',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  pillText: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  label: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '500' },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  balance: { color: '#fff', fontSize: 40, lineHeight: 46, fontWeight: '800', letterSpacing: -0.02, flexShrink: 1 },
  hidden: { letterSpacing: 2 },
  eye: { fontSize: 18 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  primaryBtn: {
    backgroundColor: '#F97316',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  secondaryText: { color: '#fff', fontWeight: '600', fontSize: 15 },
})
