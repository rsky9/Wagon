import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert, TextInput, Modal, ScrollView } from 'react-native'
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
  const [homeCode, setHomeCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fromCode, setFromCode] = useState('US')
  const [amount, setAmount] = useState('100')
  const [converted, setConverted] = useState<string | null>(null)

  const fetch = useCallback(() => {
    api.get<{ countries: Country[] }>('/countries').then((r) => setCountries(r.countries)).catch(() => {}).finally(() => setLoading(false))
    // Read the saved home country back so it's marked + drives the converter default.
    api.get<{ code: string }>('/countries/home').then((r) => { setHomeCode(r.code); if (r.code) setFromCode(r.code) }).catch(() => {})
  }, [])
  useEffect(() => { fetch() }, [fetch])

  const convert = () => {
    api.get<{ from: string; to: string; converted: number; rate: number }>(`/countries/convert?code=${fromCode}&amount=${Number(amount)}`)
      .then((r) => setConverted(`₹${r.converted.toLocaleString('en-IN')} (${r.from}→${r.to} @ ${r.rate})`))
      .catch((e) => Alert.alert('Error', e.message))
  }

  const [docCountry, setDocCountry] = useState<Country | null>(null)
  const [docList, setDocList] = useState<string[]>([])
  const [docLoading, setDocLoading] = useState(false)

  const setHome = (code: string) => {
    api.post('/countries/home', { code }).then(() => { setHomeCode(code); setFromCode(code); Alert.alert('Home country', `Set to ${code}`) }).catch((e) => Alert.alert('Error', e.message))
  }

  const viewDocuments = (country: Country) => {
    setDocCountry(country)
    setDocLoading(true)
    setDocList([])
    api.get<{ documents: string[] }>(`/countries/${country.code}/documents`)
      .then((r) => setDocList(r.documents ?? []))
      .catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'Could not load documents'))
      .finally(() => setDocLoading(false))
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
              <Text style={[styles.cardTitle, { color: theme.foreground }]}>🇺🇳 {item.name} ({item.code}){homeCode === item.code ? ' · Home' : ''}</Text>
              <Text style={[styles.chip, { color: theme.warning, borderColor: theme.warning }]}>{item.customsRegime}</Text>
            </View>
            <Text style={[styles.meta, { color: theme.mutedForeground }]}>
              {item.currency} · {item.baseCurrency} @ {(item.exchangeRateToBase ?? 1).toFixed(2)}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <Pressable style={[styles.createBtn, styles.flexBtn, { backgroundColor: homeCode === item.code ? theme.success : '#F97316' }]} onPress={() => setHome(item.code)}>
                <Text style={styles.createBtnText}>{homeCode === item.code ? '✓ Home' : 'Set home'}</Text>
              </Pressable>
              <Pressable style={[styles.createBtn, styles.flexBtn, { backgroundColor: theme.warning }]} onPress={() => viewDocuments(item)}>
                <Text style={styles.createBtnText}>Documents</Text>
              </Pressable>
            </View>
          </View>
        )}
      />

      <Modal visible={!!docCountry} transparent animationType="slide" onRequestClose={() => setDocCountry(null)}>
        <View style={styles.sheetWrap}>
          <View style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetTitle, { color: theme.foreground }]}>{docCountry?.name ?? ''} · {docCountry?.code ?? ''}</Text>
                <Text style={[styles.meta, { color: theme.mutedForeground }]}>{docCountry?.customsRegime ?? ''} · {docCountry?.currency ?? ''}</Text>
              </View>
              <Pressable onPress={() => setDocCountry(null)} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>✕</Text></Pressable>
            </View>
            <Text style={[styles.sheetSub, { color: theme.mutedForeground }]}>Required trade documents for this corridor</Text>
            {docLoading ? (
              <Text style={{ color: theme.mutedForeground, textAlign: 'center', paddingVertical: spacing.xl }}>Loading…</Text>
            ) : docList.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm }}>
                <Text style={{ fontSize: 28 }}>📄</Text>
                <Text style={{ color: theme.mutedForeground, textAlign: 'center' }}>No document checklist published for this country yet.</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.lg }}>
                {docList.map((d, i) => (
                  <View key={`${d}-${i}`} style={[styles.docRow, { backgroundColor: theme.background, borderColor: theme.border }]}>
                    <Text style={styles.docIndex}>{String(i + 1).padStart(2, '0')}</Text>
                    <Text style={[styles.docName, { color: theme.foreground }]}>{d.replace(/_/g, ' ')}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
            <Pressable style={[styles.createBtn, { backgroundColor: '#F97316' }]} onPress={() => setDocCountry(null)}>
              <Text style={styles.createBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  sheetWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '78%', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderTopWidth: 1, padding: spacing.xl, gap: spacing.md },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  sheetTitle: { fontSize: 18, fontWeight: '800' },
  sheetSub: { fontSize: 12 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  docIndex: { fontSize: 12, fontWeight: '800', color: '#F97316', width: 28 },
  docName: { flex: 1, fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
})
