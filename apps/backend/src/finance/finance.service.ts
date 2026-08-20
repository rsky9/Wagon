import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OutboxRelay } from '../outbox/outbox-relay.service'
import { OrgAccessService } from '../org-access/org-access.service'
import { NotificationsService } from '../notifications/notifications.service'
import { AuditService } from '../audit/audit.service'
import { PAYMENT_PROVIDER, PaymentProvider } from '../payments/payment-provider.service'
import type { User } from '@prisma/client'

/** Reference FX table (INR base). Static internal rates for quoting/display;
 *  not a live feed — the ledger always books in the party's own currency. */
const FX_TO_INR: Record<string, number> = {
  INR: 1,
  USD: 83.5,
  EUR: 90.2,
  GBP: 105.6,
  AED: 22.7,
  SGD: 61.9,
  JPY: 0.56,
  CNY: 11.5,
}

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAccess: OrgAccessService,
    @Inject(OutboxRelay) private readonly outbox: OutboxRelay,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** Notify every member of an organization (fire-and-forget). */
  private async notifyOrg(orgId: string | null | undefined, input: {
    type: string
    title: string
    body: string
    data?: Record<string, unknown>
    category?: string
  }) {
    if (!orgId) return
    const members = await this.prisma.organizationMember.findMany({ where: { organizationId: orgId }, select: { userId: true } })
    for (const m of members) {
      void this.notifications.create({ userId: m.userId, ...input }).catch(() => undefined)
    }
  }

  /**
   * Resolve who is liable for a claim on a shipment: the insurer of an active
   * policy if one exists, else the carrier booked on the shipment, else null
   * (platform-funded). Never the org that merely decided/reviewed the claim.
   */
  private async resolveClaimPayer(shipmentId: string): Promise<string | null> {
    const policy = await this.prisma.insurancePolicy.findFirst({
      where: { shipmentId, status: { in: ['active', 'claimed'] } },
      select: { insurerId: true },
    })
    if (policy?.insurerId) return policy.insurerId
    const booking = await this.prisma.carrierBooking.findFirst({
      where: { shipmentId },
      select: { carrierId: true },
    })
    return booking?.carrierId ?? null
  }

  /** Assert the caller can access a shipment (for claims/policies/settlements/risk). */
  private async requireShipmentAccess(user: User, shipmentId: string) {
    return this.orgAccess.assertShipmentAccess(user, shipmentId)
  }

  private async requireClaimAccess(user: User, claimId: string) {    const claim = await this.prisma.claim.findUnique({ where: { id: claimId } })
    if (!claim) throw new NotFoundException('Claim not found')
    await this.requireShipmentAccess(user, claim.shipmentId)
    return claim
  }

  // ---------- Claims ----------

  async fileClaim(input: { shipmentId: string; reason: string; amount?: number; currency?: string; notes?: string }, user: User) {
    if (!['loss', 'damage', 'delay', 'other'].includes(input.reason)) throw new BadRequestException('Invalid claim reason')
    if (input.amount != null && input.amount <= 0) throw new BadRequestException('Claim amount must be positive')
    const shipment = await this.requireShipmentAccess(user, input.shipmentId)
    // Prevent stacking: once a claim on this shipment has been approved (and a
    // policy claimed / settlement minted), further claims are blocked so a policy
    // can't be drained by repeated approvals. Also block a second OPEN claim on
    // the same shipment — one in-flight claim at a time.
    const existingClaim = await this.prisma.claim.findFirst({
      where: { shipmentId: input.shipmentId, status: { in: ['filed', 'assessed', 'approved'] } },
    })
    if (existingClaim) {
      throw new BadRequestException('A claim on this shipment is already open or approved — no further claims')
    }
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
    await this.audit.log({ actorId: user.id, action: 'claim.file', resource: claim.id, after: { shipmentId: input.shipmentId, reason: input.reason, amount: claim.amount, status: claim.status } })
    return { claim }
  }

  /** Assess step: filed -> assessed with findings + recommended amount. */
  async assessClaim(claimId: string, input: { recommendedAmount?: number; notes?: string }, user: User) {
    const claim = await this.requireClaimAccess(user, claimId)
    if (claim.status !== 'filed') throw new BadRequestException('Only filed claims can be assessed')
    if (input.recommendedAmount != null && input.recommendedAmount < 0) throw new BadRequestException('Recommended amount cannot be negative')
    const org = await this.orgAccess.primaryOrg(user)
    // Segregation of duties: the claimant cannot assess their own claim.
    if (claim.claimantId && claim.claimantId === org.id) {
      throw new ForbiddenException('The claimant cannot assess their own claim')
    }
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
    await this.audit.log({ actorId: user.id, action: 'claim.assess', resource: claimId, after: { status: 'assessed', recommendedAmount: updated.amount } })
    return { claim: updated }
  }

  async decideClaim(claimId: string, decision: 'approved' | 'rejected', notes: string | undefined, user: User) {
    if (!['approved', 'rejected'].includes(decision)) throw new BadRequestException('Decision must be approved or rejected')
    const claim = await this.requireClaimAccess(user, claimId)
    if (!['filed', 'assessed'].includes(claim.status)) throw new BadRequestException(`Cannot decide a ${claim.status} claim`)
    const org = await this.orgAccess.primaryOrg(user)
    // Segregation of duties: the claimant cannot approve their own claim.
    if (claim.claimantId && claim.claimantId === org.id) {
      throw new ForbiddenException('The claimant cannot decide their own claim')
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.claim.update({
        where: { id: claimId },
        data: { status: decision, decision, decidedBy: org.id, handlerId: org.id, decidedAt: new Date(), notes: notes ?? claim.notes },
      })
      // Approved claim -> auto-create a settlement payable to the claimant,
      // charged to the actually-liable org (insurer / booked carrier), not the
      // org that happened to decide the claim.
      if (decision === 'approved' && claim.amount) {
        const liableOrg = await this.resolveClaimPayer(claim.shipmentId)
        // No double-payout: a claim settlement already exists (due or cleared)
        // on this shipment -> reject. Two claims filed before either is decided
        // must not both mint settlements against the same policy.
        const existingSettlement = await tx.settlement.findFirst({
          where: { shipmentId: claim.shipmentId, type: 'claim', status: { in: ['due', 'cleared'] } },
        })
        if (existingSettlement) {
          throw new BadRequestException('A claim settlement already exists on this shipment')
        }
        // If the insurer is liable, cap the payout at the policy's coverage so
        // a ₹10M claim can't be charged to a ₹1L policy.
        let payoutAmount = claim.amount
        if (liableOrg) {
          const policy = await tx.insurancePolicy.findFirst({
            where: { shipmentId: claim.shipmentId, insurerId: liableOrg },
            select: { coverage: true },
          })
          if (policy?.coverage != null) {
            // Aggregate: subtract anything already paid (due OR cleared) on this policy.
            const paid = await tx.settlement.aggregate({
              where: { shipmentId: claim.shipmentId, type: 'claim', payeeId: claim.claimantId ?? undefined, status: { in: ['due', 'cleared'] } },
              _sum: { amount: true },
            })
            const remaining = Math.max(0, policy.coverage - (paid._sum.amount ?? 0))
            payoutAmount = Math.min(claim.amount, remaining)
          }
        }
        if (payoutAmount <= 0) {
          throw new BadRequestException('Policy coverage on this shipment is exhausted — no further payout')
        }
        await tx.settlement.create({
          data: {
            shipmentId: claim.shipmentId,
            payerId: liableOrg ?? undefined,
            payeeId: claim.claimantId ?? undefined,
            type: 'claim',
            amount: payoutAmount,
            currency: claim.currency,
            status: 'due',
          },
        })
        // Mark any active insurance policy on this shipment as claimed.
        await tx.insurancePolicy.updateMany({
          where: { shipmentId: claim.shipmentId, status: 'active' },
          data: { status: 'claimed' },
        })
      }
      await this.outbox.emit(tx as never, {
        eventType: 'FINANCE',
        eventCode: 'CLAIM_DECISION',
        entityType: 'shipment',
        entityId: claim.shipmentId,
        orgId: claim.claimantId ?? null,
        shipmentId: claim.shipmentId,
        actorId: user.id,
        payload: { claimId, decision, settlementCreated: decision === 'approved' },
      })
      return changed
    })
    // Notify the claimant's org of the outcome.
    await this.notifyOrg(claim.claimantId, {
      type: decision === 'approved' ? 'claim_approved' : 'claim_rejected',
      title: decision === 'approved' ? 'Claim approved' : 'Claim rejected',
      body: decision === 'approved'
        ? `Your claim of ${claim.currency} ${claim.amount} was approved and a settlement was created`
        : `Your claim of ${claim.currency} ${claim.amount} was not approved`,
      data: { shipmentId: claim.shipmentId, claimId, status: decision },
      category: 'finance',
    })
    await this.audit.log({ actorId: user.id, action: 'claim.decide', resource: claimId, after: { decision, shipmentId: claim.shipmentId } })
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

  async issuePolicy(input: { shipmentId: string; policyRef: string; premium?: number; coverage?: number; currency?: string; insurerOrgId?: string }, user: User) {
    const shipment = await this.requireShipmentAccess(user, input.shipmentId)
    if (input.premium != null && input.premium < 0) throw new BadRequestException('Premium cannot be negative')
    if (input.coverage != null && input.coverage <= 0) throw new BadRequestException('Coverage must be positive')
    // Only an insurer/carrier org can underwrite policies — unless the caller is the
    // shipment owner buying cover for themselves (plan-cover acceptance), in which
    // case the insurer org is their own org.
    let org: { id: string }
    if (input.insurerOrgId) {
      const insurerOrg = await this.prisma.organization.findUnique({ where: { id: input.insurerOrgId } })
      if (!insurerOrg) throw new NotFoundException('Insurer org not found')
      // Self-cover: the shipment owner may underwrite cover on their own cargo.
      if (input.insurerOrgId === shipment.ownerOrgId) {
        if (!(await this.orgAccess.isMember(user, input.insurerOrgId))) {
          throw new ForbiddenException('Not a member of the insurer org')
        }
      } else {
        // Third-party insurer: must be a carrier/broker/other org and the caller
        // a member — prevents forging policies under arbitrary orgs.
        if (!['carrier', 'broker', 'other'].includes(insurerOrg.kind)) {
          throw new ForbiddenException('Insurer org must be a carrier/broker/other')
        }
        if (!(await this.orgAccess.isMember(user, input.insurerOrgId))) {
          throw new ForbiddenException('Not a member of the insurer org')
        }
      }
      org = { id: input.insurerOrgId }
    } else {
      org = await this.orgAccess.requireOrgOfKind(user, ['carrier', 'broker', 'other'])
    }
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
      // Premium is collected: the shipment owner (or the buyer) pays the insurer
      // via a settlement so cover is actually funded, not just recorded.
      if (input.premium != null && input.premium > 0) {
        await tx.settlement.create({
          data: {
            shipmentId: input.shipmentId,
            payerId: shipment.ownerOrgId ?? undefined,
            payeeId: org.id,
            type: 'premium',
            amount: input.premium,
            currency: input.currency ?? 'INR',
            status: 'due',
          },
        })
      }
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
    await this.notifyOrg(shipment.ownerOrgId, {
      type: 'policy_issued',
      title: 'Cover issued',
      body: `Insurance policy ${input.policyRef} is active with ${input.coverage ? `coverage of ${input.currency ?? 'INR'} ${input.coverage}` : 'coverage bound'} on this shipment`,
      data: { shipmentId: input.shipmentId, policyRef: input.policyRef },
      category: 'finance',
    })
    await this.audit.log({ actorId: user.id, action: 'policy.issue', resource: policy.id, after: { shipmentId: input.shipmentId, policyRef: policy.policyRef, status: policy.status, coverage: policy.coverage } })
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

  /** Expire an active policy (insurer or shipment owner). */
  async expirePolicy(policyId: string, user: User) {
    const policy = await this.prisma.insurancePolicy.findUnique({ where: { id: policyId }, include: { shipment: true } })
    if (!policy) throw new NotFoundException('Policy not found')
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const isInsurer = policy.insurerId ? orgIds.includes(policy.insurerId) : false
    const isOwner = policy.shipment.ownerOrgId ? orgIds.includes(policy.shipment.ownerOrgId) : false
    if (!isInsurer && !isOwner) throw new ForbiddenException('Not a party to this policy')
    if (policy.status !== 'active') throw new BadRequestException(`Policy is already ${policy.status}`)
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.insurancePolicy.update({ where: { id: policyId }, data: { status: 'expired' } })
      await this.outbox.emit(tx as never, {
        eventType: 'FINANCE',
        eventCode: 'POLICY_EXPIRED',
        entityType: 'shipment',
        entityId: policy.shipmentId,
        orgId: policy.shipment.ownerOrgId ?? policy.insurerId ?? null,
        shipmentId: policy.shipmentId,
        actorId: user.id,
        payload: { policyRef: policy.policyRef },
      })
      return changed
    })
    await this.audit.log({ actorId: user.id, action: 'policy.expire', resource: policyId, after: { policyRef: policy.policyRef, status: 'expired' } })
    return { policy: updated }
  }

  /** Claim coverage on an active policy (the shipment owner). */
  async markPolicyClaimed(policyId: string, user: User) {
    const policy = await this.prisma.insurancePolicy.findUnique({ where: { id: policyId }, include: { shipment: true } })
    if (!policy) throw new NotFoundException('Policy not found')
    if (!policy.shipment.ownerOrgId || !(await this.orgAccess.isMember(user, policy.shipment.ownerOrgId))) {
      throw new ForbiddenException('Only the shipment owner can claim the policy')
    }
    if (policy.status !== 'active') throw new BadRequestException(`Only active policies can be claimed (current: ${policy.status})`)
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.insurancePolicy.update({ where: { id: policyId }, data: { status: 'claimed' } })
      await this.outbox.emit(tx as never, {
        eventType: 'FINANCE',
        eventCode: 'POLICY_CLAIMED',
        entityType: 'shipment',
        entityId: policy.shipmentId,
        orgId: policy.shipment.ownerOrgId ?? null,
        shipmentId: policy.shipmentId,
        actorId: user.id,
        payload: { policyRef: policy.policyRef },
      })
      return changed
    })
    await this.audit.log({ actorId: user.id, action: 'policy.claim', resource: policyId, after: { policyRef: policy.policyRef, status: 'claimed' } })
    return { policy: updated }
  }

  // ---------- Settlements ----------

  async createSettlement(input: { shipmentId: string; payerId?: string; payeeId?: string; type: string; amount?: number; currency?: string }, user: User) {
    if (!['freight', 'advance', 'balance', 'commission', 'claim', 'premium'].includes(input.type)) throw new BadRequestException('Invalid settlement type')
    if (input.amount != null && input.amount <= 0) throw new BadRequestException('Settlement amount must be positive')
    const shipment = await this.requireShipmentAccess(user, input.shipmentId)
    // Default the payer to the caller's org when neither side is specified.
    const memberOrgIds = await this.orgAccess.memberOrgIds(user)
    const payerId = input.payerId ?? (memberOrgIds[0] ?? undefined)
    // Validate counterparties exist; at least one must be the caller's org.
    for (const side of ['payerId', 'payeeId'] as const) {
      const orgId = side === 'payerId' ? payerId : input.payeeId
      if (!orgId) continue
      const org = await this.prisma.organization.findUnique({ where: { id: orgId } })
      if (!org) throw new NotFoundException(`Unknown organization for ${side}`)
    }
    if (!(payerId && memberOrgIds.includes(payerId)) && !(input.payeeId && memberOrgIds.includes(input.payeeId))) {
      throw new ForbiddenException('A settlement must involve one of your organizations')
    }
    // Integrity: never mint unbounded/duplicate obligations. A freight/commission
    // settlement may only exist once per (shipment, type, payer, payee) and its
    // amount is capped at the shipment's agreed rate.
    if (['freight', 'commission'].includes(input.type)) {
      const duplicate = await this.prisma.settlement.findFirst({
        where: {
          shipmentId: input.shipmentId,
          type: input.type,
          payerId,
          payeeId: input.payeeId ?? null,
          status: { in: ['due', 'cleared'] },
        },
      })
      if (duplicate) throw new BadRequestException(`A ${input.type} settlement already exists for this pair on this shipment`)
      // Cap at the agreed booking rate: the shipment's ref is often the source
      // load id (transport shipments projected from loads).
      let cap: number | null = null
      const sourceLoad = await this.prisma.load.findUnique({ where: { id: shipment.ref } })
      if (sourceLoad) {
        const booking = await this.prisma.bookingSnapshot.findFirst({
          where: { trip: { loadId: sourceLoad.id } },
          orderBy: { confirmedAt: 'desc' },
          select: { rate: true },
        })
        cap = booking?.rate ?? sourceLoad.fareEstimate ?? null
      }
      if (cap != null && input.amount != null && input.amount > cap) {
        throw new BadRequestException(`Settlement cannot exceed the agreed rate ₹${cap}`)
      }
    }
    // Claim settlements may only reference a REAL approved claim, and the
    // amount is capped at the claim's assessed/approved amount — a shipment
    // owner must not mint an arbitrary obligation against an innocent org.
    if (input.type === 'claim') {
      const claim = await this.prisma.claim.findFirst({
        where: { shipmentId: input.shipmentId, status: 'approved' },
        orderBy: { decidedAt: 'desc' },
      })
      if (!claim) throw new BadRequestException('No approved claim on this shipment to settle')
      if (input.amount != null && claim.amount != null && input.amount > claim.amount) {
        throw new BadRequestException(`Claim settlement cannot exceed the approved claim amount ₹${claim.amount}`)
      }
      // The claimant cannot settle a claim they raised against themselves.
      if (payerId === input.payeeId) throw new BadRequestException('Claim settlement must have distinct payer and payee')
      // One claim settlement per shipment (due or cleared) — a second would
      // drain the policy beyond decideClaim's coverage cap.
      const duplicateClaim = await this.prisma.settlement.findFirst({
        where: { shipmentId: input.shipmentId, type: 'claim', status: { in: ['due', 'cleared'] } },
      })
      if (duplicateClaim) throw new BadRequestException('A claim settlement already exists on this shipment')
      // Cap at the liable policy's remaining coverage when the insurer is the payer.
      if (payerId) {
        const insurerPolicy = await this.prisma.insurancePolicy.findFirst({
          where: { shipmentId: input.shipmentId, insurerId: payerId },
          select: { coverage: true },
        })
        if (insurerPolicy?.coverage != null) {
          const paid = await this.prisma.settlement.aggregate({
            where: { shipmentId: input.shipmentId, type: 'claim', payeeId: input.payeeId ?? undefined, status: { in: ['due', 'cleared'] } },
            _sum: { amount: true },
          })
          const remaining = Math.max(0, insurerPolicy.coverage - (paid._sum.amount ?? 0))
          if (input.amount != null && input.amount > remaining) {
            throw new BadRequestException(`Claim settlement exceeds the insurer's remaining coverage ₹${remaining}`)
          }
        }
      }
    }
    const settlement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.settlement.create({
        data: {
          shipmentId: input.shipmentId,
          payerId,
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
    await this.notifyOrg(input.payeeId, {
      type: 'settlement_due',
      title: 'Payment due',
      body: `A ${input.type} settlement of ${input.currency ?? 'INR'} ${input.amount ?? 0} is owed to you on this shipment`,
      data: { shipmentId: input.shipmentId, settlementId: settlement.id, type: input.type },
      category: 'finance',
    })
    await this.audit.log({ actorId: user.id, action: 'settlement.create', resource: settlement.id, after: { shipmentId: input.shipmentId, type: settlement.type, amount: settlement.amount, status: settlement.status } })
    return { settlement }
  }

  async clearSettlement(settlementId: string, user: User) {
    const settlement = await this.prisma.settlement.findUnique({ where: { id: settlementId } })
    if (!settlement) throw new NotFoundException('Settlement not found')
    await this.requireShipmentAccess(user, settlement.shipmentId)
    if (settlement.status !== 'due') throw new BadRequestException('Only due settlements can be cleared')
    // Clearing RUNS A REAL CAPTURE against the payer — only the payer's org (or
    // the shipment owner, which is usually the payer) may authorize it. A member
    // of the owner org who is neither side must not trigger a charge on a third
    // party's account.
    const memberOrgIds = await this.orgAccess.memberOrgIds(user)
    if (settlement.payerId && !memberOrgIds.includes(settlement.payerId)) {
      throw new ForbiddenException('Only the payer’s org can authorize clearing this settlement')
    }
    // A settlement with no payer (platform-funded) must not be cleared by any
    // org member — only admins (via the admin clearSettlement) may collect it.
    if (!settlement.payerId && user.role !== 'admin') {
      throw new ForbiddenException('Only an administrator can clear a platform-funded settlement')
    }
    const amount = settlement.amount ?? 0
    if (amount <= 0) throw new BadRequestException('Settlement has no amount to collect')
    // Idempotent: one real payment per settlement (escrow-style capture).
    const idempotencyKey = `settlement_${settlementId}`
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } })
    if (existing && existing.status === 'succeeded') {
      return { settlement: { ...settlement, status: 'cleared', settledAt: settlement.settledAt }, payment: existing, alreadyPaid: true }
    }
    // A failed capture must be retryable.
    if (existing && existing.status === 'failed') {
      await this.prisma.payment.delete({ where: { id: existing.id } })
    }

    const result = await this.provider.capture({ amount, currency: settlement.currency || 'INR', reference: idempotencyKey, metadata: { settlementId, shipmentId: settlement.shipmentId } })
    const updated = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          settlementId,
          type: 'settlement',
          amount,
          currency: settlement.currency || 'INR',
          method: 'mock',
          providerRef: result.providerRef,
          idempotencyKey,
          status: result.status === 'succeeded' ? 'succeeded' : 'failed',
        },
      })
      // Only a succeeded payment clears the settlement.
      const changed = await tx.settlement.update({
        where: { id: settlementId },
        data: result.status === 'succeeded' ? { status: 'cleared', settledAt: new Date() } : { status: settlement.status },
      })
      await this.outbox.emit(tx as never, {
        eventType: 'FINANCE',
        eventCode: result.status === 'succeeded' ? 'SETTLEMENT_PAID' : 'SETTLEMENT_FAILED',
        entityType: 'shipment',
        entityId: settlement.shipmentId,
        orgId: settlement.payerId ?? null,
        shipmentId: settlement.shipmentId,
        actorId: user.id,
        payload: { type: settlement.type, amount, providerRef: result.providerRef, status: result.status },
      })
      return { changed, payment }
    })
    if (result.status === 'succeeded') {
      await this.notifyOrg(settlement.payerId, {
        type: 'settlement_cleared',
        title: 'Settlement cleared',
        body: `Your ${settlement.type} settlement of ${settlement.currency || 'INR'} ${amount} was paid`,
        data: { shipmentId: settlement.shipmentId, settlementId, type: settlement.type },
        category: 'finance',
      })
    }
    await this.audit.log({ actorId: user.id, action: 'settlement.clear', resource: settlementId, after: { status: result.status === 'succeeded' ? 'cleared' : 'failed', amount } })
    return { settlement: updated.changed, payment: updated.payment }
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
      include: { shipment: { select: { id: true, ref: true, commodity: true } }, payer: true, payee: true, payment: true },
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
    await this.audit.log({ actorId: user.id, action: 'risk.assess', resource: assessment.id, after: { shipmentId, score, band } })
    return { assessment: { ...assessment, band } }
  }

  /**
   * Layer 6: quote priced insurance cover for a PLAN at booking time. Risk is
   * derived from the plan's legs (mode + eta) and the declared cargo value;
   * the premium is a transparent percentage. The orderer can accept the quote
   * and immediately issue a policy (an insurer/partner underwrites).
   */
  async quotePlanCover(planId: string, input: { declaredValue: number; currency?: string }, user: User) {
    if (input.declaredValue == null || input.declaredValue <= 0) throw new BadRequestException('Declared cargo value required')
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } })
    if (!plan) throw new NotFoundException('Plan not found')
    await this.requireShipmentAccess(user, plan.shipmentId)

    const legs = (plan.legs as unknown as Array<{ mode?: string; etaHours?: number; cost?: number }>) ?? []
    const MODE_RISK: Record<string, number> = { air: 0.05, rail: 0.1, road: 0.2, ocean: 0.25, inland_water: 0.18, multimodal: 0.22 }
    const baseMode = legs.length ? Math.max(...legs.map((l) => MODE_RISK[l.mode ?? 'road'] ?? 0.2)) : 0.2
    const legCountFactor = Math.min(0.1, (legs.length - 1) * 0.03)
    const etaFactor = Math.min(0.1, ((plan.etaHours ?? 0) / 24) * 0.02)
    const risk = Math.min(0.95, baseMode + legCountFactor + etaFactor)
    const band = risk < 0.4 ? 'low' : risk < 0.7 ? 'medium' : 'high'

    // Premium: risk-adjusted rate on declared value, with a floor.
    const rate = band === 'low' ? 0.008 : band === 'medium' ? 0.015 : 0.025
    const premium = Math.round(input.declaredValue * rate)
    const coverage = input.declaredValue
    const currency = input.currency ?? 'INR'

    return {
      quote: {
        planId,
        planRef: plan.ref,
        declaredValue: input.declaredValue,
        coverage,
        premium,
        currency,
        rate,
        risk,
        band,
        factors: { baseMode, legCountFactor, etaFactor },
      },
    }
  }

  /**
   * Accept a plan cover quote: issue a policy underwritten by a partner
   * (carrier/broker/other org). Returns the policy + premium payable.
   */
  async acceptPlanCover(planId: string, input: { declaredValue: number; policyRef: string; currency?: string }, user: User) {
    const quote = await this.quotePlanCover(planId, { declaredValue: input.declaredValue, currency: input.currency }, user)
    const q = quote.quote
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } })
    if (!plan) throw new NotFoundException('Plan not found')
    // Insurer org: the plan's source carrier listing if present, else the owner's org.
    const shipment = await this.prisma.shipment.findUnique({ where: { id: plan.shipmentId } })
    const insurerOrgId = (plan as unknown as { sourceOrgId?: string | null }).sourceOrgId ?? shipment?.ownerOrgId ?? undefined
    const policy = await this.issuePolicy(
      { shipmentId: plan.shipmentId, policyRef: input.policyRef, premium: q.premium, coverage: q.coverage, currency: q.currency, insurerOrgId },
      user,
    )
    return { policy: policy.policy, quote: q }
  }

  async summary(shipmentId: string, user: User) {    await this.requireShipmentAccess(user, shipmentId)
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

  /** Convert an amount between supported currencies for quoting/display. */
  convert(input: { amount: number; from: string; to: string }) {
    if (input.amount < 0) throw new BadRequestException('amount cannot be negative')
    const from = input.from.toUpperCase()
    const to = input.to.toUpperCase()
    if (!FX_TO_INR[from]) throw new BadRequestException(`Unsupported currency ${from}`)
    if (!FX_TO_INR[to]) throw new BadRequestException(`Unsupported currency ${to}`)
    const amount = Math.round((input.amount * (FX_TO_INR[from]! / FX_TO_INR[to]!)) * 100) / 100
    return { amount, from, to, rate: Math.round((FX_TO_INR[from]! / FX_TO_INR[to]!) * 10000) / 10000, at: new Date() }
  }

  async supportedCurrencies() {
    return { currencies: Object.keys(FX_TO_INR) }
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
