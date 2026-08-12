import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { api } from '../config'

interface Country {
  code: string
  name: string
  currency: string
  baseCurrency: string
  exchangeRateToBase?: number | null
  customsRegime?: string
}

interface Props {
  onBack: () => void
}

export function GlobalScreen({ onBack }: Props) {
  const theme = useTheme()
  const [countries, setCountries] = useState<Country[]>([])
  const [loading, setLoading] = useState(true)
  const [fromCode, setFromCode] = useState('US')
  const [amount, setAmount] = useState('100')
  const [converted, setConverted] = useState<string | null>(null)

  const fetch = useCallback(() => {
    api.get<{ countries: Country[] }>('/countries').then((r) => setCountries(r.countries)).catch(() => {}).finally(() => setLoading(false))
  }, [])
  useEffect(() => { fetch() }, [fetch])

  const convert = () => {
    api.get<{ from: string; to: string; converted: number; rate: number }>(`/countries/convert?code=${fromCode}&amount=${Number(amount)}`)
      .then((r) => setConverted(`₹${r.converted.toLocaleString('en-IN')} (${r.from}→${r.to} @ ${r.rate})`))
      .catch((e) => Alert.alert('Error', e.message))
  }

  const setHome = (code: string) => {
    api.post('/countries/home', { code }).then(() => Alert.alert('Home country', `Set to ${code}`)).catch((e) => Alert.alert('Error', e.message))
  }

  const viewDocuments = (code: string) => {
    api.get<{ documents: string[] }>(`/countries/${code}/documents`)
      .then((r) => Alert.alert(`${code} documents`, r.documents.join('\n')))
      .catch((e) => Alert.alert('Error', e.message))
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Global</Text>
        <View style={{ width: 20 }} />
      </View>

      <FlatList
        contentContainerStyle={styles.list}
        data={countries}
        keyExtractor={(c) => c.code}
        ListHeaderComponent={
          <View style={[styles.form, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.formTitle, { color: theme.foreground }]}>Currency conversion</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]}
                placeholder="From (US)" placeholderTextColor={theme.mutedForeground} value={fromCode} onChangeText={setFromCode} maxLength={2} autoCapitalize="characters"
              />
              <TextInput
                style={[styles.input, styles.half, { backgroundColor: theme.background, color: theme.foreground, borderColor: theme.border }]}
                placeholder="Amount" placeholderTextColor={theme.mutedForeground} keyboardType="numeric" value={amount} onChangeText={setAmount}
              />
            </View>
            <Pressable style={[styles.createBtn, { backgroundColor: '#F97316' }]} onPress={convert}>
              <Text style={styles.createBtnText}>Convert →</Text>
            </Pressable>
            {converted && <Text style={{ color: theme.foreground, fontWeight: '800', fontSize: 16 }}>{converted}</Text>}
          </View>
        }
        ListEmptyComponent={loading ? <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 40 }}>Loading…</Text> : undefined}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.cardTop}>
              <Text style={[styles.cardTitle, { color: theme.foreground }]}>🇺🇳 {item.name} ({item.code})</Text>
              <Text style={[styles.chip, { color: theme.warning, borderColor: theme.warning }]}>{item.customsRegime}</Text>
            </View>
            <Text style={[styles.meta, { color: theme.mutedForeground }]}>
              {item.currency} · {item.baseCurrency} @ {(item.exchangeRateToBase ?? 1).toFixed(2)}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <Pressable style={[styles.createBtn, styles.flexBtn, { backgroundColor: '#F97316' }]} onPress={() => setHome(item.code)}>
                <Text style={styles.createBtnText}>Set home</Text>
              </Pressable>
              <Pressable style={[styles.createBtn, styles.flexBtn, { backgroundColor: theme.warning }]} onPress={() => viewDocuments(item.code)}>
                <Text style={styles.createBtnText}>Documents</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  list: { padding: spacing.lg, gap: spacing.md },
  form: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.sm },
  formTitle: { fontSize: 15, fontWeight: '800' },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  input: { borderRadius: radius.md, borderWidth: 1, padding: spacing.md, fontSize: 14 },
  createBtn: { borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  flexBtn: { flex: 1 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  chip: { fontSize: 11, fontWeight: '700', borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2, textTransform: 'uppercase' },
  meta: { fontSize: 13 },
})
