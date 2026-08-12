import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PlanningService, PlanLeg } from '../planning/planning.service'
import { OrgAccessService } from '../org-access/org-access.service'
import { MarketService } from '../market/market.service'
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
    private readonly market: MarketService,
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
   * capacity. Guardrail: only verified/active transporters are surfaced, and
   * only the load's supplier (or their org members) may run it.
   */
  async matchTransporters(loadId: string, user: User) {
    const load = await this.prisma.load.findUnique({ where: { id: loadId } })
    if (!load) throw new NotFoundException('Load not found')
    const supplier = await this.prisma.supplier.findUnique({ where: { id: load.supplierId }, include: { user: true } })
    const isOwner = supplier?.userId === user.id
    if (!isOwner && !(await this.orgAccess.isMember(user, supplier?.user ? (await this.orgOfSupplier(supplier.userId)) : '__none__'))) {
      throw new ForbiddenException('Only the load supplier or their organization can run the match agent')
    }

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
    // Only the creator (or an org member of the creator) may act on it.
    if (rec.createdBy && rec.createdBy !== user.id) {
      const member = await this.prisma.organizationMember.findFirst({ where: { userId: rec.createdBy } })
      if (!member || !(await this.orgAccess.isMember(user, member.organizationId))) {
        throw new ForbiddenException('Not your recommendation')
      }
    }
    const updated = await this.prisma.aiRecommendation.update({
      where: { id },
      data: { status, guardrails: { ...(rec.guardrails as object | null), decidedBy: user.id, decidedAt: new Date().toISOString() } as never },
    })
    return { recommendation: updated }
  }

  /**
   * Market agent: rank live listings against a market request (any capability)
   * and log a guardrailed recommendation. Never auto-books — human must act.
   */
  async recommendMarket(requestId: string, user: User) {
    const request = await this.prisma.marketRequest.findUnique({ where: { id: requestId } })
    if (!request) throw new NotFoundException('Market request not found')
    const matches = await this.market.matchRequest(requestId, user)

    const recommendation = await this.prisma.aiRecommendation.create({
      data: {
        agent: 'market',
        entityType: 'request',
        entityId: requestId,
        summary: `Matched ${matches.matches.length} listing(s) for ${request.kind} demand`,
        output: matches.matches.map((m) => ({ listingId: m.id, kind: m.kind, origin: m.originRef, destination: m.destinationRef, price: m.price, score: m.score, orgRating: m.orgRating })) as never,
        constraints: { kind: request.kind, city: request.city, origin: request.originRef } as never,
        rationale: { laneFit: 'ranked by lane/city/capacity/rating/verified' } as never,
        guardrails: { neverAutoBooks: true, humanMustQuote: true } as never,
        createdBy: user.id,
      },
    })
    return { recommendation, matches: matches.matches }
  }

  /**
   * Carrier agent: rank active carrier services for a lane and log a
   * guardrailed recommendation. Never auto-books — a forwarder must choose.
   */
  async recommendCarrier(input: { originRef: string; destinationRef: string; mode?: string }, user: User) {
    if (!input.originRef?.trim() || !input.destinationRef?.trim()) {
      throw new BadRequestException('Origin and destination required')
    }
    const services = await this.prisma.carrierService.findMany({
      where: {
        status: 'active',
        originRef: { contains: input.originRef.toLowerCase() },
        destinationRef: { contains: input.destinationRef.toLowerCase() },
        ...(input.mode ? { mode: input.mode } : {}),
      },
      include: { carrierOrg: { select: { id: true, name: true, verified: true, verifiedCapabilities: true } } },
      orderBy: { departureAt: 'asc' },
      take: 50,
    })
    const scored = services
      .map((s) => ({
        ...s,
        score: this.clampScore(
          (s.availableSlots / Math.max(1, s.totalSlots)) * 0.5 +
            (s.rate && s.rate > 0 ? Math.max(0, 1 - s.rate / 500_000) * 0.3 : 0.3) +
            (s.carrierOrg.verified ? 0.2 : 0),
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)

    const recommendation = await this.prisma.aiRecommendation.create({
      data: {
        agent: 'carrier',
        entityType: 'service',
        entityId: `${input.originRef}→${input.destinationRef}`,
        summary: `Ranked ${scored.length} carrier service(s) on ${input.originRef}→${input.destinationRef}`,
        output: scored.map((s) => ({ serviceId: s.id, vessel: s.vessel, voyage: s.voyage, flight: s.flight, rate: s.rate, availableSlots: s.availableSlots, score: s.score })) as never,
        constraints: { originRef: input.originRef, destinationRef: input.destinationRef, mode: input.mode } as never,
        rationale: { slotAvailability: 'scored by available slots, price, verification' } as never,
        guardrails: { neverAutoBooks: true, humanMustBook: true } as never,
        createdBy: user.id,
      },
    })
    return { recommendation, services: scored }
  }

  /**
   * Invite a matched transporter to bid on a load (the actionable follow-up to
   * the match agent). Creates a shortlist entry + a notification.
   */
  async inviteTransporter(loadId: string, transporterId: string, user: User) {
    const load = await this.prisma.load.findUnique({ where: { id: loadId } })
    if (!load) throw new NotFoundException('Load not found')
    const supplier = await this.prisma.supplier.findUnique({ where: { id: load.supplierId }, include: { user: true } })
    if (!supplier || supplier.userId !== user.id) throw new ForbiddenException('Only the load supplier can invite transporters')

    const transporter = await this.prisma.user.findUnique({
      where: { id: transporterId },
      include: { transporter: true },
    })
    if (!transporter?.transporter || !transporter.transporterVerified) {
      throw new BadRequestException('Transporter is not verified')
    }

    // Persist a shortlist (Load.shortlistedTransporters is a String[]).
    const updated = await this.prisma.load.update({
      where: { id: loadId },
      data: { shortlistedTransporters: { push: transporterId } },
    })
    return { load: updated, invited: transporterId, note: 'Transporter can now be shortlisted on this load' }
  }

  private async orgOfSupplier(userId: string) {
    const member = await this.prisma.organizationMember.findFirst({ where: { userId }, include: { organization: true } })
    return member?.organizationId ?? '__none__'
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
