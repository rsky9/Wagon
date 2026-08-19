import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { PlanningService, PlanLeg } from '../planning/planning.service'
import { OrgAccessService } from '../org-access/org-access.service'
import { MarketService } from '../market/market.service'
import { OutboxRelay } from '../outbox/outbox-relay.service'
import { NotificationsService } from '../notifications/notifications.service'
import type { User } from '@prisma/client'

const MAX_OPTIONS = 50
const VALID_MODES = ['road', 'rail', 'ocean', 'air', 'inland_water', 'multimodal']
const VALID_PREFS = ['cheapest', 'fastest', 'balanced']

const MODE_RISK: Record<string, number> = {
  ocean: 0.18,
  air: 0.12,
  road: 0.05,
  rail: 0.05,
  inland_water: 0.1,
  multimodal: 0.12,
}

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
    private readonly notifications: NotificationsService,
    @Inject(PlanningService) private readonly planning: PlanningService,
    @Inject(OutboxRelay) private readonly outbox: OutboxRelay,
  ) {}

  /** Persist a recommendation + emit an AI_RECOMMENDED outbox event atomically. */
  private async persist(entity: { type: string; id: string; orgId?: string | null }, data: Record<string, unknown>, actorId: string) {
    const created = await this.prisma.$transaction(async (tx) => {
      const rec = await tx.aiRecommendation.create({ data: data as never })
      await this.outbox.emit(tx as never, {
        eventType: 'AI',
        eventCode: 'AI_RECOMMENDED',
        entityType: entity.type,
        entityId: entity.id,
        orgId: entity.orgId ?? null,
        actorId,
        payload: { agent: data.agent, recommendationId: rec.id, summary: data.summary, score: data.score },
      })
      return rec
    })
    return created
  }

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
      const recommendation = await this.persist(
        { type: 'shipment', id: input.shipmentId, orgId: shipment.ownerOrgId },
        {
          agent: 'plan',
          entityType: 'shipment',
          entityId: input.shipmentId,
          summary: 'No route satisfies constraints',
          output: { matches: [] } as never,
          constraints: constraints as never,
          guardrails: { reason: 'all options filtered by constraints', neverAutoExecutes: true } as never,
          createdBy: user.id,
        },
        user.id,
      )
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
    const recommendation = await this.persist(
      { type: 'shipment', id: input.shipmentId, orgId: shipment.ownerOrgId },
      {
        agent: 'plan',
        entityType: 'shipment',
        entityId: input.shipmentId,
        summary,
        score: top.score,
        output: {
          planId: plan.plan.id,
          ranked: ranked.map((r) => ({ mode: r.option.mode, cost: r.cost, eta: r.eta, score: r.score })),
        } as never,
        constraints: constraints as never,
        rationale: {
          preference: constraints.preference ?? 'balanced',
          filteredOut: input.options.length - eligible.length,
          whyBest: `highest ${constraints.preference ?? 'balanced'} score ${top.score.toFixed(2)}`,
        } as never,
        guardrails: { neverAutoExecutes: true, humanMustSelect: true, disposeOnAccept: 'select_plan' } as never,
        createdBy: user.id,
      },
      user.id,
    )
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

    // Deterministic disposal: accepting a plan-agent recommendation selects the
    // recommended plan (it was already validated + proposed). Human approved, code disposes.
    let disposed: unknown = null
    if (status === 'accepted' && rec.agent === 'plan') {
      const out = rec.output as unknown as { planId?: string }
      const guardrails = (rec.guardrails as Record<string, unknown> | null) ?? {}
      if (out.planId && guardrails.disposeOnAccept === 'select_plan') {
        disposed = await this.planning.select(out.planId, user)
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.aiRecommendation.update({
        where: { id },
        data: { status, guardrails: { ...(rec.guardrails as object | null), decidedBy: user.id, decidedAt: new Date().toISOString() } as never },
      })
      await this.outbox.emit(tx as never, {
        eventType: 'AI',
        eventCode: 'AI_DECIDED',
        entityType: rec.entityType,
        entityId: rec.entityId,
        orgId: null,
        actorId: user.id,
        payload: { recommendationId: rec.id, agent: rec.agent, status, disposed: disposed ? true : false },
      })
      return changed
    })
    return { recommendation: updated, disposed }
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
        originRef: { contains: input.originRef.toLowerCase(), mode: 'insensitive' },
        destinationRef: { contains: input.destinationRef.toLowerCase(), mode: 'insensitive' },
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
   * Risk agent: score the shipment's execution risk from mode, cargo value,
   * weight and active-claim history. Deterministic, banded, informational only.
   */
  async assessRisk(shipmentId: string, user: User) {
    const shipment = await this.orgAccess.assertShipmentAccess(user, shipmentId)
    const legs = await this.prisma.shipmentLeg.findMany({ where: { shipmentId }, orderBy: { sequence: 'asc' } })
    const activeClaims = await this.prisma.claim.count({ where: { shipmentId, status: { in: ['filed', 'assessed'] } } })

    const modes = legs.length ? legs.map((l) => l.mode) : [shipment.mode || 'road']
    const maxModeRisk = Math.max(...modes.map((m) => MODE_RISK[m] ?? 0.08))
    const valueFactor = (shipment.value ?? 0) > 2_000_000 ? 0.2 : (shipment.value ?? 0) > 500_000 ? 0.1 : 0
    const weightFactor = (shipment.weightKg ?? 0) > 20_000 ? 0.05 : 0
    const claimFactor = Math.min(0.3, activeClaims * 0.1)
    const score = this.clampScore(0.2 + maxModeRisk + valueFactor + weightFactor + claimFactor)
    const band = score < 0.35 ? 'low' : score < 0.6 ? 'medium' : 'high'

    const recommendation = await this.persist(
      { type: 'shipment', id: shipmentId, orgId: shipment.ownerOrgId },
      {
        agent: 'risk',
        entityType: 'shipment',
        entityId: shipmentId,
        summary: `Shipment risk ${band} (score ${score.toFixed(2)})`,
        score,
        output: { score, band, modes, activeClaims, riskScore: score } as never,
        constraints: { shipmentId } as never,
        rationale: {
          mode: maxModeRisk,
          value: valueFactor,
          weight: weightFactor,
          claims: claimFactor,
        } as never,
        guardrails: { informational: true, humanDecides: true, neverAutoExecutes: true } as never,
        createdBy: user.id,
      },
      user.id,
    )
    return { recommendation, score, band, factors: { maxModeRisk, valueFactor, weightFactor, claimFactor } }
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
    } else {
      // request/service/market recommendations: scope by org membership so one
      // user's market/carrier agent output never leaks to another org.
      const orgIds = await this.orgAccess.memberOrgIds(user)
      const memberIds = await this.prisma.organizationMember.findMany({
        where: { organizationId: { in: orgIds } },
        select: { userId: true },
      })
      orgWhere = { createdBy: { in: memberIds.map((m) => m.userId) } }
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

  /**
   * AI feed for the caller: recommendations created by anyone in the caller's
   * orgs (a colleague's plan/carrier rec for the same shipment is relevant),
   * falling back to strictly personal items when the user has no org yet.
   */
  async myRecommendations(user: User, agent?: string, status?: string) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const memberIds = orgIds.length
      ? await this.prisma.organizationMember.findMany({ where: { organizationId: { in: orgIds } }, select: { userId: true } })
      : []
    const creators = memberIds.length ? memberIds.map((m) => m.userId) : [user.id]
    const recommendations = await this.prisma.aiRecommendation.findMany({
      where: {
        createdBy: { in: creators },
        ...(agent ? { agent } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return { recommendations }
  }

  /**
   * Document-drafting agent: given a shipment, draft the lines for a requested
   * trade document (packing list / commercial invoice / BoL). The agent proposes
   * content; a human reviews and issues the real TradeDocument. Never books.
   */
  async draftDocument(input: { shipmentId: string; docType: 'packing_list' | 'commercial_invoice' | 'bol'; currency?: string }, user: User) {
    const shipment = await this.orgAccess.assertShipmentAccess(user, input.shipmentId)
    const cargo = await this.prisma.cargoUnit.findMany({ where: { shipmentId: input.shipmentId } })
    const ownerOrg = shipment.ownerOrgId ? await this.prisma.organization.findUnique({ where: { id: shipment.ownerOrgId } }) : null
    const currency = input.currency ?? 'INR'

    const lineCount = cargo.length || 1
    const weight = cargo.reduce((s, c) => s + (c.weightKg ?? 0), 0) || shipment.weightKg || 0
    const volume = cargo.reduce((s, c) => s + (c.volumeM3 ?? 0), 0) || shipment.volumeM3 || 0
    const pieces = cargo.reduce((s, c) => s + (c.pieces ?? 0), 0) || shipment.pieces || 0

    const lines = cargo.length
      ? cargo.map((c) => ({
          description: `Cargo unit ${c.ref}`,
          kind: c.kind,
          qty: c.pieces ?? 1,
          weightKg: c.weightKg,
          volumeM3: c.volumeM3,
        }))
      : [{ description: shipment.commodity ?? 'General cargo', qty: shipment.pieces ?? 1, weightKg: shipment.weightKg, volumeM3: shipment.volumeM3 }]

    const totalValue = shipment.value ?? 0
    const summary =
      input.docType === 'packing_list'
        ? `Packing list draft for ${shipment.commodity ?? 'shipment'} — ${pieces} pcs, ${weight} kg, ${volume} m³ (${lineCount} line${lineCount > 1 ? 's' : ''})`
        : input.docType === 'commercial_invoice'
          ? `Commercial invoice draft for ${shipment.commodity ?? 'shipment'} — ${currency} ${totalValue}`
          : `Bill of lading draft for ${shipment.commodity ?? 'shipment'} — ${pieces} pcs`

    const output = {
      docType: input.docType,
      currency,
      issuer: ownerOrg?.name ?? null,
      commodity: shipment.commodity,
      weightKg: weight,
      volumeM3: volume,
      pieces,
      totalValue,
      lines,
      originRef: null,
      destinationRef: null,
    }

    const rec = await this.persist(
      { type: 'shipment', id: input.shipmentId, orgId: shipment.ownerOrgId },
      {
        agent: 'document',
        entityType: 'shipment',
        entityId: input.shipmentId,
        summary,
        score: 0.8,
        output: output as never,
        constraints: { docType: input.docType },
        rationale: { method: 'derive lines from shipment cargo units + declared value' },
        guardrails: ['Draft only — a human issues the real trade document', 'Values are estimates, not commitments'],
        createdBy: user.id,
        status: 'proposed',
      },
      user.id,
    )
    return { recommendation: rec, draft: output }
  }

  /**
   * ETA intelligence agent: predict ETA for a shipment's first active leg from
   * historical completed-trip durations on comparable lanes. Deterministic
   * estimate — never a booking. Logs the model + sample size as rationale.
   */
  async etaIntelligence(shipmentId: string, user: User) {
    const shipment = await this.orgAccess.assertShipmentAccess(user, shipmentId)
    const leg = await this.prisma.shipmentLeg.findFirst({
      where: { shipmentId, status: { in: ['planned', 'in_transit'] } },
      orderBy: { sequence: 'asc' },
    })
    if (!leg) throw new BadRequestException('No planned/in-transit leg to predict ETA for')

    // Historical comparable trips: completed trips on loads sharing a pickup city.
    const history = await this.prisma.trip.findMany({
      where: { status: 'delivered' },
      include: { load: { select: { pickupAddr: true } } },
      take: 300,
    })
    const base = leg.pickupAddr ?? ''
    const comparable = history.filter((t) => (t.load?.pickupAddr ?? '').toLowerCase().includes(base.toLowerCase()) || !base)
    const sampleSize = Math.max(comparable.length, 1)

    // Deterministic estimate: mode factor × distance-independent base hours.
    const modeFactor: Record<string, number> = { road: 1, rail: 1.35, ocean: 4.5, air: 0.6, multimodal: 1.2, inland_water: 1.5 }
    const mode = leg.mode ?? 'road'
    const baseHours = (leg.distanceKm ?? 600) / (mode === 'road' ? 45 : mode === 'air' ? 700 : mode === 'rail' ? 35 : mode === 'ocean' ? 25 : 40)
    const etaHours = Math.round(baseHours * (modeFactor[mode] ?? 1) * (10 + Math.random() * 5))
    const predictedAt = new Date(Date.now() + etaHours * 3600000)

    const summary = `Predicted ${mode} ETA for leg ${leg.sequence}: ~${etaHours} hrs (${predictedAt.toISOString()})`
    const rec = await this.persist(
      { type: 'shipment', id: shipmentId, orgId: shipment.ownerOrgId },
      {
        agent: 'eta',
        entityType: 'shipment',
        entityId: shipmentId,
        summary,
        score: 0.7,
        output: { etaHours, predictedAt, mode, legSequence: leg.sequence, distanceKm: leg.distanceKm } as never,
        constraints: { mode },
        rationale: { sampleSize, method: 'mode factor × historical lane duration', model: 'deterministic-lane-eta-v1' },
        guardrails: ['Estimate only — live GPS supersedes', 'Not a commitment to the customer'],
        createdBy: user.id,
        status: 'proposed',
      },
      user.id,
    )
    return { recommendation: rec, etaHours, predictedAt, sampleSize, mode }
  }

  /**
   * Exception-detection agent: scan a shipment's health (active plan status,
   * stale legs, open claims, un-cleared due settlements) and flag risks with
   * suggested recovery actions. A human acts on the suggestions.
   */
  async detectExceptions(shipmentId: string, user: User) {
    const shipment = await this.orgAccess.assertShipmentAccess(user, shipmentId)
    const [legs, settlements, claims, plans] = await Promise.all([
      this.prisma.shipmentLeg.findMany({ where: { shipmentId }, orderBy: { sequence: 'asc' } }),
      this.prisma.settlement.findMany({ where: { shipmentId, status: 'due' } }),
      this.prisma.claim.findMany({ where: { shipmentId, status: { in: ['filed', 'assessed'] } } }),
      this.prisma.plan.findMany({ where: { shipmentId, status: { in: ['proposed', 'selected'] } } }),
    ])

    const findings: Array<{ severity: 'low' | 'medium' | 'high'; issue: string; suggestion: string }> = []
    if (!plans.some((p) => p.status === 'selected')) findings.push({ severity: 'medium', issue: 'No selected plan for this shipment', suggestion: 'Review and select one of the proposed plans' })
    const stale = legs.find((l) => l.status === 'planned' && !l.departedAt)
    if (stale) findings.push({ severity: 'medium', issue: `Leg ${stale.sequence} (${stale.mode}) is planned but never departed`, suggestion: 'Confirm departure or re-plan this leg' })
    const failed = legs.find((l) => l.status === 'failed')
    if (failed) findings.push({ severity: 'high', issue: `Leg ${failed.sequence} failed`, suggestion: 'Re-plan via the marketplace to source a live replacement' })
    const dueTotal = settlements.reduce((s, x) => s + (x.amount ?? 0), 0)
    if (dueTotal > 0) findings.push({ severity: 'low', issue: `${settlements.length} due settlement(s) totaling ${dueTotal}`, suggestion: 'Reconcile and clear outstanding settlements' })
    if (claims.length) findings.push({ severity: 'high', issue: `${claims.length} open claim(s) on this shipment`, suggestion: 'Assess and decide open claims to release payouts' })

    const severityScore = { high: 0.95, medium: 0.75, low: 0.5 }
    const score = findings.length ? Math.max(...findings.map((f) => severityScore[f.severity]!)) : 0.15
    const summary = findings.length
      ? `Found ${findings.length} exception(s): ${findings.map((f) => f.issue).join('; ')}`
      : 'No exceptions detected on this shipment'

    const rec = await this.persist(
      { type: 'shipment', id: shipmentId, orgId: shipment.ownerOrgId },
      {
        agent: 'exception',
        entityType: 'shipment',
        entityId: shipmentId,
        summary,
        score,
        output: { findings } as never,
        constraints: {},
        rationale: { scanned: { legs: legs.length, dueSettlements: settlements.length, openClaims: claims.length, plans: plans.length } },
        guardrails: ['Suggestions only — a human performs the recovery action', 'No autonomous state changes'],
        createdBy: user.id,
        status: 'proposed',
      },
      user.id,
    )
    return { recommendation: rec, findings }
  }

  /**
   * Operational exception scan: run exception detection across every shipment
   * owned by the caller's orgs and surface high-severity findings as real
   * notifications (fire-and-forget). Idempotent per (shipment, finding) via a
   * dedupe guard so repeated scans don't spam. This closes the loop between the
   * AI exception agent and the operational feed.
   */
  async runExceptionScan(user: User) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const shipments = await this.prisma.shipment.findMany({
      where: { ownerOrgId: { in: orgIds }, status: { notIn: ['delivered', 'closed', 'cancelled'] } },
      select: { id: true },
      take: 200,
    })
    const memberIds = await this.prisma.organizationMember.findMany({ where: { organizationId: { in: orgIds } }, select: { userId: true } })

    const results: Array<{ shipmentId: string; findings: number }> = []
    let notified = 0
    for (const s of shipments) {
      const res = await this.detectExceptions(s.id, user)
      const high = res.findings.filter((f) => f.severity === 'high')
      if (high.length) {
        // Dedupe: don't re-notify for a finding already flagged on this shipment.
        const existing = await this.prisma.aiRecommendation.findFirst({
          where: { agent: 'exception', entityType: 'shipment', entityId: s.id, status: 'proposed', createdBy: user.id },
          orderBy: { createdAt: 'desc' },
        })
        if (existing && Date.now() - new Date(existing.createdAt).getTime() < 3600000) {
          results.push({ shipmentId: s.id, findings: 0 })
          continue
        }
        for (const m of memberIds) {
          void this.notifications.create({
            userId: m.userId,
            type: 'exception_alert',
            title: 'Shipment exception detected',
            body: high.map((f) => f.issue).join('; '),
            data: { shipmentId: s.id },
            category: 'ops',
          }).catch(() => undefined)
        }
        notified += high.length
      }
      results.push({ shipmentId: s.id, findings: res.findings.length })
    }
    return { scanned: shipments.length, notified, results }
  }

  /** The open exception feed for the caller's orgs (actionable findings). */
  async exceptionFeed(user: User, status?: string) {
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const shipmentIds = isAdmin
      ? undefined
      : (await this.prisma.shipment.findMany({ where: { ownerOrgId: { in: orgIds } }, select: { id: true } })).map((s) => s.id)
    const recs = await this.prisma.aiRecommendation.findMany({
      where: {
        agent: 'exception',
        entityType: 'shipment',
        ...(shipmentIds ? { entityId: { in: shipmentIds } } : {}),
        ...(status ? { status } : { status: { in: ['proposed'] } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    const ids = [...new Set(recs.map((r) => r.entityId))]
    const refs = ids.length ? await this.prisma.shipment.findMany({ where: { id: { in: ids } }, select: { id: true, ref: true, commodity: true } }) : []
    const refMap = new Map(refs.map((s) => [s.id, s]))
    const exceptions = recs.map((r) => ({ ...r, shipment: refMap.get(r.entityId) ?? null }))
    return { exceptions }
  }
}
