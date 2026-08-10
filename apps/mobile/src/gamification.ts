import AsyncStorage from '@react-native-async-storage/async-storage'

export interface Quest {
  id: string
  title: string
  description: string
  icon: string
  xp: number
  /** Screen to open when tapped. Undefined = auto-completed during onboarding. */
  target?: string
}

export interface Badge {
  id: string
  title: string
  icon: string
  description: string
}

export interface GamificationState {
  xp: number
  badges: string[]
  questsDone: string[]
}

const STORAGE_KEY = 'wagon_gamification'

export const XP_PER_LEVEL = 120

export const BADGES: Record<string, Badge> = {
  onboarded: { id: 'onboarded', title: 'Onboarded', icon: '🎓', description: 'Completed your first-run setup' },
  fleet: { id: 'fleet', title: 'Fleet Builder', icon: '🚚', description: 'Added your first truck' },
  crew: { id: 'crew', title: 'Crew Leader', icon: '🧑‍✈️', description: 'Added your first driver' },
  verified: { id: 'verified', title: 'Verified', icon: '🛡️', description: 'Completed KYC verification' },
  firstLoad: { id: 'firstLoad', title: 'First Load', icon: '📦', description: 'Posted your first load' },
  paid: { id: 'paid', title: 'Paid', icon: '💰', description: 'Connected payouts' },
}

export const QUESTS: Record<string, Quest[]> = {
  transporter: [
    { id: 'company', title: 'Company profile', description: 'Tell us about your business', icon: '🏢', xp: 40, target: 'Settings' },
    { id: 'truck', title: 'Add your first truck', description: 'Start building your fleet', icon: '🚚', xp: 60, target: 'MyTrucks' },
    { id: 'driver', title: 'Add a driver', description: 'Bring a driver on board', icon: '🧑‍✈️', xp: 40, target: 'Drivers' },
    { id: 'kyc', title: 'Verify your identity', description: 'Complete KYC to unlock more loads', icon: '🛡️', xp: 60, target: 'Kyc' },
    { id: 'bank', title: 'Connect payouts', description: 'Add bank details for settlements', icon: '💰', xp: 40, target: 'Finance' },
  ],
  supplier: [
    { id: 'company', title: 'Company profile', description: 'Complete your business details', icon: '🏢', xp: 40, target: 'Settings' },
    { id: 'load', title: 'Post your first load', description: 'Get trucks bidding for your freight', icon: '📦', xp: 60, target: 'Post' },
    { id: 'kyc', title: 'Verify your identity', description: 'Complete KYC to unlock faster booking', icon: '🛡️', xp: 60, target: 'Kyc' },
    { id: 'pay', title: 'Set payment terms', description: 'Choose advance / pay-later options', icon: '💰', xp: 30, target: 'Settings' },
  ],
}

export function levelFor(xp: number) {
  return Math.floor(xp / XP_PER_LEVEL) + 1
}

export function levelProgress(xp: number) {
  return ((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100
}

/** Map a done quest back to the badge it should unlock. */
export function badgeForQuest(questId: string): string | null {
  switch (questId) {
    case 'truck': return 'fleet'
    case 'driver': return 'crew'
    case 'kyc': return 'verified'
    case 'load': return 'firstLoad'
    case 'bank': return 'paid'
    case 'pay': return 'paid'
    default: return null
  }
}

export async function loadGamification(): Promise<GamificationState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return { xp: 0, badges: [], questsDone: [] }
    return JSON.parse(raw) as GamificationState
  } catch {
    return { xp: 0, badges: [], questsDone: [] }
  }
}

export async function awardXp(amount: number, extraBadge?: string): Promise<GamificationState> {
  const state = await loadGamification()
  const next: GamificationState = {
    xp: state.xp + amount,
    badges: extraBadge && !state.badges.includes(extraBadge) ? [...state.badges, extraBadge] : state.badges,
    questsDone: state.questsDone,
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export async function completeQuest(questId: string): Promise<GamificationState> {
  const state = await loadGamification()
  if (state.questsDone.includes(questId)) return state
  const next: GamificationState = {
    xp: state.xp,
    badges: state.badges,
    questsDone: [...state.questsDone, questId],
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export async function completeQuestWithXp(questId: string, xp: number): Promise<GamificationState> {
  const state = await loadGamification()
  if (state.questsDone.includes(questId)) return state
  const badge = badgeForQuest(questId)
  const next: GamificationState = {
    xp: state.xp + xp,
    badges: badge && !state.badges.includes(badge) ? [...state.badges, badge] : state.badges,
    questsDone: [...state.questsDone, questId],
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
