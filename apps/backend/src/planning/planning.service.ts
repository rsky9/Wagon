import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Inject } from '@nestjs/common'
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

    const tx = await this.prisma.$transaction(async (p) => {
      await p.plan.updateMany({
        where: { shipmentId: plan.shipmentId, status: 'selected' },
        data: { status: 'superseded' },
      })
      const updated = await p.plan.update({
        where: { id: planId },
        data: { status: 'selected', selectedBy: user.id, selectedAt: new Date() },
      })
      // Do not regress a shipment that is already booked/in_transit.
      const keepStatus = shipment.status === 'draft' || shipment.status === 'planned' ? 'planned' : shipment.status
      await p.shipment.update({
        where: { id: plan.shipmentId },
        data: { activePlanId: plan.id, status: keepStatus, mode: (plan.legs as { mode: string }[])[0]?.mode ?? 'multimodal' },
      })
      await this.outbox.emit(p as never, {
        eventType: 'SHIPMENT',
        eventCode: 'PLAN_SELECTED',
        entityType: 'shipment',
        entityId: plan.shipmentId,
        orgId: shipment.ownerOrgId ?? null,
        shipmentId: plan.shipmentId,
        actorId: user.id,
        payload: { planRef: plan.ref, cost: plan.cost, etaHours: plan.etaHours },
      })
      return updated
    })
    return { plan: tx }
  }

  /** Decline a plan (also unselects it if it was selected). */
  async decline(planId: string, user: User) {
    const { plan, shipment } = await this.requirePlanAccess(user, planId)
    if (plan.status === 'declined') throw new BadRequestException('Plan already declined')
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.plan.update({ where: { id: planId }, data: { status: 'declined' } })
      if (plan.status === 'selected') {
        await tx.shipment.update({
          where: { id: plan.shipmentId },
          data: { activePlanId: null },
        })
      }
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
}
