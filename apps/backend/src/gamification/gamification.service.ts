import {
  Injectable,
  NotFoundException,
  BadRequestException,
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

// Reward wallet: XP earned above the milestone converts to real cash (Wagon Cash).
export const REWARD_MILESTONE_XP = 200 // XP threshold before XP becomes cash-earning
export const XP_CASH_RATE = 0.1 // ₹ per XP (100 XP = ₹10)

export const QUESTS: Record<'transporter' | 'supplier', QuestDef[]> = {
  transporter: [
    { id: 'company', title: 'Company profile', description: 'Tell us about your business', icon: '🏢', xp: 40, target: 'Settings' },
    { id: 'truck', title: 'Add your first vehicle', description: 'Start building your fleet', icon: '🚚', xp: 60, target: 'MyVehicles', badge: 'fleet' },
    { id: 'driver', title: 'Add a driver', description: 'Bring a driver on board', icon: '🧑‍✈️', xp: 40, target: 'Drivers', badge: 'crew' },
    { id: 'kyc', title: 'Verify your identity', description: 'Verify when you\'re ready to bid or get paid', icon: '🛡️', xp: 60, target: 'Kyc', badge: 'verified' },
    { id: 'bank', title: 'Connect payouts', description: 'Add bank details before your first payout', icon: '₹', xp: 40, target: 'Finance', badge: 'paid' },
  ],
  supplier: [
    { id: 'company', title: 'Company profile', description: 'Complete your business details', icon: '🏢', xp: 40, target: 'Settings' },
    { id: 'load', title: 'Post your first load', description: 'Get trucks bidding for your freight', icon: '📦', xp: 60, target: 'PostLoadWizard', badge: 'firstLoad' },
    { id: 'kyc', title: 'Verify your identity', description: 'Verify when you\'re ready to post or pay', icon: '🛡️', xp: 60, target: 'Kyc', badge: 'verified' },
    { id: 'pay', title: 'Set payment terms', description: 'Choose advance / pay-later options', icon: '₹', xp: 30, target: 'Settings', badge: 'paid' },
  ],
}

export const BADGES: Record<string, BadgeDef> = {
  onboarded: { id: 'onboarded', title: 'Onboarded', icon: '🎓', description: 'Completed your first-run setup' },
  fleet: { id: 'fleet', title: 'Fleet Builder', icon: '🚚', description: 'Added your first truck' },
  crew: { id: 'crew', title: 'Crew Leader', icon: '🧑‍✈️', description: 'Added your first driver' },
  verified: { id: 'verified', title: 'Verified', icon: '🛡️', description: 'Completed KYC verification' },
  firstLoad: { id: 'firstLoad', title: 'First Load', icon: '📦', description: 'Posted your first load' },
  paid: { id: 'paid', title: 'Paid', icon: '₹', description: 'Connected payouts' },
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

    // XP earned above the milestone converts into real Wagon Cash.
    await this.convertXpToCash(user.id)

    const fresh = await this.prisma.user.findUnique({ where: { id: user.id } })
    // Derive quests from capabilities so combined (supplier+transporter), driver
    // and enablement users get the quests that match what they can actually do.
    // Role is only a fallback when capabilities haven't been set yet.
    const hasCaps = Boolean(user.capabilities?.length)
    const questRoles = new Set<'transporter' | 'supplier'>()
    if (hasCaps ? user.capabilities.includes('transporter') : user.role === 'transporter') questRoles.add('transporter')
    if (hasCaps ? user.capabilities.includes('supplier') : user.role === 'supplier') questRoles.add('supplier')
    const quests = ([...questRoles] as Array<'transporter' | 'supplier'>)
      .flatMap((r) => QUESTS[r] ?? [])
      .map((q) => ({ ...q, done: doneSet.has(q.id) }))
    const xp = fresh?.xp ?? profile?.xp ?? 0

    return {
      xp,
      cashbackBalance: fresh?.cashbackBalance ?? 0,
      level: Math.floor(xp / XP_PER_LEVEL) + 1,
      xpIntoLevel: xp % XP_PER_LEVEL,
      xpPerLevel: XP_PER_LEVEL,
      badges: Object.values(BADGES).map((b) => ({ ...b, earned: badgeSet.has(b.id) })),
      quests,
      totalXp: quests.reduce((s, q) => s + q.xp, 0),
    }
  }

  /** Idempotently convert XP earned above the milestone into wallet cash. */
  private async convertXpToCash(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) return
    const eligible = Math.max(0, user.xp - REWARD_MILESTONE_XP)
    const fresh = eligible - user.xpConverted
    if (fresh <= 0) return
    const amount = Math.round(fresh * XP_CASH_RATE * 100) / 100
    // Atomic: only convert the portion of XP not yet converted, and only once
    // per concurrent caller — a conditional update prevents double-award.
    const changed = await this.prisma.user.updateMany({
      where: { id: userId, xpConverted: { lt: eligible } },
      data: { cashbackBalance: { increment: amount }, xpConverted: eligible },
    })
    if (changed.count === 0) return
    await this.prisma.walletTransaction.create({
      data: { userId, kind: 'xp_conversion', amount, note: `${fresh} XP converted to cash` },
    })
  }

  /** Explicitly complete a quest (idempotent). Awards XP + badge ONCE. */
  async completeQuest(questId: string, user: User) {
    const hasCaps = Boolean(user.capabilities?.length)
    const questRoles: Array<'transporter' | 'supplier'> = []
    if (hasCaps ? user.capabilities.includes('transporter') : user.role === 'transporter') questRoles.push('transporter')
    if (hasCaps ? user.capabilities.includes('supplier') : user.role === 'supplier') questRoles.push('supplier')
    const quest = questRoles.flatMap((r) => QUESTS[r] ?? []).find((q) => q.id === questId)
    if (!quest) throw new NotFoundException('Quest not found')

    // Atomic claim: only the first completion awards XP/badge — a repeat call
    // (or a concurrent double-fire) must not re-mint.
    const claimed = await this.prisma.userQuest.updateMany({
      where: { userId: user.id, questId, completedAt: null },
      data: { completedAt: new Date() },
    })
    if (claimed.count === 0) {
      // Already completed — idempotent no-op (still return the fresh state).
      return this.state(user)
    }
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

  /**
   * Award the onboarding milestone XP + badge. Server-validated: only the
   * single 'onboarded' award is allowed, and only after onboarding is complete.
   * (Prevents clients from minting arbitrary XP, which converts to Wagon Cash.)
   */
  async awardXp(amount: number, badge: string | undefined, user: User) {
    if (badge !== 'onboarded' || amount !== 120) {
      throw new BadRequestException('Invalid reward')
    }
    const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
    const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    if (!supplier?.onboarded && !transporter?.onboarded) {
      throw new BadRequestException('Complete onboarding first')
    }
    // Idempotent: the badge may only be awarded once — no repeat XP minting.
    const existingBadge = await this.prisma.userBadge.findUnique({
      where: { userId_badgeId: { userId: user.id, badgeId: badge } },
    })
    if (existingBadge) return this.state(user)
    await this.prisma.user.update({ where: { id: user.id }, data: { xp: { increment: amount } } })
    await this.prisma.userBadge.upsert({
      where: { userId_badgeId: { userId: user.id, badgeId: badge } },
      update: {},
      create: { userId: user.id, badgeId: badge },
    })
    return this.state(user)
  }

  /** Real-data conditions that determine auto-completion. */
  private async completionSnapshot(user: User) {
    const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
    const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    const [trucks, drivers, loads] = await Promise.all([
      transporter ? this.prisma.vehicle.count({ where: { transporterId: transporter.id } }) : Promise.resolve(0),
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
    const hasCaps = Boolean(user.capabilities?.length)
    const roles: Array<'transporter' | 'supplier'> = []
    if (hasCaps ? user.capabilities.includes('transporter') : user.role === 'transporter') roles.push('transporter')
    if (hasCaps ? user.capabilities.includes('supplier') : user.role === 'supplier') roles.push('supplier')
    for (const role of roles) {
      const toComplete: string[] = []
      for (const q of QUESTS[role] ?? []) {
        if (counts[q.id as keyof typeof counts] && !doneSet.has(q.id)) toComplete.push(q.id)
      }
      for (const questId of toComplete) {
        const quest = (QUESTS[role] ?? []).find((q) => q.id === questId)
        // Atomic claim: only the first completion awards XP — concurrent state()
        // calls must not double-mint (XP auto-converts to cash).
        const claimed = await this.prisma.userQuest.updateMany({
          where: { userId: user.id, questId, completedAt: null },
          data: { completedAt: new Date() },
        })
        if (claimed.count === 0) continue
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
}
