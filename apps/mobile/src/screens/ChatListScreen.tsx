import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable } from 'react-native'
import { useTheme, spacing, radius, timeAgo } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { api } from '../config'

interface ChatThread {
  tripId: string
  route: string
  otherName: string
  lastMessage: string | null
  lastAt: string | null
  messageCount: number
}

interface Props {
  onBack: () => void
  onOpenThread: (thread: ChatThread) => void
}

export function ChatListScreen({ onBack, onOpenThread }: Props) {
  const theme = useTheme()
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(() => {
    api.get<{ threads: ChatThread[] }>('/chat/threads')
      .then((res) => setThreads(res.threads))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Messages</Text>
        <View style={{ width: 20 }} />
      </View>

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>Loading…</Text>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(c) => c.tripId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title="No conversations" message="Chat threads are created per trip once a load is accepted" icon="💬" />}
          renderItem={({ item }) => (
            <Pressable style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => onOpenThread(item)}>
              <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
                <Text style={{ fontSize: 18 }}>🚚</Text>
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={[styles.route, { color: theme.foreground }]} numberOfLines={1}>{item.route}</Text>
                <Text style={[styles.meta, { color: theme.mutedForeground }]} numberOfLines={1}>{item.otherName}{item.lastMessage ? ` · ${item.lastMessage}` : ''}</Text>
                {item.lastAt && <Text style={[styles.meta, { color: theme.mutedForeground }]}>{timeAgo(item.lastAt)}</Text>}
              </View>
              <Text style={{ color: theme.primary }}>›</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  list: { padding: spacing.lg, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  route: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 1 },
})
