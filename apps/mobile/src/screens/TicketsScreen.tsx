import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, View, FlatList, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { useTheme, spacing, radius, timeAgo } from '@wagon/design'
import { Button, EmptyState } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'

interface Ticket {
  id: string
  subject: string
  category: string
  message: string
  status: string
  createdAt: string
}

interface Props {
  onBack: () => void
}

const CATEGORIES = ['general', 'payment', 'kyc', 'load', 'trip', 'technical']

export function TicketsScreen({ onBack }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState('general')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetch = useCallback(() => {
    api.get<{ tickets: Ticket[] }>('/support/tickets').then((res) => setTickets(res.tickets)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  const submit = async () => {
    if (!subject.trim() || !message.trim()) { Alert.alert('Required', 'Add subject and message'); return }
    setSubmitting(true)
    try {
      await api.post('/support/tickets', { subject, category, message })
      setSubject(''); setMessage(''); setShowForm(false)
      fetch()
    } catch (e) { Alert.alert('Error', e instanceof Error ? e.message : 'Failed') } finally { setSubmitting(false) }
  }

  const close = async (id: string) => {
    await api.post(`/support/tickets/${id}/close`).catch(() => {})
    fetch()
  }

  return (
    <KeyboardAvoidingView style={[styles.safe, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('tickets.title')}</Text>
        <Pressable onPress={() => setShowForm((s) => !s)}><Text style={{ color: theme.primary, fontSize: 22, fontWeight: '800' }}>{showForm ? '✕' : '+'}</Text></Pressable>
      </View>

      {showForm && (
        <View style={[styles.form, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <TextInput style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={subject} onChangeText={setSubject} placeholder={t('tickets.subject')} placeholderTextColor={theme.mutedForeground + '88'} />
          <View style={styles.chips}>
            {CATEGORIES.map((c) => (
              <Pressable key={c} style={[styles.chip, { backgroundColor: category === c ? theme.primary : theme.background, borderColor: category === c ? theme.primary : theme.border }]} onPress={() => setCategory(c)}>
                <Text style={{ color: category === c ? '#fff' : theme.mutedForeground, fontSize: 12, fontWeight: '600' }}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={[styles.input, styles.multiline, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]} value={message} onChangeText={setMessage} placeholder={t('tickets.describe')} placeholderTextColor={theme.mutedForeground + '88'} multiline />
          <Button label={t('tickets.submit')} onPress={submit} loading={submitting} size="md" />
        </View>
      )}

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>{t('common.loading')}</Text>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title={t('tickets.none')} message={t('tickets.hint')} actionLabel={t('tickets.newTicket')} onAction={() => setShowForm(true)} icon="🎫" />}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardTop}>
                <Text style={[styles.cardSubject, { color: theme.foreground }]}>{item.subject}</Text>
                <View style={[styles.statusBadge, { backgroundColor: item.status === 'open' ? theme.warning + '1A' : theme.success + '1A' }]}>
                  <Text style={{ color: item.status === 'open' ? theme.warning : theme.success, fontSize: 12, fontWeight: '700' }}>{item.status}</Text>
                </View>
              </View>
              <Text style={[styles.cardMsg, { color: theme.mutedForeground }]} numberOfLines={2}>{item.message}</Text>
              <View style={styles.cardBottom}>
                <Text style={[styles.cardMeta, { color: theme.mutedForeground }]}>{item.category} · {timeAgo(item.createdAt)}</Text>
                {item.status === 'open' && (
                  <Pressable onPress={() => close(item.id)}><Text style={{ color: theme.danger, fontSize: 13 }}>{t('tickets.close')}</Text></Pressable>
                )}
              </View>
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
  form: { margin: spacing.lg, borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  input: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 15 },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderRadius: radius.full, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardSubject: { fontSize: 15, fontWeight: '700', flex: 1 },
  statusBadge: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  cardMsg: { fontSize: 13 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardMeta: { fontSize: 12 },
})
