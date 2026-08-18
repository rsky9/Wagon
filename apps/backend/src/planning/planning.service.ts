import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OutboxRelay } from '../outbox/outbox-relay.service'
import { OrgAccessService } from '../org-access/org-access.service'
import type { User } from '@prisma/client'

const VALID_MODES = ['road', 'rail', 'ocean', 'air', 'inland_water', 'multimodal']
const MAX_LEGS = 20

export interface PlanLeg {
  mode: string
  equipment?: string
  carrier?: string
  providerId?: string
  origin?: string
  destination?: string
  cost?: number
  etaHours?: number
  departure?: string
}

export interface PlanInput {
  shipmentId: string
  source?: string
  legs: PlanLeg[]
  currency?: string
  cost?: number
  etaHours?: number
  riskScore?: number
}

@Injectable()
export class PlanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAccess: OrgAccessService,
    @Inject(OutboxRelay) private readonly outbox: OutboxRelay,
  ) {}

  /** Validate leg shape + contiguity (leg[i].destination === leg[i+1].origin). */
  private validateLegs(legs: PlanLeg[]) {
    if (!legs.length) throw new BadRequestException('Plan needs at least one leg')
    if (legs.length > MAX_LEGS) throw new BadRequestException(`Plan cannot have more than ${MAX_LEGS} legs`)
    for (const leg of legs) {
      if (!leg.mode || !VALID_MODES.includes(leg.mode)) throw new BadRequestException(`Invalid mode: ${leg.mode}`)
      if (!leg.origin && !leg.destination) throw new BadRequestException('Each leg needs origin or destination')
      if (leg.cost != null && leg.cost < 0) throw new BadRequestException('Leg cost cannot be negative')
      if (leg.etaHours != null && leg.etaHours < 0) throw new BadRequestException('Leg eta cannot be negative')
    }
    for (let i = 0; i < legs.length - 1; i++) {
      const from = legs[i]!.destination
      const to = legs[i + 1]!.origin
      if (from && to && from !== to) {
        throw new BadRequestException(`Discontiguous legs: leg ${i + 1} ends at "${from}" but leg ${i + 2} starts at "${to}"`)
      }
    }
  }

  private validateTotals(legs: PlanLeg[], cost?: number, etaHours?: number) {
    if (cost != null && cost < 0) throw new BadRequestException('cost cannot be negative')
    if (etaHours != null && etaHours < 0) throw new BadRequestException('etaHours cannot be negative')
    // If totals are supplied, they must be consistent with the legs.
    if (cost != null) {
      const sum = legs.reduce((s, l) => s + (l.cost ?? 0), 0)
      if (sum > 0 && Math.abs(cost - sum) > 0.01) throw new BadRequestException('cost must equal the sum of leg costs')
    }
    if (etaHours != null) {
      const sum = legs.reduce((s, l) => s + (l.etaHours ?? 0), 0)
      if (sum > 0 && Math.abs(etaHours - sum) > 0.01) throw new BadRequestException('etaHours must equal the sum of leg etas')
    }
  }

  private async requirePlanAccess(user: User, planId: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } })
    if (!plan) throw new NotFoundException('Plan not found')
    const shipment = await this.prisma.shipment.findUnique({ where: { id: plan.shipmentId } })
    if (!shipment) throw new NotFoundException('Shipment not found')
    if (shipment.ownerOrgId) await this.orgAccess.assertMember(user, shipment.ownerOrgId)
    return { plan, shipment }
  }

  /** Propose a new plan for a shipment (alternative or initial). */
  async propose(input: PlanInput, user: User) {
    await this.orgAccess.assertShipmentAccess(user, input.shipmentId)
    this.validateLegs(input.legs)
    this.validateTotals(input.legs, input.cost, input.etaHours)
    const shipment = await this.prisma.shipment.findUnique({ where: { id: input.shipmentId } })
    if (!shipment) throw new NotFoundException('Shipment not found')

    const cost = input.cost ?? input.legs.reduce((s, l) => s + (l.cost ?? 0), 0)
    const etaHours = input.etaHours ?? input.legs.reduce((s, l) => s + (l.etaHours ?? 0), 0)
    const plan = await this.prisma.$transaction(async (tx) => {
      const created = await tx.plan.create({
        data: {
          shipmentId: input.shipmentId,
          ref: `PLN-${Date.now().toString(36).toUpperCase()}`,
          source: input.source ?? 'manual',
          legs: input.legs as never,
          cost,
          currency: input.currency ?? 'INR',
          etaHours,
          riskScore: input.riskScore ?? 0,
          status: 'proposed',
        },
      })
      await this.outbox.emit(tx as never, {
        eventType: 'SHIPMENT',
        eventCode: 'PLAN_PROPOSED',
        entityType: 'shipment',
        entityId: input.shipmentId,
        orgId: shipment.ownerOrgId ?? null,
        shipmentId: input.shipmentId,
        actorId: user.id,
        payload: { planRef: created.ref, cost, etaHours, legCount: input.legs.length },
      })
      return created
    })
    return { plan }
  }

  /** Select a plan — only a 'proposed' plan can be selected; supersedes prior. */
  async select(planId: string, user: User) {
    const { plan, shipment } = await this.requirePlanAccess(user, planId)
    if (plan.status !== 'proposed') throw new BadRequestException(`Only proposed plans can be selected (current: ${plan.status})`)

    const planLegs = plan.legs as unknown as PlanLeg[]
    this.validateLegs(planLegs)

    const tx = await this.prisma.$transaction(async (p) => {
      // Atomic claim: only a 'proposed' plan may be selected. Two concurrent
      // selects cannot both win — the second sees count === 0 and fails.
      const claimed = await p.plan.updateMany({
        where: { id: planId, status: 'proposed' },
        data: { status: 'selected', selectedBy: user.id, selectedAt: new Date() },
      })
      if (claimed.count === 0) {
        throw new BadRequestException('This plan was already selected by someone else')
      }
      await p.plan.updateMany({
        where: { shipmentId: plan.shipmentId, status: 'selected', id: { not: planId } },
        data: { status: 'superseded' },
      })
      const updated = await p.plan.findUniqueOrThrow({ where: { id: planId } })
      // Do not regress a shipment that is already booked/in_transit.
      const keepStatus = shipment.status === 'draft' || shipment.status === 'planned' ? 'planned' : shipment.status
      await p.shipment.update({
        where: { id: plan.shipmentId },
        data: { activePlanId: plan.id, status: keepStatus, mode: planLegs[0]?.mode ?? 'multimodal' },
      })
      // Materialize the selected plan's legs as ShipmentLeg rows so the plan
      // becomes executable operations (modes, route, cost, ETA). Clear prior
      // planned AND failed legs (a failed leg is replaced by the new plan).
      await p.shipmentLeg.deleteMany({ where: { shipmentId: plan.shipmentId, status: { in: ['planned', 'failed'] } } })
      for (let i = 0; i < planLegs.length; i++) {
        const leg = planLegs[i]!
        await p.shipmentLeg.create({
          data: {
            shipmentId: plan.shipmentId,
            sequence: i + 1,
            mode: leg.mode,
            pickupAddr: leg.origin,
            dropAddr: leg.destination,
            distanceKm: null,
            equipment: leg.equipment,
            providerId: leg.providerId,
            status: 'planned',
          },
        })
      }
      await this.outbox.emit(p as never, {
        eventType: 'SHIPMENT',
        eventCode: 'PLAN_SELECTED',
        entityType: 'shipment',
        entityId: plan.shipmentId,
        orgId: shipment.ownerOrgId ?? null,
        shipmentId: plan.shipmentId,
        actorId: user.id,
        payload: { planRef: plan.ref, cost: plan.cost, etaHours: plan.etaHours, legCount: planLegs.length },
      })
      return updated
    })
    return { plan: tx }
  }

  /** Decline a plan (also unselects it if it was the active one). */
  async decline(planId: string, user: User) {
    const { plan, shipment } = await this.requirePlanAccess(user, planId)
    const updated = await this.prisma.$transaction(async (tx) => {
      // Atomic: only a proposed/selected plan may be declined (a concurrent
      // select can't then flip it behind us).
      const claimed = await tx.plan.updateMany({
        where: { id: planId, status: { in: ['proposed', 'selected'] } },
        data: { status: 'declined' },
      })
      if (claimed.count === 0) {
        throw new BadRequestException('Plan already declined or not in a declineable state')
      }
      // Clear the shipment's active plan if this WAS it (stale selected status
      // must not leave activePlanId pointing at a declined plan).
      const active = await tx.shipment.findUnique({ where: { id: plan.shipmentId }, select: { activePlanId: true } })
      if (active?.activePlanId === planId) {
        await tx.shipment.update({ where: { id: plan.shipmentId }, data: { activePlanId: null } })
      }
      const changed = await tx.plan.findUniqueOrThrow({ where: { id: planId } })
      await this.outbox.emit(tx as never, {
        eventType: 'SHIPMENT',
        eventCode: 'PLAN_DECLINED',
        entityType: 'shipment',
        entityId: plan.shipmentId,
        orgId: shipment.ownerOrgId ?? null,
        shipmentId: plan.shipmentId,
        actorId: user.id,
        payload: { planRef: plan.ref },
      })
      return changed
    })
    return { plan: updated }
  }

  /** Re-plan after a leg fails: create a new plan with the failed leg replaced. */
  async rePlan(planId: string, failedLegIndex: number, replacement: PlanLeg, user: User) {
    const { plan, shipment } = await this.requirePlanAccess(user, planId)
    if (plan.status !== 'selected' && plan.status !== 'proposed') {
      throw new BadRequestException('Only proposed/selected plans can be re-planned')
    }

    const legs = plan.legs as unknown as PlanLeg[]
    if (failedLegIndex < 0 || failedLegIndex >= legs.length) throw new BadRequestException('Bad failedLegIndex')
    const rerouted = [...legs]
    rerouted[failedLegIndex] = { ...replacement }
    this.validateLegs(rerouted)

    const cost = rerouted.reduce((s, l) => s + (l.cost ?? 0), 0)
    const etaHours = rerouted.reduce((s, l) => s + (l.etaHours ?? 0), 0)
    const newPlan = await this.prisma.$transaction(async (tx) => {
      const created = await tx.plan.create({
        data: {
          shipmentId: plan.shipmentId,
          ref: `PLN-${Date.now().toString(36).toUpperCase()}`,
          source: 're_plan',
          legs: rerouted as never,
          cost,
          currency: plan.currency,
          etaHours,
          riskScore: Math.min(1, (plan.riskScore ?? 0) + 0.1),
          status: 'proposed',
        },
      })
      await tx.plan.update({ where: { id: planId }, data: { failedLegIndex } })
      await this.outbox.emit(tx as never, {
        eventType: 'EXCEPTION',
        eventCode: 'REPLANNED',
        entityType: 'shipment',
        entityId: plan.shipmentId,
        orgId: shipment.ownerOrgId ?? null,
        shipmentId: plan.shipmentId,
        actorId: user.id,
        payload: { fromPlan: plan.ref, toPlan: created.ref, failedLegIndex },
      })
      return created
    })
    return { plan: newPlan, reroutedLeg: rerouted[failedLegIndex] }
  }

  /**
   * Auto re-plan when a physical leg fails: find the shipment's selected plan,
   * map the failed leg's route to a plan leg, and emit a re_plan with a
   * replacement. When a marketReplacement is supplied (sourced live from the
   * marketplace) it is used; otherwise a static mode fallback applies. Keeps
   * the original plan selected — the orderer still chooses.
   */
  async autoRePlanOnLegFailure(
    shipmentId: string,
    failedLegId: string,
    reason: string,
    user: User,
    marketReplacement?: PlanLeg & { marketListingId?: string },
  ) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { activePlan: true, legs: { orderBy: { sequence: 'asc' } } },
    })
    if (!shipment) throw new NotFoundException('Shipment not found')
    const selected = shipment.activePlan
    if (!selected || selected.status !== 'selected') return { plan: null, note: 'No selected plan to re-plan' }
    if (selected.failedLegIndex != null) return { plan: null, note: 'Plan already re-planned' }

    const failed = shipment.legs.find((l) => l.id === failedLegId)
    if (!failed) throw new NotFoundException('Failed leg not found on shipment')
    // Map the physical leg (by its route) onto the plan's leg array.
    const planLegs = selected.legs as unknown as PlanLeg[]
    const index = planLegs.findIndex(
      (l) =>
        (l.origin ?? '').toLowerCase() === (failed.pickupAddr ?? '').toLowerCase() &&
        (l.destination ?? '').toLowerCase() === (failed.dropAddr ?? '').toLowerCase(),
    )
    if (index < 0) return { plan: null, note: 'Failed leg not found in selected plan' }

    const failedLeg = planLegs[index]!
    // Prefer the live market replacement (real provider, real price).
    let replacement: PlanLeg
    if (marketReplacement) {
      replacement = {
        mode: marketReplacement.mode ?? failedLeg.mode,
        origin: marketReplacement.origin ?? failedLeg.origin,
        destination: marketReplacement.destination ?? failedLeg.destination,
        equipment: marketReplacement.equipment,
        providerId: marketReplacement.providerId,
        carrier: marketReplacement.carrier ?? `re-planned via market after ${reason}`,
        cost: marketReplacement.cost ?? failedLeg.cost,
        etaHours: marketReplacement.etaHours ?? failedLeg.etaHours,
      }
    } else {
      replacement = {
        ...failedLeg,
        mode: failedLeg.mode === 'road' ? 'rail' : 'road',
        cost: (failedLeg.cost ?? 0) > 0 ? Math.round((failedLeg.cost ?? 0) * 1.15) : undefined,
        etaHours: (failedLeg.etaHours ?? 0) > 0 ? Math.round(((failedLeg.etaHours ?? 0) * 1.2) * 10) / 10 : undefined,
        carrier: `fallback after ${reason}`,
      }
    }
    const result = await this.rePlan(selected.id, index, replacement, user)
    return { ...result, sourcedFromMarket: Boolean(marketReplacement), failedLegIndex: index }
  }

  async detail(planId: string, user: User) {
    const { plan } = await this.requirePlanAccess(user, planId)
    const detail = await this.prisma.plan.findUnique({ where: { id: plan.id }, include: { shipment: true } })
    return { plan: detail }
  }

  async list(shipmentId: string, user: User) {
    await this.orgAccess.assertShipmentAccess(user, shipmentId)
    const plans = await this.prisma.plan.findMany({
      where: { shipmentId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return { plans }
  }

  /** List all plans across the caller's orgs' shipments (mobile hub). */
  async listAll(user: User) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const shipments = await this.prisma.shipment.findMany({
      where: { ownerOrgId: { in: orgIds } },
      select: { id: true },
    })
    const plans = await this.prisma.plan.findMany({
      where: { shipmentId: { in: shipments.map((s) => s.id) } },
      include: { shipment: { select: { id: true, ref: true, commodity: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { plans }
  }
}
