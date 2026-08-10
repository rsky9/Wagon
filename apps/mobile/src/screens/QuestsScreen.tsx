import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { loadGamification, QUESTS, levelFor, levelProgress, XP_PER_LEVEL, type GamificationState, type Quest } from '../gamification'

interface Props {
  role: 'transporter' | 'supplier'
  onBack: () => void
  onOpenQuest: (target?: string) => void
}

export function QuestsScreen({ role, onBack, onOpenQuest }: Props) {
  const theme = useTheme()
  const [state, setState] = useState<GamificationState | null>(null)

  useEffect(() => {
    loadGamification().then(setState)
  }, [])

  const quests = QUESTS[role] ?? []
  const doneCount = quests.filter((q) => state?.questsDone.includes(q.id)).length
  const level = levelFor(state?.xp ?? 0)
  const pct = levelProgress(state?.xp ?? 0)

  const renderQuest = ({ item }: { item: Quest }) => {
    const done = state?.questsDone.includes(item.id)
    return (
      <Pressable
        style={[styles.quest, { backgroundColor: theme.card, borderColor: theme.border, opacity: done ? 0.55 : 1 }]}
        onPress={() => { if (!done) onOpenQuest(item.target) }}
        disabled={done}
      >
        <View style={[styles.questIcon, { backgroundColor: done ? theme.muted : theme.accent }]}>
          <Text style={{ fontSize: 20 }}>{done ? '✅' : item.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.questTitle, { color: theme.foreground }]}>{item.title}</Text>
          <Text style={[styles.questDesc, { color: theme.mutedForeground }]} numberOfLines={2}>{item.description}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text style={[styles.xp, { color: theme.primary, fontWeight: '800' }]}>+{item.xp} XP</Text>
          <Text style={{ color: theme.mutedForeground, fontSize: 11 }}>{done ? 'Done' : '›'}</Text>
        </View>
      </Pressable>
    )
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>Rewards & Quests</Text>
        <View style={{ width: 20 }} />
      </View>

      <FlatList
        data={quests}
        keyExtractor={(q) => q.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={[styles.levelCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.levelTop}>
              <View style={[styles.levelRing, { borderColor: theme.primary }]}>
                <Text style={[styles.levelNum, { color: theme.foreground }]}>{level}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.levelTitle, { color: theme.foreground }]}>Level {level}</Text>
                <Text style={[styles.levelSub, { color: theme.mutedForeground }]}>{state?.xp ?? 0} XP · {doneCount}/{quests.length} quests done</Text>
                <View style={[styles.track, { backgroundColor: theme.border }]}>
                  <View style={[styles.fill, { backgroundColor: theme.primary, width: `${pct}%` }]} />
                </View>
              </View>
            </View>
            <Text style={[styles.nextLevel, { color: theme.mutedForeground }]}>
              {XP_PER_LEVEL - (state?.xp ?? 0) % XP_PER_LEVEL} XP to Level {level + 1}
            </Text>
          </View>
        }
        ListEmptyComponent={<EmptyState title="No quests" message="Check back soon" icon="🎯" />}
        renderItem={renderQuest}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1 },
  title: { fontSize: 20, fontWeight: '800' },
  list: { padding: spacing.lg, gap: spacing.md },
  levelCard: { borderRadius: radius.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  levelTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  levelRing: { width: 56, height: 56, borderRadius: 28, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  levelNum: { fontSize: 22, fontWeight: '800' },
  levelTitle: { fontSize: 16, fontWeight: '800' },
  levelSub: { fontSize: 12, marginTop: 1 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  fill: { height: '100%', borderRadius: 3 },
  nextLevel: { fontSize: 12 },
  quest: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  questIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  questTitle: { fontSize: 15, fontWeight: '700' },
  questDesc: { fontSize: 12, marginTop: 1 },
  xp: { fontSize: 13 },
})
