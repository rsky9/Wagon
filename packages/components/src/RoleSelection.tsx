import { View, Text, StyleSheet, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { spacing, radius } from '@wagon/design'
import { Button } from './Button'

interface Props {
  onSelect: (role: 'transporter' | 'supplier' | 'driver') => void
}

/** First-run role selection: transporter vs supplier vs driver. */
export function RoleSelection({ onSelect }: Props) {
  return (
    <View style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>What do you want to do?</Text>
          <Text style={styles.subtitle}>Select how you'll use Wagon</Text>
        </View>

        <View style={styles.cards}>
          <Pressable style={styles.card} onPress={() => onSelect('transporter')}>
            <View style={styles.iconBox}>
              <Text style={styles.icon}>🚛</Text>
            </View>
            <Text style={styles.cardTitle}>I move goods</Text>
            <Text style={styles.cardSub}>Find loads, manage trucks & drivers, get paid</Text>
          </Pressable>

          <Pressable style={[styles.card, styles.cardAlt]} onPress={() => onSelect('supplier')}>
            <View style={styles.iconBox}>
              <Text style={styles.icon}>📦</Text>
            </View>
            <Text style={styles.cardTitle}>I post loads</Text>
            <Text style={styles.cardSub}>Post loads, get trucks, track deliveries</Text>
          </Pressable>

          <Pressable style={styles.card} onPress={() => onSelect('driver')}>
            <View style={styles.iconBox}>
              <Text style={styles.icon}>🧑‍✈️</Text>
            </View>
            <Text style={styles.cardTitle}>I'm a driver</Text>
            <Text style={styles.cardSub}>Get trips, share location, upload POD</Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.note}>You can change this later in Settings</Text>
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
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cardAlt: { backgroundColor: 'rgba(249,115,22,0.08)', borderColor: 'rgba(249,115,22,0.3)' },
  iconBox: { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(249,115,22,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  icon: { fontSize: 30 },
  cardTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  cardSub: { color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 4, lineHeight: 20 },
  footer: { padding: spacing.xl, alignItems: 'center' },
  note: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
})
