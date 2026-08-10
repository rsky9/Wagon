import { SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, View, FlatList, Pressable, Linking, KeyboardAvoidingView, Platform, Alert } from 'react-native'
import { useTheme, spacing, radius } from '@wagon/design'
import { api } from '../config'
import { useAuth } from '../auth'

interface Props {
  onBack: () => void
  contactName: string
  contactPhone: string
  contactId?: string
  tripId?: string
}

interface Message {
  id: string
  body: string
  mine: boolean
  createdAt: string
}

/** Trip-contextual persisted chat (chat supplements structured terms). */
export function ChatScreen({ onBack, contactName, contactPhone, contactId, tripId }: Props) {
  const theme = useTheme()
  const { session } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')

  const fetch = () => {
    if (!tripId) return
    api.get<{ messages: Array<{ id: string; body: string; senderId: string; createdAt: string }> }>(`/chat/trip/${tripId}`)
      .then((res) => setMessages(res.messages.map((m) => ({ ...m, mine: m.senderId === session?.profile.id, createdAt: m.createdAt }))))
      .catch(() => {})
  }

  const send = () => {
    if (!draft.trim() || !tripId) return
    api.post(`/chat/trip/${tripId}`, { body: draft.trim() })
      .then(() => { setDraft(''); fetch() })
      .catch((e) => Alert.alert('Error', e instanceof Error ? e.message : 'Failed to send'))
  }

  useEffect(() => { fetch() }, [tripId])

  const report = () => {
    Alert.alert('Report user?', `Report ${contactName} for fraudulent or unsafe behaviour?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: () => {
          if (!contactId) { Alert.alert('Cannot report', 'Contact ID missing'); return }
          api.post('/trust/report', { reportedId: contactId, reason: 'Fraudulent / unsafe behaviour' }).then(() => Alert.alert('Reported', 'Our team will review this.')).catch(() => Alert.alert('Error', 'Failed to report'))
        },
      },
    ])
  }

  const block = () => {
    Alert.alert('Block user?', `You won't receive messages from ${contactName}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => {
          if (!contactId) { Alert.alert('Cannot block', 'Contact ID missing'); return }
          api.post('/trust/block', { blockedId: contactId }).then(() => Alert.alert('Blocked', 'User blocked.')).catch(() => Alert.alert('Error', 'Failed to block'))
        },
      },
    ])
  }

  const call = async () => {
    try {
      if (!contactId) { Linking.openURL(`tel:${contactPhone}`).catch(() => {}); return }
      const res = await api.post<{ maskedNumber: string }>('/trust/masked-number', { targetUserId: contactId })
      Linking.openURL(`tel:${res.maskedNumber}`).catch(() => {})
    } catch (e) {
      // Blocked or unavailable — fall back to direct.
      Linking.openURL(`tel:${contactPhone}`).catch(() => {})
    }
  }

  return (
    <KeyboardAvoidingView style={[styles.safe, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{contactName}</Text>
        <Pressable onPress={call}>
          <Text style={{ fontSize: 18 }}>📞</Text>
        </Pressable>
      </View>

      <View style={[styles.waBar, { backgroundColor: theme.accent }]}>
        <Pressable style={{ flex: 1 }} onPress={() => Linking.openURL(`https://wa.me/${contactPhone}`).catch(() => {})}>
          <Text style={{ color: theme.accentForeground, textAlign: 'center', fontSize: 13, fontWeight: '600' }}>
            💬 Prefer WhatsApp? Tap here to chat instantly
          </Text>
        </Pressable>
      </View>

      <View style={[styles.trustRow, { borderBottomColor: theme.border }]}>
        <Pressable onPress={report} hitSlop={6}><Text style={{ color: theme.danger, fontSize: 13, fontWeight: '600' }}>⚠️ Report</Text></Pressable>
        <Pressable onPress={block} hitSlop={6}><Text style={{ color: theme.mutedForeground, fontSize: 13, fontWeight: '600' }}>🚫 Block</Text></Pressable>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.mine ? { alignSelf: 'flex-end', backgroundColor: theme.primary } : { alignSelf: 'flex-start', backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border }]}>
            <Text style={{ color: item.mine ? '#fff' : theme.foreground, fontSize: 15 }}>{item.body}</Text>
            <Text style={[styles.time, { color: item.mine ? 'rgba(255,255,255,0.7)' : theme.mutedForeground }]}>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
        )}
      />

      <View style={[styles.inputBar, { borderTopColor: theme.border, backgroundColor: theme.card }]}>
        <TextInput
          style={[styles.input, { backgroundColor: theme.background, borderColor: theme.border, color: theme.foreground }]}
          placeholder="Type a message…"
          placeholderTextColor={theme.mutedForeground}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={send}
        />
        <Pressable style={[styles.sendBtn, { backgroundColor: theme.primary }]} onPress={send}>
          <Text style={{ color: '#fff', fontSize: 18 }}>➤</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
  waBar: { paddingVertical: spacing.sm },
  trustRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  list: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, padding: spacing.md },
  time: { fontSize: 10, marginTop: 2, alignSelf: 'flex-end' },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, paddingBottom: 24, borderTopWidth: 1 },
  input: { flex: 1, borderRadius: radius.full, borderWidth: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
})
