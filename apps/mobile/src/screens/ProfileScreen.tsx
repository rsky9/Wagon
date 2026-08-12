import { useEffect, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius } from '@wagon/design'
import { useThemeMode } from '../theme'
import { api } from '../config'
import { AppLogo } from '../components/AppLogo'
import { RupeeIcon } from '../components/RupeeIcon'
import { useI18n } from '@wagon/i18n'
import type { UserProfile } from '@wagon/contracts'

interface Props {
  onOpenKyc: () => void
  onLogout: () => void
  onOpenTrucks: () => void
  onOpenDrivers: () => void
  onOpenRateCard: () => void
  onOpenNotifications: () => void
  onOpenSettings: () => void
  onOpenSearch: () => void
  onOpenFinance: () => void
  onOpenReviews: () => void
  onOpenTickets: () => void
  onOpenEmergency: () => void
  onOpenChat: () => void
  onOpenFleet: () => void
  onOpenNotifPrefs: () => void
  onOpenInvoices: () => void
  onOpenLoadHistory: () => void
  onOpenQuests: () => void
  onOpenSaved: () => void
  onOpenBids: () => void
  onOpenDisputes: () => void
  onOpenEnablement: () => void
}

export function ProfileScreen({ onOpenKyc, onLogout, onOpenTrucks, onOpenDrivers, onOpenRateCard, onOpenNotifications, onOpenSettings, onOpenSearch, onOpenFinance, onOpenReviews, onOpenTickets, onOpenEmergency, onOpenChat, onOpenFleet, onOpenNotifPrefs, onOpenInvoices, onOpenLoadHistory, onOpenQuests, onOpenSaved, onOpenBids, onOpenDisputes, onOpenEnablement }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const { isDark, cycle } = useThemeMode()
  const [profile, setProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    api
      .get<{ profile: UserProfile }>('/auth/me')
      .then((res) => setProfile(res.profile))
      .catch(() => {})
  }, [])

  const kycPct =
    profile?.kycStatus === 'approved' ? 100 : profile?.kycStatus === 'pending' ? 60 : profile?.kycStatus === 'rejected' ? 20 : 0

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.background }]}>
        <AppLogo height={28} />
        <Pressable onPress={cycle} hitSlop={8} style={[styles.themeBtn, { backgroundColor: theme.muted }]}>
          <Text style={{ fontSize: 16 }}>{isDark ? '☀️' : '🌙'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.profileCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <View style={[styles.avatar, { backgroundColor: theme.accent }]}>
            <Text style={[styles.avatarText, { color: theme.accentForeground }]}>
              {(profile?.name ?? 'T').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.name, { color: theme.foreground }]}>{profile?.name ?? 'Transporter'}</Text>
            <Text style={[styles.mobile, { color: theme.mutedForeground }]}>
              {profile?.mobile ?? ''}
            </Text>
            {profile?.verified && (
              <View style={[styles.verified, { backgroundColor: theme.success + '1A' }]}>
                <Text style={{ color: theme.success, fontSize: 12, fontWeight: '700' }}>✓ Verified</Text>
              </View>
            )}
            {!profile?.verified && (profile?.supplierVerified || profile?.transporterVerified) && (
              <View style={[styles.verified, { backgroundColor: theme.success + '1A' }]}>
                <Text style={{ color: theme.success, fontSize: 12, fontWeight: '700' }}>
                  ✓ {[profile.supplierVerified && 'Supplier', profile.transporterVerified && 'Transporter'].filter(Boolean).join(' + ')} verified
                </Text>
              </View>
            )}
          </View>
        </View>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenKyc}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🛡️</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.verification')}</Text>
              <Text style={[styles.rowStatus, { color: theme.mutedForeground }]}>
                {kycPct}% complete · {profile?.kycStatus.replace('_', ' ')}
              </Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenQuests}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🎯</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.quests')}</Text>
              <Text style={[styles.rowStatus, { color: theme.mutedForeground }]}>{t('profile.questsSub')}</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenNotifications}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🔔</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.notifications')}</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenChat}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>💬</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.messages')}</Text>
              <Text style={[styles.rowStatus, { color: theme.mutedForeground }]}>{t('profile.tripConvos')}</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenFleet}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🚚</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.fleet')}</Text>
              <Text style={[styles.rowStatus, { color: theme.mutedForeground }]}>Trucks · documents · maintenance</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        {(profile?.capabilities?.some((c: string) => ['supplier', 'forwarder', 'warehouse', 'carrier', 'transporter'].includes(c)) ?? true) && (
          <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenEnablement}>
            <View style={styles.rowLeft}>
              <Text style={[styles.rowIcon, { color: theme.primary }]}>🧩</Text>
              <View>
                <Text style={[styles.rowLabel, { color: theme.foreground }]}>Enablement</Text>
                <Text style={[styles.rowStatus, { color: theme.mutedForeground }]}>Shipments · forwarding · plans · finance · storage</Text>
              </View>
            </View>
            <Text style={{ color: theme.mutedForeground }}>›</Text>
          </Pressable>
        )}

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenNotifPrefs}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🔕</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.notifSettings')}</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenSearch}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🔍</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.searchLoads')}</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenFinance}>
          <View style={styles.rowLeft}>
            <RupeeIcon size={24} filled />
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.earnings')}</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenInvoices}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🧾</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.invoices')}</Text>
              <Text style={[styles.rowStatus, { color: theme.mutedForeground }]}>{t('profile.invoicesSub')}</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenSaved}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🔖</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.saved')}</Text>
              <Text style={[styles.rowStatus, { color: theme.mutedForeground }]}>{t('profile.savedSub')}</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenBids}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🤝</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.myBids')}</Text>
              <Text style={[styles.rowStatus, { color: theme.mutedForeground }]}>Bids you've submitted</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenDisputes}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>⚖️</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.disputes')}</Text>
              <Text style={[styles.rowStatus, { color: theme.mutedForeground }]}>{t('profile.disputesSub')}</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenLoadHistory}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🗂️</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.loadHistory')}</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenReviews}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>⭐</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.reviews')}</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenTickets}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🎫</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.tickets')}</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenEmergency}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.danger }]}>🆘</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.emergency')}</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenTrucks}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🚛</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.myTrucks')}</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenDrivers}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>👤</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.drivers')}</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenRateCard}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>📋</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.rateCard')}</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenSettings}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>⚙️</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>{t('profile.settings')}</Text>
              <Text style={[styles.rowStatus, { color: theme.mutedForeground }]}>Language · Help</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable
          style={[styles.logout, { borderColor: theme.danger + '44' }]}
          onPress={onLogout}
        >
          <Text style={{ color: theme.danger, fontWeight: '700', fontSize: 15 }}>{t('profile.logout')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  logo: { fontSize: 24, fontWeight: '800', letterSpacing: -0.02 },
  sub: { fontSize: 13 },
  themeBtn: { borderRadius: radius.full, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.lg, paddingBottom: 130, gap: spacing.md },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24, fontWeight: '800' },
  profileInfo: { flex: 1 },
  name: { fontSize: 18, fontWeight: '700' },
  mobile: { fontSize: 14, marginTop: 1 },
  verified: { alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3, marginTop: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowStatus: { fontSize: 13, marginTop: 1 },
  logout: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, alignItems: 'center' },
})
