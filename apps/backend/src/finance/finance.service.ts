import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OutboxRelay } from '../outbox/outbox-relay.service'
import type { User } from '@prisma/client'

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OutboxRelay) private readonly outbox: OutboxRelay,
  ) {}

  /** The user's first organization. */
  private async orgOf(user: User) {
    const member = await this.prisma.organizationMember.findFirst({
      where: { userId: user.id },
      include: { organization: true },
    })
    if (!member) throw new BadRequestException('User belongs to no organization')
    return member.organization
  }

  // ---------- Claims ----------

  async fileClaim(input: { shipmentId: string; reason: string; amount?: number; currency?: string; notes?: string }, user: User) {
    if (!['loss', 'damage', 'delay', 'other'].includes(input.reason)) throw new BadRequestException('Invalid claim reason')
    const org = await this.orgOf(user)
    const claim = await this.prisma.claim.create({
      data: {
        shipmentId: input.shipmentId,
        claimantId: org.id,
        reason: input.reason,
        amount: input.amount,
        currency: input.currency ?? 'INR',
        notes: input.notes,
        status: 'filed',
      },
    })
    await this.outbox.emit(await this.tx(), {
      eventType: 'FINANCE',
      eventCode: 'CLAIM_FILED',
      entityType: 'shipment',
      entityId: input.shipmentId,
      shipmentId: input.shipmentId,
      actorId: user.id,
      payload: { claimId: claim.id, reason: input.reason, amount: input.amount },
    })
    return { claim }
  }

  async decideClaim(claimId: string, decision: 'approved' | 'rejected', notes: string | undefined, user: User) {
    if (!['approved', 'rejected'].includes(decision)) throw new BadRequestException('Decision must be approved or rejected')
    const org = await this.orgOf(user)
    const claim = await this.prisma.claim.update({
      where: { id: claimId },
      data: { status: decision, decision, decidedBy: org.id, decidedAt: new Date(), notes: notes ?? null },
    })
    await this.outbox.emit(await this.tx(), {
      eventType: 'FINANCE',
      eventCode: 'CLAIM_DECISION',
      entityType: 'shipment',
      entityId: claim.shipmentId,
      shipmentId: claim.shipmentId,
      actorId: user.id,
      payload: { claimId, decision },
    })
    return { claim }
  }

  // ---------- Insurance ----------

  async issuePolicy(input: { shipmentId: string; policyRef: string; premium?: number; coverage?: number; currency?: string }, user: User) {
    const org = await this.orgOf(user)
    const policy = await this.prisma.insurancePolicy.create({
      data: {
        shipmentId: input.shipmentId,
        insurerId: org.id,
        policyRef: input.policyRef,
        premium: input.premium,
        coverage: input.coverage,
        currency: input.currency ?? 'INR',
        status: 'active',
      },
    })
    await this.outbox.emit(await this.tx(), {
      eventType: 'FINANCE',
      eventCode: 'POLICY_ISSUED',
      entityType: 'shipment',
      entityId: input.shipmentId,
      shipmentId: input.shipmentId,
      actorId: user.id,
      payload: { policyRef: input.policyRef, coverage: input.coverage },
    })
    return { policy }
  }

  // ---------- Settlements ----------

  async createSettlement(input: { shipmentId: string; payerId?: string; payeeId?: string; type: string; amount?: number; currency?: string }, user: User) {
    if (!['freight', 'advance', 'balance', 'commission'].includes(input.type)) throw new BadRequestException('Invalid settlement type')
    const settlement = await this.prisma.settlement.create({
      data: {
        shipmentId: input.shipmentId,
        payerId: input.payerId,
        payeeId: input.payeeId,
        type: input.type,
        amount: input.amount,
        currency: input.currency ?? 'INR',
        status: 'due',
      },
    })
    await this.outbox.emit(await this.tx(), {
      eventType: 'FINANCE',
      eventCode: 'SETTLEMENT_CREATED',
      entityType: 'shipment',
      entityId: input.shipmentId,
      shipmentId: input.shipmentId,
      actorId: user.id,
      payload: { type: input.type, amount: input.amount },
    })
    return { settlement }
  }

  async clearSettlement(settlementId: string, user: User) {
    const settlement = await this.prisma.settlement.update({
      where: { id: settlementId },
      data: { status: 'cleared', settledAt: new Date() },
    })
    await this.outbox.emit(await this.tx(), {
      eventType: 'FINANCE',
      eventCode: 'SETTLEMENT_CLEARED',
      entityType: 'shipment',
      entityId: settlement.shipmentId,
      shipmentId: settlement.shipmentId,
      actorId: user.id,
      payload: { type: settlement.type, amount: settlement.amount },
    })
    return { settlement }
  }

  // ---------- Risk ----------

  /** Deterministic risk score 0..1 from cargo value, mode mix, distance, pieces, history. */
  async assessRisk(shipmentId: string, user: User) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { legs: true, claims: true },
    })
    if (!shipment) throw new NotFoundException('Shipment not found')

    const MODE_RISK: Record<string, number> = { air: 0.05, rail: 0.1, road: 0.2, ocean: 0.25, inland_water: 0.18, multimodal: 0.22 }
    const legs = shipment.legs
    const baseMode = legs.length ? Math.max(...legs.map((l) => MODE_RISK[l.mode] ?? 0.2)) : 0.15
    const distance = legs.reduce((s, l) => s + (l.distanceKm ?? 0), 0)
    const distanceFactor = Math.min(0.3, distance / 200_000)
    const valueFactor = Math.min(0.2, (shipment.value ?? 0) / 5_000_000)
    const historyFactor = Math.min(0.15, shipment.claims.length * 0.05)
    const score = Math.min(0.99, baseMode + distanceFactor + valueFactor + historyFactor)

    const assessment = await this.prisma.riskAssessment.create({
      data: {
        shipmentId,
        score,
        factors: { baseMode, distanceFactor, valueFactor, historyFactor, distance, legModes: legs.map((l) => l.mode) } as never,
        assessedBy: user.id,
      },
    })
    await this.outbox.emit(await this.tx(), {
      eventType: 'FINANCE',
      eventCode: 'RISK_ASSESSED',
      entityType: 'shipment',
      entityId: shipmentId,
      shipmentId,
      actorId: user.id,
      payload: { score },
    })
    return { assessment }
  }

  async summary(shipmentId: string) {
    const [claims, policies, settlements, risks] = await Promise.all([
      this.prisma.claim.findMany({ where: { shipmentId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.insurancePolicy.findMany({ where: { shipmentId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.settlement.findMany({ where: { shipmentId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.riskAssessment.findMany({ where: { shipmentId }, orderBy: { createdAt: 'desc' }, take: 5 }),
    ])
    const due = settlements.filter((s) => s.status === 'due').reduce((a, s) => a + (s.amount ?? 0), 0)
    const cleared = settlements.filter((s) => s.status === 'cleared').reduce((a, s) => a + (s.amount ?? 0), 0)
    const openClaims = claims.filter((c) => !['approved', 'rejected'].includes(c.status)).length
    return { claims, policies, settlements, riskAssessments: risks, totals: { due, cleared, openClaims } }
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
