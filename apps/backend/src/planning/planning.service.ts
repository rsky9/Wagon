import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OutboxRelay } from '../outbox/outbox-relay.service'
import type { User } from '@prisma/client'

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
    @Inject(OutboxRelay) private readonly outbox: OutboxRelay,
  ) {}

  /** Propose a new plan for a shipment (alternative or initial). */
  async propose(input: PlanInput, user: User) {
    if (!input.legs?.length) throw new BadRequestException('Plan needs at least one leg')
    const shipment = await this.prisma.shipment.findUnique({ where: { id: input.shipmentId } })
    if (!shipment) throw new NotFoundException('Shipment not found')

    const cost = input.cost ?? input.legs.reduce((s, l) => s + (l.cost ?? 0), 0)
    const etaHours = input.etaHours ?? input.legs.reduce((s, l) => s + (l.etaHours ?? 0), 0)
    const plan = await this.prisma.plan.create({
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
    await this.outbox.emit(await this.tx(), {
      eventType: 'SHIPMENT',
      eventCode: 'PLAN_PROPOSED',
      entityType: 'shipment',
      entityId: input.shipmentId,
      shipmentId: input.shipmentId,
      actorId: user.id,
      payload: { planRef: plan.ref, cost, etaHours, legCount: input.legs.length },
    })
    return { plan }
  }

  /** Select a plan — the orderer's choice; supersedes any previously selected plan. */
  async select(planId: string, user: User) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } })
    if (!plan) throw new NotFoundException('Plan not found')

    const tx = await this.prisma.$transaction(async (p) => {
      await p.plan.updateMany({
        where: { shipmentId: plan.shipmentId, status: 'selected' },
        data: { status: 'superseded' },
      })
      const updated = await p.plan.update({
        where: { id: planId },
        data: { status: 'selected', selectedBy: user.id, selectedAt: new Date() },
      })
      await p.shipment.update({
        where: { id: plan.shipmentId },
        data: { activePlanId: plan.id, status: 'planned', mode: (plan.legs as { mode: string }[])[0]?.mode ?? 'multimodal' },
      })
      return updated
    })
    await this.outbox.emit(await this.tx(), {
      eventType: 'SHIPMENT',
      eventCode: 'PLAN_SELECTED',
      entityType: 'shipment',
      entityId: plan.shipmentId,
      shipmentId: plan.shipmentId,
      actorId: user.id,
      payload: { planRef: plan.ref, cost: plan.cost, etaHours: plan.etaHours },
    })
    return { plan: tx }
  }

  /** Re-plan after a leg fails: create a new plan with the failed leg replaced. */
  async rePlan(planId: string, failedLegIndex: number, replacement: PlanLeg, user: User) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } })
    if (!plan) throw new NotFoundException('Plan not found')

    const legs = plan.legs as unknown as PlanLeg[]
    if (failedLegIndex < 0 || failedLegIndex >= legs.length) throw new BadRequestException('Bad failedLegIndex')
    const rerouted = [...legs]
    rerouted[failedLegIndex] = { ...replacement }

    const cost = rerouted.reduce((s, l) => s + (l.cost ?? 0), 0)
    const etaHours = rerouted.reduce((s, l) => s + (l.etaHours ?? 0), 0)
    const newPlan = await this.prisma.plan.create({
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
    await this.prisma.plan.update({ where: { id: planId }, data: { failedLegIndex } })
    await this.outbox.emit(await this.tx(), {
      eventType: 'EXCEPTION',
      eventCode: 'REPLANNED',
      entityType: 'shipment',
      entityId: plan.shipmentId,
      shipmentId: plan.shipmentId,
      actorId: user.id,
      payload: { fromPlan: plan.ref, toPlan: newPlan.ref, failedLegIndex },
    })
    return { plan: newPlan, reroutedLeg: rerouted[failedLegIndex] }
  }

  async list(shipmentId: string) {
    const plans = await this.prisma.plan.findMany({
      where: { shipmentId },
      orderBy: { createdAt: 'desc' },
    })
    return { plans }
  }

  private async tx() {
    const prisma = this.prisma
    return {
      logisticsEvent: {
        create: (args: { data: Record<string, unknown> }) => prisma.logisticsEvent.create({ data: args.data as never }),
      },
      outboxMessage: {
        create: (args: { data: Record<string, unknown> }) => prisma.outboxMessage.create({ data: args.data as never }),
      },
    }
  }
}
