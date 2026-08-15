import { useEffect, useState } from 'react'
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme, spacing, radius, shadows } from '@wagon/design'
import { useThemeMode } from '../theme'
import { api } from '../config'
import { AppLogo } from '../components/AppLogo'
import { useI18n } from '@wagon/i18n'
import type { UserProfile } from '@wagon/contracts'
import { SectionHeader, SettingRow, GroupTitle, CapabilityChip } from '../components/ui'

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

const CAP_LABEL: Record<string, string> = {
  supplier: 'Shipper',
  transporter: 'Transporter',
  forwarder: 'Forwarder',
  warehouse: 'Warehouse',
  carrier: 'Carrier',
  driver: 'Driver',
}

export function ProfileScreen({ onOpenKyc, onLogout, onOpenTrucks, onOpenDrivers, onOpenRateCard, onOpenNotifications, onOpenSettings, onOpenSearch, onOpenFinance, onOpenReviews, onOpenTickets, onOpenEmergency, onOpenChat, onOpenFleet, onOpenNotifPrefs, onOpenInvoices, onOpenLoadHistory, onOpenQuests, onOpenSaved, onOpenBids, onOpenDisputes, onOpenEnablement }: Props) {
  const theme = useTheme()
  const { t } = useI18n()
  const { isDark, cycle } = useThemeMode()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [trust, setTrust] = useState<{ rating: number | null; ratingCount: number; trips: number; completionRate: number | null; claims: number } | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<{ profile: UserProfile }>('/auth/me')
      .then((res) => setProfile(res.profile))
      .catch(() => {})
    api
      .get<{ organizations: { id: string }[] }>('/foundation/organizations')
      .then((r) => {
        if (r.organizations[0]) {
          setOrgId(r.organizations[0].id)
          api.get<{ rating: number | null; ratingCount: number; trips: number; completionRate: number | null; claims: number }>(`/market/trust/${r.organizations[0].id}`)
            .then((res) => setTrust(res))
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [])

  const kycPct =
    profile?.kycStatus === 'approved' ? 100 : profile?.kycStatus === 'pending' ? 60 : profile?.kycStatus === 'rejected' ? 20 : 0
  const caps = profile?.capabilities?.length ? profile.capabilities : [profile?.role ?? '']
  const verified = profile?.verified || profile?.supplierVerified || profile?.transporterVerified
  const isTransporter = caps.includes('transporter')
  const isSupplier = caps.includes('supplier')
  const isEnablement = caps.some((c) => ['forwarder', 'warehouse', 'carrier'].includes(c)) || isSupplier || isTransporter

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.background }]}>
        <AppLogo height={28} />
        <Pressable onPress={cycle} hitSlop={8} style={[styles.themeBtn, { backgroundColor: theme.muted }]}>
          <Text style={{ fontSize: 16 }}>{isDark ? '☀️' : '🌙'}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>

        {/* Identity hero */}
        <LinearGradient colors={['#0F172A', '#1E293B']} style={[styles.hero, shadows.lg]}>
          <View style={styles.heroTop}>
            <View style={[styles.avatar, { backgroundColor: 'rgba(249,115,22,0.25)' }]}>
              <Text style={[styles.avatarText, { color: '#FB923C' }]}>
                {(profile?.name ?? 'T').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.heroInfo}>
              <Text style={[styles.heroName, { color: '#fff' }]}>{profile?.name ?? 'Your account'}</Text>
              <Text style={[styles.heroMobile, { color: 'rgba(255,255,255,0.6)' }]}>{profile?.mobile ?? ''}</Text>
              <View style={styles.heroBadges}>
                {verified && (
                  <View style={[styles.heroBadge, { backgroundColor: 'rgba(16,185,129,0.2)' }]}>
                    <Text style={{ color: '#34D399', fontSize: 11, fontWeight: '800' }}>✓ VERIFIED</Text>
                  </View>
                )}
                <View style={[styles.heroBadge, { backgroundColor: 'rgba(249,115,22,0.2)' }]}>
                  <Text style={{ color: '#FB923C', fontSize: 11, fontWeight: '800' }}>KYC {kycPct}%</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.capRow}>
            {caps.map((c) => <CapabilityChip key={c} label={CAP_LABEL[c] ?? c} verified={verified} />)}
          </View>
        </LinearGradient>

        {/* Trust score */}
        {trust && (
          <View style={[styles.trustCard, { backgroundColor: theme.card, borderColor: theme.border }, shadows.sm]}>
            <View style={styles.trustLeft}>
              <Text style={[styles.trustTitle, { color: theme.foreground }]}>Marketplace trust</Text>
              <Text style={[styles.trustSub, { color: theme.mutedForeground }]}>Your standing on the network</Text>
            </View>
            <View style={styles.trustScore}>
              <Text style={[styles.trustRating, { color: theme.primary }]}>{trust.rating ? `★ ${trust.rating.toFixed(1)}` : '★ new'}</Text>
              <Text style={[styles.trustMeta, { color: theme.mutedForeground }]}>{trust.ratingCount} review(s)</Text>
            </View>
            <View style={styles.trustStats}>
              <View style={styles.trustStat}>
                <Text style={[styles.trustStatValue, { color: theme.foreground }]}>{trust.completionRate != null ? `${trust.completionRate}%` : '—'}</Text>
                <Text style={[styles.trustStatLabel, { color: theme.mutedForeground }]}>Completion</Text>
              </View>
              <View style={[styles.trustDivider, { backgroundColor: theme.border }]} />
              <View style={styles.trustStat}>
                <Text style={[styles.trustStatValue, { color: theme.foreground }]}>{trust.trips}</Text>
                <Text style={[styles.trustStatLabel, { color: theme.mutedForeground }]}>Trips done</Text>
              </View>
              <View style={[styles.trustDivider, { backgroundColor: theme.border }]} />
              <View style={styles.trustStat}>
                <Text style={[styles.trustStatValue, { color: theme.foreground }]}>{trust.claims}</Text>
                <Text style={[styles.trustStatLabel, { color: theme.mutedForeground }]}>Claims</Text>
              </View>
            </View>
          </View>
        )}

        {/* Identity & Trust */}
        <GroupTitle>Identity &amp; Trust</GroupTitle>
        <SettingRow icon="🛡️" label={t('profile.verification')} sub={`${kycPct}% complete · ${profile?.kycStatus.replace('_', ' ')}`} onPress={onOpenKyc} trailing={kycPct > 0 ? `${kycPct}%` : undefined} />
        {orgId && <SettingRow icon="🏢" label="Organization profile" sub="Members, kind & marketplace trust" onPress={onOpenEnablement} />}
        <SettingRow icon="⭐" label={t('profile.reviews')} onPress={onOpenReviews} />
        <SettingRow icon="🎯" label={t('profile.quests')} sub={t('profile.questsSub')} onPress={onOpenQuests} />

        {/* Marketplace & Operations */}
        <GroupTitle>Marketplace</GroupTitle>
        <SettingRow icon="🏪" label="Capability marketplace" sub="Offer, demand & quotes" onPress={onOpenEnablement} />
        <SettingRow icon="🤝" label={t('profile.myBids')} sub="Bids you've submitted" onPress={onOpenBids} />
        <SettingRow icon="🔖" label={t('profile.saved')} sub={t('profile.savedSub')} onPress={onOpenSaved} />
        <SettingRow icon="🔍" label={t('profile.searchLoads')} onPress={onOpenSearch} />
        <SettingRow icon="🗂️" label={t('profile.loadHistory')} onPress={onOpenLoadHistory} />

        {isEnablement && (
          <>
            <GroupTitle>Enablement</GroupTitle>
            <SettingRow icon="🧩" label="Enablement hub" sub="Shipments · forwarding · plans · finance · storage · integrations" onPress={onOpenEnablement} />
          </>
        )}

        {isTransporter && (
          <>
            <GroupTitle>Fleet</GroupTitle>
            <SettingRow icon="🚚" label={t('profile.fleet')} sub="Trucks · documents · maintenance" onPress={onOpenFleet} />
            <SettingRow icon="🚛" label={t('profile.myTrucks')} onPress={onOpenTrucks} />
            <SettingRow icon="👤" label={t('profile.drivers')} onPress={onOpenDrivers} />
            <SettingRow icon="📋" label={t('profile.rateCard')} onPress={onOpenRateCard} />
          </>
        )}

        {/* Finance */}
        <GroupTitle>Finance</GroupTitle>
        <SettingRow icon="💰" label={t('profile.earnings')} onPress={onOpenFinance} />
        <SettingRow icon="🧾" label={t('profile.invoices')} sub={t('profile.invoicesSub')} onPress={onOpenInvoices} />
        <SettingRow icon="⚖️" label={t('profile.disputes')} sub={t('profile.disputesSub')} onPress={onOpenDisputes} />

        {/* Support & Preferences */}
        <GroupTitle>Support</GroupTitle>
        <SettingRow icon="🔔" label={t('profile.notifications')} onPress={onOpenNotifications} />
        <SettingRow icon="🔕" label={t('profile.notifSettings')} onPress={onOpenNotifPrefs} />
        <SettingRow icon="💬" label={t('profile.messages')} sub={t('profile.tripConvos')} onPress={onOpenChat} />
        <SettingRow icon="🎫" label={t('profile.tickets')} onPress={onOpenTickets} />
        <SettingRow icon="🆘" label={t('profile.emergency')} onPress={onOpenEmergency} danger />

        <GroupTitle>Preferences</GroupTitle>
        <SettingRow icon="⚙️" label={t('profile.settings')} sub="Language · Help" onPress={onOpenSettings} />

        <Pressable style={[styles.logout, { borderColor: theme.danger + '44' }]} onPress={onLogout}>
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
  themeBtn: { borderRadius: radius.full, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  body: { padding: spacing.lg, paddingBottom: 140 },
  hero: { borderRadius: radius.xl, padding: spacing.xl, gap: spacing.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 26, fontWeight: '800' },
  heroInfo: { flex: 1, gap: spacing.xs },
  heroName: { fontSize: 20, fontWeight: '800' },
  heroMobile: { fontSize: 14 },
  heroBadges: { flexDirection: 'row', gap: spacing.sm, marginTop: 2 },
  heroBadge: { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 3 },
  capRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  trustCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, marginTop: spacing.md, gap: spacing.md },
  trustLeft: { gap: 2 },
  trustTitle: { fontSize: 15, fontWeight: '800' },
  trustSub: { fontSize: 12 },
  trustScore: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  trustRating: { fontSize: 26, fontWeight: '800' },
  trustMeta: { fontSize: 12 },
  trustStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  trustStat: { flex: 1, alignItems: 'center' },
  trustStatValue: { fontSize: 18, fontWeight: '800' },
  trustStatLabel: { fontSize: 11, fontWeight: '600' },
  trustDivider: { width: 1, height: 28 },
  logout: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, alignItems: 'center', marginTop: spacing.xl },
})
