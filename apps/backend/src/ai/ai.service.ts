import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PlanningService, PlanLeg } from '../planning/planning.service'
import type { User } from '@prisma/client'

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
    @Inject(PlanningService) private readonly planning: PlanningService,
  ) {}

  /**
   * Plan agent: rank candidate routes under constraints and propose the best
   * (and optionally alternatives) as a PROPOSED plan. Guardrails:
   * - never selects/books; only proposes (human acts)
   * - filters options violating budget/ETA/mode whitelist
   * - every recommendation is logged with rationale + guardrail notes
   */
  async recommendPlan(input: { shipmentId: string; options: PlanOption[]; constraints?: PlanConstraints }, user: User) {
    if (!input.options?.length) throw new BadRequestException('No route options provided')
    const shipment = await this.prisma.shipment.findUnique({ where: { id: input.shipmentId } })
    if (!shipment) throw new NotFoundException('Shipment not found')

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
        const costScore = cost === 0 ? 1 : Math.max(0, 1 - cost / (constraints.maxBudget ?? Math.max(cost, 1)))
        const etaScore = eta === 0 ? 1 : Math.max(0, 1 - eta / (constraints.maxEtaHours ?? Math.max(eta, 1)))
        const pref = constraints.preference ?? 'balanced'
        const score =
          pref === 'cheapest' ? costScore * 0.7 + etaScore * 0.3 : pref === 'fastest' ? etaScore * 0.7 + costScore * 0.3 : (costScore + etaScore) / 2
        return { option: o, cost, eta, score }
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

    const transporters = await this.prisma.user.findMany({
      where: { role: 'transporter', transporterVerified: true, isActive: true },
      include: { transporter: true },
    })
    const ranked = transporters
      .map((t) => ({
        transporter: t,
        score: (t.rating ?? 3) * 0.5 + Math.min(1, (t.tripsCount ?? 0) / 50) * 0.3 + (t.transporter?.onboarded ? 0.2 : 0),
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

  async list(entityType: string, entityId: string) {
    const recommendations = await this.prisma.aiRecommendation.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    return { recommendations }
  }
}
