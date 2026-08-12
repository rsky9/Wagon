import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OutboxRelay } from '../outbox/outbox-relay.service'
import { OrgAccessService } from '../org-access/org-access.service'
import type { User } from '@prisma/client'

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAccess: OrgAccessService,
    @Inject(OutboxRelay) private readonly outbox: OutboxRelay,
  ) {}

  /** Assert the caller can access a shipment (for claims/policies/settlements/risk). */
  private async requireShipmentAccess(user: User, shipmentId: string) {
    return this.orgAccess.assertShipmentAccess(user, shipmentId)
  }

  private async requireClaimAccess(user: User, claimId: string) {
    const claim = await this.prisma.claim.findUnique({ where: { id: claimId } })
    if (!claim) throw new NotFoundException('Claim not found')
    await this.requireShipmentAccess(user, claim.shipmentId)
    return claim
  }

  // ---------- Claims ----------

  async fileClaim(input: { shipmentId: string; reason: string; amount?: number; currency?: string; notes?: string }, user: User) {
    if (!['loss', 'damage', 'delay', 'other'].includes(input.reason)) throw new BadRequestException('Invalid claim reason')
    if (input.amount != null && input.amount <= 0) throw new BadRequestException('Claim amount must be positive')
    const shipment = await this.requireShipmentAccess(user, input.shipmentId)
    const org = await this.orgAccess.primaryOrg(user)
    const claim = await this.prisma.$transaction(async (tx) => {
      const created = await tx.claim.create({
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
      await this.outbox.emit(tx as never, {
        eventType: 'FINANCE',
        eventCode: 'CLAIM_FILED',
        entityType: 'shipment',
        entityId: input.shipmentId,
        orgId: shipment.ownerOrgId ?? org.id,
        shipmentId: input.shipmentId,
        actorId: user.id,
        payload: { claimId: created.id, reason: input.reason, amount: input.amount },
      })
      return created
    })
    return { claim }
  }

  /** Assess step: filed -> assessed with findings + recommended amount. */
  async assessClaim(claimId: string, input: { recommendedAmount?: number; notes?: string }, user: User) {
    const claim = await this.requireClaimAccess(user, claimId)
    if (claim.status !== 'filed') throw new BadRequestException('Only filed claims can be assessed')
    if (input.recommendedAmount != null && input.recommendedAmount < 0) throw new BadRequestException('Recommended amount cannot be negative')
    const org = await this.orgAccess.primaryOrg(user)
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.claim.update({
        where: { id: claimId },
        data: {
          status: 'assessed',
          amount: input.recommendedAmount ?? claim.amount,
          handlerId: org.id,
          notes: input.notes ?? claim.notes,
        },
      })
      await this.outbox.emit(tx as never, {
        eventType: 'FINANCE',
        eventCode: 'CLAIM_ASSESSED',
        entityType: 'shipment',
        entityId: claim.shipmentId,
        orgId: claim.claimantId ?? null,
        shipmentId: claim.shipmentId,
        actorId: user.id,
        payload: { claimId, recommendedAmount: input.recommendedAmount ?? claim.amount },
      })
      return changed
    })
    return { claim: updated }
  }

  async decideClaim(claimId: string, decision: 'approved' | 'rejected', notes: string | undefined, user: User) {
    if (!['approved', 'rejected'].includes(decision)) throw new BadRequestException('Decision must be approved or rejected')
    const claim = await this.requireClaimAccess(user, claimId)
    if (!['filed', 'assessed'].includes(claim.status)) throw new BadRequestException(`Cannot decide a ${claim.status} claim`)
    const org = await this.orgAccess.primaryOrg(user)
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.claim.update({
        where: { id: claimId },
        data: { status: decision, decision, decidedBy: org.id, handlerId: org.id, decidedAt: new Date(), notes: notes ?? claim.notes },
      })
      await this.outbox.emit(tx as never, {
        eventType: 'FINANCE',
        eventCode: 'CLAIM_DECISION',
        entityType: 'shipment',
        entityId: claim.shipmentId,
        orgId: claim.claimantId ?? null,
        shipmentId: claim.shipmentId,
        actorId: user.id,
        payload: { claimId, decision },
      })
      return changed
    })
    return { claim: updated }
  }

  async listClaims(user: User, status?: string) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const claims = await this.prisma.claim.findMany({
      where: {
        AND: [
          { OR: [{ claimantId: { in: orgIds } }, { handlerId: { in: orgIds } }] },
          ...(status ? [{ status }] : []),
        ],
      },
      include: { shipment: { select: { id: true, ref: true, commodity: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { claims }
  }

  // ---------- Insurance ----------

  async issuePolicy(input: { shipmentId: string; policyRef: string; premium?: number; coverage?: number; currency?: string }, user: User) {
    const shipment = await this.requireShipmentAccess(user, input.shipmentId)
    if (input.premium != null && input.premium < 0) throw new BadRequestException('Premium cannot be negative')
    if (input.coverage != null && input.coverage <= 0) throw new BadRequestException('Coverage must be positive')
    const org = await this.orgAccess.primaryOrg(user)
    const policy = await this.prisma.$transaction(async (tx) => {
      const created = await tx.insurancePolicy.create({
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
      await this.outbox.emit(tx as never, {
        eventType: 'FINANCE',
        eventCode: 'POLICY_ISSUED',
        entityType: 'shipment',
        entityId: input.shipmentId,
        orgId: shipment.ownerOrgId ?? org.id,
        shipmentId: input.shipmentId,
        actorId: user.id,
        payload: { policyRef: input.policyRef, coverage: input.coverage },
      })
      return created
    })
    return { policy }
  }

  async listPolicies(user: User) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const policies = await this.prisma.insurancePolicy.findMany({
      where: {
        AND: [{ OR: [{ insurerId: { in: orgIds } }, { shipment: { ownerOrgId: { in: orgIds } } }] }],
      },
      include: { shipment: { select: { id: true, ref: true, commodity: true } }, insurer: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { policies }
  }

  // ---------- Settlements ----------

  async createSettlement(input: { shipmentId: string; payerId?: string; payeeId?: string; type: string; amount?: number; currency?: string }, user: User) {
    if (!['freight', 'advance', 'balance', 'commission'].includes(input.type)) throw new BadRequestException('Invalid settlement type')
    if (input.amount != null && input.amount <= 0) throw new BadRequestException('Settlement amount must be positive')
    const shipment = await this.requireShipmentAccess(user, input.shipmentId)
    const settlement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.settlement.create({
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
      await this.outbox.emit(tx as never, {
        eventType: 'FINANCE',
        eventCode: 'SETTLEMENT_CREATED',
        entityType: 'shipment',
        entityId: input.shipmentId,
        orgId: shipment.ownerOrgId ?? null,
        shipmentId: input.shipmentId,
        actorId: user.id,
        payload: { type: input.type, amount: input.amount },
      })
      return created
    })
    return { settlement }
  }

  async clearSettlement(settlementId: string, user: User) {
    const settlement = await this.prisma.settlement.findUnique({ where: { id: settlementId } })
    if (!settlement) throw new NotFoundException('Settlement not found')
    await this.requireShipmentAccess(user, settlement.shipmentId)
    if (settlement.status !== 'due') throw new BadRequestException('Only due settlements can be cleared')
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.settlement.update({
        where: { id: settlementId },
        data: { status: 'cleared', settledAt: new Date() },
      })
      await this.outbox.emit(tx as never, {
        eventType: 'FINANCE',
        eventCode: 'SETTLEMENT_CLEARED',
        entityType: 'shipment',
        entityId: settlement.shipmentId,
        orgId: settlement.payerId ?? null,
        shipmentId: settlement.shipmentId,
        actorId: user.id,
        payload: { type: settlement.type, amount: settlement.amount },
      })
      return changed
    })
    return { settlement: updated }
  }

  async listSettlements(user: User, status?: string) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const settlements = await this.prisma.settlement.findMany({
      where: {
        AND: [
          { OR: [{ payerId: { in: orgIds } }, { payeeId: { in: orgIds } }, { shipment: { ownerOrgId: { in: orgIds } } }] },
          ...(status ? [{ status }] : []),
        ],
      },
      include: { shipment: { select: { id: true, ref: true, commodity: true } }, payer: true, payee: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { settlements }
  }

  // ---------- Risk ----------

  /** Deterministic risk score 0..1 — capped band reachable, rejected claims excluded. */
  async assessRisk(shipmentId: string, user: User) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { legs: true, claims: true },
    })
    if (!shipment) throw new NotFoundException('Shipment not found')
    await this.requireShipmentAccess(user, shipmentId)

    const MODE_RISK: Record<string, number> = { air: 0.05, rail: 0.1, road: 0.2, ocean: 0.25, inland_water: 0.18, multimodal: 0.22 }
    const legs = shipment.legs
    const baseMode = legs.length ? Math.max(...legs.map((l) => MODE_RISK[l.mode] ?? 0.2)) : 0.15
    const distance = legs.reduce((s, l) => s + (l.distanceKm ?? 0), 0)
    const distanceFactor = Math.min(0.25, distance / 200_000)
    const valueFactor = Math.min(0.2, (shipment.value ?? 0) / 5_000_000)
    const activeClaims = shipment.claims.filter((c) => ['filed', 'assessed'].includes(c.status))
    const historyFactor = Math.min(0.2, activeClaims.length * 0.06)
    // Band reachable: 0.25 + 0.25 + 0.2 + 0.2 = 0.90 + history up to 0.2 -> up to 0.99
    const score = Math.min(0.99, baseMode + distanceFactor + valueFactor + historyFactor)
    const band = score < 0.4 ? 'low' : score < 0.7 ? 'medium' : 'high'

    const assessment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.riskAssessment.create({
        data: {
          shipmentId,
          score,
          factors: { baseMode, distanceFactor, valueFactor, historyFactor, distance, legModes: legs.map((l) => l.mode), band } as never,
          assessedBy: user.id,
        },
      })
      await this.outbox.emit(tx as never, {
        eventType: 'FINANCE',
        eventCode: 'RISK_ASSESSED',
        entityType: 'shipment',
        entityId: shipmentId,
        orgId: shipment.ownerOrgId ?? null,
        shipmentId,
        actorId: user.id,
        payload: { score, band },
      })
      return created
    })
    return { assessment: { ...assessment, band } }
  }

  async summary(shipmentId: string, user: User) {
    await this.requireShipmentAccess(user, shipmentId)
    const [claims, policies, settlements, risks] = await Promise.all([
      this.prisma.claim.findMany({ where: { shipmentId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.insurancePolicy.findMany({ where: { shipmentId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.settlement.findMany({ where: { shipmentId }, orderBy: { createdAt: 'desc' } }),
      this.prisma.riskAssessment.findMany({ where: { shipmentId }, orderBy: { createdAt: 'desc' }, take: 5 }),
    ])
    const due = settlements.filter((s) => s.status === 'due').reduce((a, s) => a + (s.amount ?? 0), 0)
    const cleared = settlements.filter((s) => s.status === 'cleared').reduce((a, s) => a + (s.amount ?? 0), 0)
    const openClaims = claims.filter((c) => ['filed', 'assessed'].includes(c.status)).length
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
