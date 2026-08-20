import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable, Alert, TextInput, KeyboardAvoidingView, Platform } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'
import { Button, EmptyState } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'

interface SavedLocation {
  id: string
  label: string
  address: string
  city?: string | null
  kind: string
}

interface SavedContact {
  id: string
  name: string
  mobile: string
  label?: string | null
}

interface Props {
  onBack: () => void
}

export function AddressBookScreen({ onBack }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [tab, setTab] = useState<'locations' | 'contacts'>('locations')
  const [locations, setLocations] = useState<SavedLocation[]>([])
  const [contacts, setContacts] = useState<SavedContact[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [label, setLabel] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [cName, setCName] = useState('')
  const [cMobile, setCMobile] = useState('')
  const [cLabel, setCLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetch = useCallback(() => {
    api.get<{ locations: SavedLocation[] }>('/addressbook/locations').then((r) => setLocations(r.locations)).catch(() => {})
    api.get<{ contacts: SavedContact[] }>('/addressbook/contacts').then((r) => setContacts(r.contacts)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const addLocation = async () => {
    if (!label.trim() || !address.trim()) { Alert.alert(t('ui.required'), 'Enter a label and address'); return }
    setSubmitting(true)
    try {
      await api.post('/addressbook/locations', { label, address, city: city || undefined })
      Alert.alert(t('ui.added'), 'Location saved')
      setLabel(''); setAddress(''); setCity(''); setShowForm(false)
      fetch()
    } catch (e) { Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed') }
    finally { setSubmitting(false) }
  }

  const addContact = async () => {
    if (!cName.trim() || cMobile.length !== 10) { Alert.alert(t('ui.required'), 'Enter name and 10-digit mobile'); return }
    setSubmitting(true)
    try {
      await api.post('/addressbook/contacts', { name: cName, mobile: cMobile, label: cLabel || undefined })
      Alert.alert(t('ui.added'), 'Contact saved')
      setCName(''); setCMobile(''); setCLabel(''); setShowForm(false)
      fetch()
    } catch (e) { Alert.alert(t('ui.error'), e instanceof Error ? e.message : 'Failed') }
    finally { setSubmitting(false) }
  }

  const removeLocation = (id: string) => {
    Alert.alert('Remove location', 'Remove this saved location?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await api.request('DELETE', `/addressbook/locations/${id}`).catch(() => {}); fetch() } },
    ])
  }
  const removeContact = (id: string) => {
    Alert.alert('Remove contact', 'Remove this contact?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await api.request('DELETE', `/addressbook/contacts/${id}`).catch(() => {}); fetch() } },
    ])
  }

  return (
    <KeyboardAvoidingView style={[styles.safe, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Address book</Text>
        <Pressable onPress={() => setShowForm((s) => !s)}><Text style={{ color: theme.primary, fontWeight: '800', fontSize: 22 }}>{showForm ? '✕' : '+'}</Text></Pressable>
      </View>

      <View style={styles.seg}>
        {([['locations', 'Locations'], ['contacts', 'Contacts']] as const).map(([k, l]) => (
          <Pressable key={k} style={[styles.segBtn, tab === k && { backgroundColor: theme.primary }]} onPress={() => { setTab(k); setShowForm(false) }}>
            <Text style={{ color: tab === k ? '#fff' : theme.mutedForeground, fontWeight: '700' }}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {showForm && (
        <View style={[styles.form, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {tab === 'locations' ? (
            <>
              <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={label} onChangeText={setLabel} placeholder="Label (e.g. Home depot)" placeholderTextColor={theme.mutedForeground + '88'} />
              <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={address} onChangeText={setAddress} placeholder="Address" placeholderTextColor={theme.mutedForeground + '88'} />
              <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={city} onChangeText={setCity} placeholder="City (optional)" placeholderTextColor={theme.mutedForeground + '88'} />
              <Button label="Save location" onPress={addLocation} loading={submitting} size="md" />
            </>
          ) : (
            <>
              <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={cName} onChangeText={setCName} placeholder="Contact name" placeholderTextColor={theme.mutedForeground + '88'} />
              <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={cMobile} onChangeText={setCMobile} placeholder="10-digit mobile" placeholderTextColor={theme.mutedForeground + '88'} keyboardType="number-pad" maxLength={10} />
              <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={cLabel} onChangeText={setCLabel} placeholder="Label (optional)" placeholderTextColor={theme.mutedForeground + '88'} />
              <Button label="Save contact" onPress={addContact} loading={submitting} size="md" />
            </>
          )}
        </View>
      )}

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>{t('common.loading')}</Text>
      ) : tab === 'locations' ? (
        <FlatList
          data={locations}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="No saved locations" message="Save pickup/drop spots to post loads faster" actionLabel="Add location" onAction={() => setShowForm(true)} icon="📍" />}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.cardTitle, { color: theme.foreground }]}>{item.label}</Text>
                <Pressable onPress={() => removeLocation(item.id)} hitSlop={8}><Text style={{ color: theme.danger, fontSize: 13 }}>Remove</Text></Pressable>
              </View>
              <Text style={{ color: theme.mutedForeground, fontSize: 14 }}>{item.address}{item.city ? `, ${item.city}` : ''}</Text>
              <Text style={{ color: theme.primary, fontSize: 11, textTransform: 'uppercase', fontWeight: '700' }}>{item.kind}</Text>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="No saved contacts" message="Save frequent shippers / transporters" actionLabel="Add contact" onAction={() => setShowForm(true)} icon="👤" />}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.cardTitle, { color: theme.foreground }]}>{item.name}</Text>
                <Pressable onPress={() => removeContact(item.id)} hitSlop={8}><Text style={{ color: theme.danger, fontSize: 13 }}>Remove</Text></Pressable>
              </View>
              <Text style={{ color: theme.mutedForeground, fontSize: 14 }}>{item.mobile}{item.label ? ` · ${item.label}` : ''}</Text>
            </View>
          )}
        />
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  seg: { flexDirection: 'row', margin: spacing.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: 'rgba(128,128,128,0.3)', overflow: 'hidden' },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  form: { marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  input: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 15 },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700' },
})
