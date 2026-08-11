import { SafeAreaView } from 'react-native-safe-area-context'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View, FlatList, Pressable } from 'react-native'
import { useTheme, spacing, radius, formatINR } from '@wagon/design'
import { EmptyState } from '@wagon/components'
import { api } from '../config'
import { useI18n } from '@wagon/i18n'

interface ReviewRow {
  tripId: string
  rating: number
  review?: string | null
  route: string
  deliveredAt?: string | null
}

interface Props {
  onBack: () => void
}

export function ReviewsScreen({ onBack }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<{ id: string } | null>(null)

  useEffect(() => {
    api.get<{ profile: { id: string } }>('/auth/me').then((r) => {
      setProfile(r.profile)
      return api.get<{ reviews: ReviewRow[] }>(`/ratings/transporter/${r.profile.id}/reviews`)
    }).then((res) => setReviews(res.reviews)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={{ color: theme.mutedForeground, fontSize: 20 }}>←</Text></Pressable>
        <Text style={[styles.title, { color: theme.foreground }]}>{t('review.title')}</Text>
        <View style={{ width: 20 }} />
      </View>

      {loading ? (
        <Text style={{ color: theme.mutedForeground, textAlign: 'center', marginTop: 60 }}>{t('common.loading')}</Text>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(r) => r.tripId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title={t('review.none')} message="Reviews from suppliers will appear after deliveries" icon="⭐" />}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={styles.cardTop}>
                <Text style={{ fontSize: 16 }}>{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</Text>
                <Text style={[styles.ratingNum, { color: theme.primary }, { fontVariant: ['tabular-nums'] }]}>{item.rating}.0</Text>
              </View>
              <Text style={[styles.route, { color: theme.foreground }]}>{item.route}</Text>
              {item.review && <Text style={[styles.review, { color: theme.mutedForeground }]}>{item.review}</Text>}
            </View>
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
  list: { padding: spacing.lg, gap: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ratingNum: { fontSize: 16, fontWeight: '800' },
  route: { fontSize: 14, fontWeight: '600' },
  review: { fontSize: 14, lineHeight: 20 },
})
