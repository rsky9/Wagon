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
}

export function ProfileScreen({ onOpenKyc, onLogout, onOpenTrucks, onOpenDrivers, onOpenRateCard, onOpenNotifications, onOpenSettings, onOpenSearch, onOpenFinance, onOpenReviews, onOpenTickets, onOpenEmergency, onOpenChat, onOpenFleet, onOpenNotifPrefs, onOpenInvoices, onOpenLoadHistory, onOpenQuests, onOpenSaved, onOpenBids, onOpenDisputes }: Props) {
  const theme = useTheme()
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
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>Verification (KYC)</Text>
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
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>Rewards & Quests</Text>
              <Text style={[styles.rowStatus, { color: theme.mutedForeground }]}>Earn XP and badges as you grow</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenNotifications}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🔔</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>Notifications</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenChat}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>💬</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>Messages</Text>
              <Text style={[styles.rowStatus, { color: theme.mutedForeground }]}>Trip conversations</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenFleet}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🚚</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>Fleet Dashboard</Text>
              <Text style={[styles.rowStatus, { color: theme.mutedForeground }]}>Trucks · documents · maintenance</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenNotifPrefs}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🔕</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>Notification settings</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenSearch}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🔍</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>Search Loads</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenFinance}>
          <View style={styles.rowLeft}>
            <RupeeIcon size={24} filled />
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>Earnings & Settlements</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenInvoices}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🧾</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>Invoices</Text>
              <Text style={[styles.rowStatus, { color: theme.mutedForeground }]}>GST & TDS breakups</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenSaved}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🔖</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>Saved</Text>
              <Text style={[styles.rowStatus, { color: theme.mutedForeground }]}>Saved loads & searches</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenBids}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🤝</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>My bids</Text>
              <Text style={[styles.rowStatus, { color: theme.mutedForeground }]}>Bids you've submitted</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenDisputes}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>⚖️</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>Disputes</Text>
              <Text style={[styles.rowStatus, { color: theme.mutedForeground }]}>Raise & track disputes</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenLoadHistory}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🗂️</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>Load history</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenReviews}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>⭐</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>Reviews</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenTickets}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🎫</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>Support Tickets</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenEmergency}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.danger }]}>🆘</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>Emergency</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenTrucks}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>🚛</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>My Trucks</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenDrivers}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>👤</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>Drivers</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenRateCard}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>📋</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>Rate Card</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable style={[styles.row, { backgroundColor: theme.background, borderColor: theme.border }]} onPress={onOpenSettings}>
          <View style={styles.rowLeft}>
            <Text style={[styles.rowIcon, { color: theme.primary }]}>⚙️</Text>
            <View>
              <Text style={[styles.rowLabel, { color: theme.foreground }]}>Settings</Text>
              <Text style={[styles.rowStatus, { color: theme.mutedForeground }]}>Language · Help</Text>
            </View>
          </View>
          <Text style={{ color: theme.mutedForeground }}>›</Text>
        </Pressable>

        <Pressable
          style={[styles.logout, { borderColor: theme.danger + '44' }]}
          onPress={onLogout}
        >
          <Text style={{ color: theme.danger, fontWeight: '700', fontSize: 15 }}>Logout</Text>
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
