import {
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

export interface QuestDef {
  id: string
  title: string
  description: string
  icon: string
  xp: number
  /** Screen to open when tapped. */
  target?: string
  /** Badge unlocked on completion. */
  badge?: string
}

export interface BadgeDef {
  id: string
  title: string
  icon: string
  description: string
}

export const XP_PER_LEVEL = 120

export const QUESTS: Record<'transporter' | 'supplier', QuestDef[]> = {
  transporter: [
    { id: 'company', title: 'Company profile', description: 'Tell us about your business', icon: '🏢', xp: 40, target: 'Settings' },
    { id: 'truck', title: 'Add your first truck', description: 'Start building your fleet', icon: '🚚', xp: 60, target: 'MyTrucks', badge: 'fleet' },
    { id: 'driver', title: 'Add a driver', description: 'Bring a driver on board', icon: '🧑‍✈️', xp: 40, target: 'Drivers', badge: 'crew' },
    { id: 'kyc', title: 'Verify your identity', description: 'Complete KYC to unlock more loads', icon: '🛡️', xp: 60, target: 'Kyc', badge: 'verified' },
    { id: 'bank', title: 'Connect payouts', description: 'Add bank details for settlements', icon: '💰', xp: 40, target: 'Finance', badge: 'paid' },
  ],
  supplier: [
    { id: 'company', title: 'Company profile', description: 'Complete your business details', icon: '🏢', xp: 40, target: 'Settings' },
    { id: 'load', title: 'Post your first load', description: 'Get trucks bidding for your freight', icon: '📦', xp: 60, target: 'PostLoadWizard', badge: 'firstLoad' },
    { id: 'kyc', title: 'Verify your identity', description: 'Complete KYC to unlock faster booking', icon: '🛡️', xp: 60, target: 'Kyc', badge: 'verified' },
    { id: 'pay', title: 'Set payment terms', description: 'Choose advance / pay-later options', icon: '💰', xp: 30, target: 'Settings', badge: 'paid' },
  ],
}

export const BADGES: Record<string, BadgeDef> = {
  onboarded: { id: 'onboarded', title: 'Onboarded', icon: '🎓', description: 'Completed your first-run setup' },
  fleet: { id: 'fleet', title: 'Fleet Builder', icon: '🚚', description: 'Added your first truck' },
  crew: { id: 'crew', title: 'Crew Leader', icon: '🧑‍✈️', description: 'Added your first driver' },
  verified: { id: 'verified', title: 'Verified', icon: '🛡️', description: 'Completed KYC verification' },
  firstLoad: { id: 'firstLoad', title: 'First Load', icon: '📦', description: 'Posted your first load' },
  paid: { id: 'paid', title: 'Paid', icon: '💰', description: 'Connected payouts' },
}

@Injectable()
export class GamificationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Snapshot of a user's XP, level, badges and quest completion (server-driven). */
  async state(user: User) {
    const [profile, badges, done, counts] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: user.id } }),
      this.prisma.userBadge.findMany({ where: { userId: user.id } }),
      this.prisma.userQuest.findMany({ where: { userId: user.id } }),
      this.completionSnapshot(user),
    ])
    const doneSet = new Set(done.map((d) => d.questId))
    const badgeSet = new Set(badges.map((b) => b.badgeId))

    // Auto-complete quests/badges whose real-world condition is already met.
    await this.autoComplete(user, counts, doneSet, badgeSet)

    const role = user.role === 'supplier' ? 'supplier' : 'transporter'
    const quests = (QUESTS[role] ?? []).map((q) => ({ ...q, done: doneSet.has(q.id) }))
    const xp = profile?.xp ?? 0

    return {
      xp,
      level: Math.floor(xp / XP_PER_LEVEL) + 1,
      xpIntoLevel: xp % XP_PER_LEVEL,
      xpPerLevel: XP_PER_LEVEL,
      badges: Object.values(BADGES).map((b) => ({ ...b, earned: badgeSet.has(b.id) })),
      quests,
      totalXp: quests.reduce((s, q) => s + q.xp, 0),
    }
  }

  /** Explicitly complete a quest (idempotent). Awards XP + badge. */
  async completeQuest(questId: string, user: User) {
    const role = user.role === 'supplier' ? 'supplier' : 'transporter'
    const quest = (QUESTS[role] ?? []).find((q) => q.id === questId)
    if (!quest) throw new NotFoundException('Quest not found')

    await this.prisma.userQuest.upsert({
      where: { userId_questId: { userId: user.id, questId } },
      update: { completedAt: new Date() },
      create: { userId: user.id, questId, completedAt: new Date() },
    })
    await this.prisma.user.update({ where: { id: user.id }, data: { xp: { increment: quest.xp } } })
    if (quest.badge) {
      await this.prisma.userBadge.upsert({
        where: { userId_badgeId: { userId: user.id, badgeId: quest.badge } },
        update: {},
        create: { userId: user.id, badgeId: quest.badge },
      })
    }
    return this.state(user)
  }

  /** Award XP + an optional badge directly (e.g. onboarding completion). */
  async awardXp(amount: number, badge: string | undefined, user: User) {
    await this.prisma.user.update({ where: { id: user.id }, data: { xp: { increment: amount } } })
    if (badge && BADGES[badge]) {
      await this.prisma.userBadge.upsert({
        where: { userId_badgeId: { userId: user.id, badgeId: badge } },
        update: {},
        create: { userId: user.id, badgeId: badge },
      })
    }
    return this.state(user)
  }

  /** Real-data conditions that determine auto-completion. */
  private async completionSnapshot(user: User) {
    const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
    const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    const [trucks, drivers, loads] = await Promise.all([
      transporter ? this.prisma.truck.count({ where: { transporterId: transporter.id } }) : Promise.resolve(0),
      transporter ? this.prisma.driver.count({ where: { transporterId: transporter.id } }) : Promise.resolve(0),
      supplier ? this.prisma.load.count({ where: { supplierId: supplier.id } }) : Promise.resolve(0),
    ])
    return {
      onboarded: !!supplier?.onboarded || !!transporter?.onboarded,
      company: !!supplier?.onboarded || !!transporter?.onboarded,
      truck: trucks > 0,
      driver: drivers > 0,
      load: loads > 0,
      kyc: user.kycStatus === 'approved' || user.verified,
      bank: !!transporter?.bankAccount || !!supplier?.bankAccount,
      pay: !!transporter?.bankAccount || !!supplier?.bankAccount,
    }
  }

  /** Mark quests/badges done when their underlying data already exists. */
  private async autoComplete(
    user: User,
    counts: Awaited<ReturnType<typeof this.completionSnapshot>>,
    doneSet: Set<string>,
    badgeSet: Set<string>,
  ) {
    const role = user.role === 'supplier' ? 'supplier' : 'transporter'
    const toComplete: string[] = []
    for (const q of QUESTS[role] ?? []) {
      if (counts[q.id as keyof typeof counts] && !doneSet.has(q.id)) toComplete.push(q.id)
    }

    for (const questId of toComplete) {
      const quest = (QUESTS[role] ?? []).find((q) => q.id === questId)
      await this.prisma.userQuest.upsert({
        where: { userId_questId: { userId: user.id, questId } },
        update: { completedAt: new Date() },
        create: { userId: user.id, questId, completedAt: new Date() },
      })
      if (quest?.xp) {
        await this.prisma.user.update({ where: { id: user.id }, data: { xp: { increment: quest.xp } } })
      }
      if (quest?.badge && !badgeSet.has(quest.badge)) {
        await this.prisma.userBadge.upsert({
          where: { userId_badgeId: { userId: user.id, badgeId: quest.badge } },
          update: {},
          create: { userId: user.id, badgeId: quest.badge },
        })
      }
    }
  }
}
