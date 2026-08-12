import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PlanningService, PlanLeg } from '../planning/planning.service'
import { OrgAccessService } from '../org-access/org-access.service'
import type { User } from '@prisma/client'

const MAX_OPTIONS = 50
const VALID_MODES = ['road', 'rail', 'ocean', 'air', 'inland_water', 'multimodal']
const VALID_PREFS = ['cheapest', 'fastest', 'balanced']

export interface PlanOption extends PlanLeg {
  name?: string
}

export interface PlanConstraints {
  maxBudget?: number
  maxEtaHours?: number
  modes?: string[]
  preference?: 'cheapest' | 'fastest' | 'balanced'
}

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAccess: OrgAccessService,
    @Inject(PlanningService) private readonly planning: PlanningService,
  ) {}

  /** Validate options and constraints; clamp scores to [0,1]. */
  private validateInput(options: PlanOption[], constraints?: PlanConstraints) {
    if (!options.length) throw new BadRequestException('No route options provided')
    if (options.length > MAX_OPTIONS) throw new BadRequestException(`At most ${MAX_OPTIONS} options allowed`)
    for (const o of options) {
      if (!o.mode || !VALID_MODES.includes(o.mode)) throw new BadRequestException(`Invalid mode: ${o.mode}`)
      if (o.cost != null && (typeof o.cost !== 'number' || !Number.isFinite(o.cost) || o.cost < 0)) {
        throw new BadRequestException('Option cost must be a non-negative number')
      }
      if (o.etaHours != null && (typeof o.etaHours !== 'number' || !Number.isFinite(o.etaHours) || o.etaHours < 0)) {
        throw new BadRequestException('Option etaHours must be a non-negative number')
      }
    }
    if (constraints?.maxBudget != null && constraints.maxBudget < 0) throw new BadRequestException('maxBudget cannot be negative')
    if (constraints?.maxEtaHours != null && constraints.maxEtaHours < 0) throw new BadRequestException('maxEtaHours cannot be negative')
    if (constraints?.preference && !VALID_PREFS.includes(constraints.preference)) throw new BadRequestException('Invalid preference')
    if (constraints?.modes) {
      for (const m of constraints.modes) {
        if (!VALID_MODES.includes(m)) throw new BadRequestException(`Invalid mode constraint: ${m}`)
      }
    }
  }

  private clampScore(n: number) {
    return Math.max(0, Math.min(1, n))
  }

  /**
   * Plan agent: rank candidate routes under constraints and propose the best
   * (and optionally alternatives) as a PROPOSED plan. Guardrails:
   * - never selects/books; only proposes (human acts)
   * - filters options violating budget/ETA/mode whitelist
   * - every recommendation is logged with rationale + guardrail notes
   */
  async recommendPlan(input: { shipmentId: string; options: PlanOption[]; constraints?: PlanConstraints }, user: User) {
    this.validateInput(input.options, input.constraints)
    const shipment = await this.orgAccess.assertShipmentAccess(user, input.shipmentId)

    const constraints = input.constraints ?? {}
    const allowedModes = constraints.modes?.length ? constraints.modes : null

    const eligible = input.options.filter((o) => {
      const legModes = [o.mode]
      if (allowedModes && !legModes.every((m) => allowedModes.includes(m))) return false
      const cost = o.cost ?? 0
      const eta = o.etaHours ?? 0
      if (constraints.maxBudget != null && cost > constraints.maxBudget) return false
      if (constraints.maxEtaHours != null && eta > constraints.maxEtaHours) return false
      return true
    })
    if (!eligible.length) {
      const recommendation = await this.prisma.aiRecommendation.create({
        data: {
          agent: 'plan',
          entityType: 'shipment',
          entityId: input.shipmentId,
          summary: 'No route satisfies constraints',
          output: [] as never,
          constraints: constraints as never,
          guardrails: { reason: 'all options filtered by constraints' } as never,
          createdBy: user.id,
        },
      })
      return { recommendation, plan: null, guardrails: recommendation.guardrails }
    }

    const ranked = eligible
      .map((o) => {
        const cost = o.cost ?? 0
        const eta = o.etaHours ?? 0
        const costScore = cost === 0 ? 1 : this.clampScore(1 - cost / (constraints.maxBudget ?? Math.max(cost, 1)))
        const etaScore = eta === 0 ? 1 : this.clampScore(1 - eta / (constraints.maxEtaHours ?? Math.max(eta, 1)))
        const pref = constraints.preference ?? 'balanced'
        const score =
          pref === 'cheapest' ? costScore * 0.7 + etaScore * 0.3 : pref === 'fastest' ? etaScore * 0.7 + costScore * 0.3 : (costScore + etaScore) / 2
        return { option: o, cost, eta, score: this.clampScore(score) }
      })
      .sort((a, b) => b.score - a.score)

    const best = ranked[0]!.option
    const top = ranked[0]!
    const plan = await this.planning.propose(
      { shipmentId: input.shipmentId, source: 'ai', legs: [best], cost: top.cost, etaHours: top.eta },
      user,
    )

    const summary = `Recommended ${best.mode} (${best.name ?? 'route'}) — ₹${top.cost}, ${top.eta}h`
    const recommendation = await this.prisma.aiRecommendation.create({
      data: {
        agent: 'plan',
        entityType: 'shipment',
        entityId: input.shipmentId,
        summary,
        score: top.score,
        output: ranked.map((r) => ({ mode: r.option.mode, cost: r.cost, eta: r.eta, score: r.score })) as never,
        constraints: constraints as never,
        rationale: {
          preference: constraints.preference ?? 'balanced',
          filteredOut: input.options.length - eligible.length,
          whyBest: `highest ${constraints.preference ?? 'balanced'} score ${top.score.toFixed(2)}`,
        } as never,
        guardrails: { neverAutoExecutes: true, humanMustSelect: true } as never,
        createdBy: user.id,
      },
    })
    return { recommendation, plan: plan.plan, ranked: ranked.map((r) => ({ mode: r.option.mode, cost: r.cost, eta: r.eta, score: r.score })) }
  }

  /**
   * Match agent: rank verified transporters for a load by rating, trips and
   * capacity. Guardrail: only verified/active transporters are surfaced.
   */
  async matchTransporters(loadId: string, user: User) {
    const load = await this.prisma.load.findUnique({ where: { id: loadId } })
    if (!load) throw new NotFoundException('Load not found')
    const supplier = await this.prisma.supplier.findUnique({ where: { id: load.supplierId }, include: { user: true } })
    const isOwner = supplier?.userId === user.id

    const transporters = await this.prisma.user.findMany({
      where: { role: 'transporter', transporterVerified: true, isActive: true, NOT: { id: isOwner ? user.id : '__none__' } },
      include: { transporter: true },
    })
    const ranked = transporters
      .map((t) => ({
        transporter: t,
        score: this.clampScore((Math.min(5, t.rating ?? 3) / 5) * 0.5 + Math.min(1, (t.tripsCount ?? 0) / 50) * 0.3 + (t.transporter?.onboarded ? 0.2 : 0)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)

    const recommendation = await this.prisma.aiRecommendation.create({
      data: {
        agent: 'match',
        entityType: 'load',
        entityId: loadId,
        summary: `Matched ${ranked.length} verified transporter(s) for load ${load.id}`,
        output: ranked.map((r) => ({ userId: r.transporter.id, name: r.transporter.name, rating: r.transporter.rating, score: r.score })) as never,
        guardrails: { onlyVerifiedActive: true, neverAutoAssigns: true } as never,
        createdBy: user.id,
      },
    })
    return { recommendation, matches: ranked.map((r) => ({ userId: r.transporter.id, name: r.transporter.name, rating: r.transporter.rating, score: r.score })) }
  }

  /** Human-in-the-loop: accept or dismiss a recommendation (audit trail). */
  async setRecommendationStatus(id: string, status: 'accepted' | 'dismissed', user: User) {
    const rec = await this.prisma.aiRecommendation.findUnique({ where: { id } })
    if (!rec) throw new NotFoundException('Recommendation not found')
    if (!['proposed', 'accepted', 'dismissed'].includes(rec.status)) throw new BadRequestException('Recommendation is final')
    const updated = await this.prisma.aiRecommendation.update({
      where: { id },
      data: { status, guardrails: { ...(rec.guardrails as object | null), decidedBy: user.id, decidedAt: new Date().toISOString() } as never },
    })
    return { recommendation: updated }
  }

  async list(entityType: string, entityId: string, user: User, agent?: string, status?: string) {
    // Scope by agent run ownership: entity type shipment/load must belong to the caller's orgs.
    let orgWhere = {}
    if (entityType === 'shipment') {
      const orgIds = await this.orgAccess.memberOrgIds(user)
      const owned = await this.prisma.shipment.findMany({ where: { ownerOrgId: { in: orgIds } }, select: { id: true } })
      orgWhere = { entityId: { in: owned.map((s) => s.id) } }
    } else if (entityType === 'load') {
      const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
      const loads = supplier
        ? await this.prisma.load.findMany({ where: { supplierId: supplier.id }, select: { id: true } })
        : []
      orgWhere = { entityId: { in: loads.map((l) => l.id) } }
    }
    const recommendations = await this.prisma.aiRecommendation.findMany({
      where: {
        entityType,
        ...orgWhere,
        ...(agent ? { agent } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return { recommendations }
  }
}
