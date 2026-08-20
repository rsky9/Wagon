import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { UploadsService } from '../uploads/uploads.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PaymentsService } from '../payments/payments.service'
import { PAYMENT_PROVIDER, PaymentProvider } from '../payments/payment-provider.service'
import type { User, TruckType } from '@prisma/client'

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
    private readonly notifications: NotificationsService,
    private readonly paymentsService: PaymentsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  async dashboard() {
    const [loadsThisWeek, matchRate, activeUsers, disputesOpen, statusBreakdown, weeklyTrend] =
      await Promise.all([
        this.prisma.load.count({
          where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        }),
        this.computeMatchRate(),
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.dispute.count({ where: { status: 'open' } }),
        this.loadStatusBreakdown(),
        this.weeklyLoadTrend(),
      ])
    return { loadsThisWeek, matchRate, activeUsers, disputesOpen, statusBreakdown, weeklyTrend }
  }

  private async loadStatusBreakdown() {
    const groups = await this.prisma.load.groupBy({
      by: ['status'],
      _count: { _all: true },
    })
    return groups.map((g) => ({ status: g.status, count: g._count._all }))
  }

  private async weeklyLoadTrend() {
    const days = 7
    const out: Array<{ date: string; count: number }> = []
    for (let i = days - 1; i >= 0; i--) {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      start.setDate(start.getDate() - i)
      const end = new Date(start)
      end.setDate(end.getDate() + 1)
      const count = await this.prisma.load.count({ where: { createdAt: { gte: start, lt: end } } })
      out.push({ date: start.toISOString().slice(0, 10), count })
    }
    return out
  }

  async users() {
    const users = await this.prisma.user.findMany({
      where: { role: { in: ['supplier', 'transporter'] } },
      include: { supplier: true, transporter: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { users }
  }

  async loads(query?: { status?: string; q?: string }) {
    const where: Record<string, unknown> = {}
    if (query?.status) where.status = query.status
    if (query?.q?.trim()) {
      const q = query.q.trim()
      where.OR = [
        { pickupAddr: { contains: q, mode: 'insensitive' } },
        { dropAddr: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ]
    }
    const loads = await this.prisma.load.findMany({
      where: where as never,
      include: { material: true, supplier: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return { loads }
  }

  async trips(query?: { status?: string; q?: string }) {
    const where: Record<string, unknown> = {}
    if (query?.status) where.status = query.status
    if (query?.q?.trim()) {
      const q = query.q.trim()
      where.OR = [
        { load: { pickupAddr: { contains: q, mode: 'insensitive' } } },
        { load: { dropAddr: { contains: q, mode: 'insensitive' } } },
      ]
    }
    const trips = await this.prisma.trip.findMany({
      where: where as never,
      include: { load: { include: { material: true } }, payments: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return { trips }
  }

  /** Full load detail with its bids + supplier + material. */
  async loadDetail(id: string) {
    const load = await this.prisma.load.findUnique({
      where: { id },
      include: {
        supplier: { include: { user: true } },
        material: true,
        bids: true,
        trips: true,
      },
    })
    if (!load) throw new NotFoundException('Load not found')
    const bids = await Promise.all(
      load.bids.map(async (b) => {
        const transporter = await this.prisma.transporter.findUnique({
          where: { id: b.transporterId },
          include: { user: { select: { id: true, name: true, mobile: true } } },
        })
        return { ...b, transporter }
      }),
    )
    return { load: { ...load, bids } }
  }

  async user(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        supplier: true,
        transporter: { include: { vehicles: true } },
        kycDocuments: true,
      },
    })
    if (!user) throw new NotFoundException('User not found')
    return { user }
  }

  /** Returns a user's KYC documents with presigned read URLs for review. */
  async kycDocuments(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { kycDocuments: true },
    })
    if (!user) throw new NotFoundException('User not found')

    const docs = await Promise.all(
      user.kycDocuments.map(async (doc) => {
        let url: string | null = null
        try {
          url = await this.uploads.presignRead(doc.storageKey)
        } catch {
          url = null
        }
        return {
          id: doc.id,
          kind: doc.kind,
          status: doc.status,
          mimeType: doc.mimeType,
          createdAt: doc.createdAt,
          url,
        }
      }),
    )
    return { docs }
  }

  /**
   * Decide a single KYC document (approved/rejected). On approval of a bank
   * doc, the user's bank verification is recorded so payouts can be gated.
   */
  async decideKycDocument(documentId: string, decision: 'approved' | 'rejected', actor: User, adminNote?: string) {
    if (!['approved', 'rejected'].includes(decision)) throw new BadRequestException('Decision must be approved or rejected')
    const doc = await this.prisma.kycDocument.findUnique({ where: { id: documentId } })
    if (!doc) throw new NotFoundException('Document not found')
    if (doc.status !== 'pending') throw new BadRequestException(`Document is already ${doc.status}`)
    const updated = await this.prisma.kycDocument.update({
      where: { id: documentId },
      data: {
        status: decision,
        adminNote: adminNote ?? null,
        verifiedAt: decision === 'approved' ? new Date() : null,
      },
    })
    await this.audit.log({
      actorId: actor.id,
      action: `kyc.${decision}`,
      resource: `kycDocument:${documentId}`,
      before: { status: doc.status },
      after: { status: decision, adminNote },
    })
    // Recompute the user's overall KYC: fully approved when every submitted doc
    // is approved; also flip the bank-doc flag for payout eligibility.
    const docs = await this.prisma.kycDocument.findMany({ where: { userId: doc.userId } })
    const allApproved = docs.length > 0 && docs.every((d) => d.status === 'approved')
    const hasApprovedBank = docs.some((d) => d.kind === 'bank' && d.status === 'approved')
    await this.prisma.user.update({
      where: { id: doc.userId },
      data: {
        ...(allApproved ? { kycStatus: 'approved', tier: 'kyc_full' } : {}),
        ...(hasApprovedBank ? { bankVerified: true } : {}),
      },
    })
    // Notify the user about the outcome of this document.
    await this.notifications.create({
      userId: doc.userId,
      type: decision === 'approved' ? 'kyc_doc_approved' : 'kyc_doc_rejected',
      title: decision === 'approved' ? 'Document approved' : 'Document not approved',
      body: decision === 'approved'
        ? `Your ${doc.kind} document was approved`
        : `Your ${doc.kind} document was not approved${adminNote ? `: ${adminNote}` : ''}`,
      data: { route: 'Kyc' },
      category: 'kyc',
    }).catch(() => {})
    return { document: updated, allApproved, hasApprovedBank }
  }

  /** All support tickets (ops console). */
  async tickets() {
    const tickets = await this.prisma.supportTicket.findMany({
      include: { user: { select: { mobile: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return { tickets }
  }

  /** All user reports (trust & safety). */
  async reports() {
    const reports = await this.prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
    })
    return { reports }
  }

  /** Resolve a support ticket. */
  async resolveTicket(id: string, resolution: string, actor: User) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } })
    if (!ticket) throw new NotFoundException('Ticket not found')
    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: { status: 'closed', resolution },
    })
    await this.audit.log({
      actorId: actor.id,
      action: 'ticket.resolve',
      resource: `ticket:${id}`,
      before: { status: ticket.status },
      after: { status: updated.status, resolution },
    })
    return updated
  }

  /** Broadcast a notification to a role (or all). */
  async broadcast(role: string | undefined, title: string, body: string, actor: User) {
    let users: Array<{ id: string }>
    if (role && role !== 'all') {
      if (['supplier', 'transporter', 'driver'].includes(role)) {
        users = await this.prisma.user.findMany({ where: { role: role as never }, take: 1000 })
      } else {
        // Capability targets (forwarder/warehouse/carrier) reach enablement orgs
        // that don't map to a UserRole — match the capabilities array instead.
        users = await this.prisma.user.findMany({
          where: { capabilities: { has: role } as never },
          take: 1000,
        })
      }
    } else {
      users = await this.prisma.user.findMany({ take: 1000 })
    }
    const notifications = await Promise.all(
      users.map((u) =>
        this.prisma.notification.create({
          data: { userId: u.id, type: 'broadcast', title, body },
        }),
      ),
    )
    await this.prisma.broadcast.create({
      data: { role: role && role !== 'all' ? role : null, title, body, sentTo: notifications.length },
    })
    await this.audit.log({
      actorId: actor.id,
      action: 'broadcast.send',
      resource: `broadcast`,
      after: { role: role ?? 'all', title, sent: notifications.length },
    })
    return { sent: notifications.length }
  }

  /** Recent broadcast history. */
  async broadcasts() {
    const broadcasts = await this.prisma.broadcast.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return { broadcasts }
  }

  /** Rate card management: upsert price per model. */
  async updateRateCard(modelId: string, pricePerKm: number, actor: User) {
    const existing = await this.prisma.rateCard.findFirst({ where: { modelId, status: true } })
    const updated = existing
      ? await this.prisma.rateCard.update({ where: { id: existing.id }, data: { pricePerKm } })
      : await this.prisma.rateCard.create({ data: { modelId, pricePerKm } })
    await this.audit.log({
      actorId: actor.id,
      action: 'rate_card.update',
      resource: `model:${modelId}`,
      before: existing ? { pricePerKm: existing.pricePerKm } : null,
      after: { pricePerKm: updated.pricePerKm },
    })
    return updated
  }

  async createTruckModel(input: { type: string; model: string; capacities?: number[]; pricePerKm?: number }, actor: User) {
    const validTypes = ['open', 'container', 'trailer']
    if (!validTypes.includes(input.type)) throw new BadRequestException('Invalid truck type')
    if (!input.model?.trim()) throw new BadRequestException('Model name is required')
    const model = await this.prisma.vehicleModel.upsert({
      where: { type_model: { type: input.type as TruckType, model: input.model.trim() } },
      update: {},
      create: { type: input.type as TruckType, model: input.model.trim(), capacities: input.capacities ?? [] },
    })
    let rateCard = await this.prisma.rateCard.findFirst({ where: { modelId: model.id, status: true } })
    if (input.pricePerKm != null && input.pricePerKm > 0) {
      rateCard = rateCard
        ? await this.prisma.rateCard.update({ where: { id: rateCard.id }, data: { pricePerKm: input.pricePerKm } })
        : await this.prisma.rateCard.create({ data: { modelId: model.id, pricePerKm: input.pricePerKm } })
    }
    await this.audit.log({
      actorId: actor.id,
      action: 'truck_model.create',
      resource: model.id,
      after: { type: model.type, model: model.model, pricePerKm: rateCard?.pricePerKm },
    })
    return { model, rateCard: rateCard ?? null }
  }

  async verify(userId: string, actor: User, capability?: 'supplier' | 'transporter') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')

    // Per-capability verification: a both-capability user can be verified on one side only.
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        verified: true,
        kycStatus: 'approved',
        tier: 'kyc_full',
        ...(capability === 'supplier' ? { supplierVerified: true } : {}),
        ...(capability === 'transporter' ? { transporterVerified: true } : {}),
        ...(!capability ? { supplierVerified: true, transporterVerified: true } : {}),
      },
    })
    await this.audit.log({
      actorId: actor.id,
      action: 'user.verify',
      resource: `user:${userId}${capability ? `:${capability}` : ''}`,
      before: { verified: user.verified, kycStatus: user.kycStatus },
      after: { verified: updated.verified, kycStatus: updated.kycStatus, capability },
    })
    return updated
  }

  async reject(userId: string, actor: User, capability?: 'supplier' | 'transporter') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        verified: false,
        kycStatus: 'rejected',
        tier: 'kyc_lite',
        ...(capability === 'supplier' ? { supplierVerified: false } : {}),
        ...(capability === 'transporter' ? { transporterVerified: false } : {}),
        ...(!capability ? { supplierVerified: false, transporterVerified: false } : {}),
      },
    })
    await this.audit.log({
      actorId: actor.id,
      action: 'user.reject',
      resource: `user:${userId}${capability ? `:${capability}` : ''}`,
      before: { verified: user.verified, kycStatus: user.kycStatus },
      after: { verified: updated.verified, kycStatus: updated.kycStatus, capability },
    })
    return updated
  }

  // ---------- User lifecycle (trust & safety) ----------

  async suspend(userId: string, actor: User) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')
    if (user.role === 'admin') throw new BadRequestException('Cannot suspend an admin')
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { isActive: false } })
    await this.audit.log({
      actorId: actor.id,
      action: 'user.suspend',
      resource: `user:${userId}`,
      before: { isActive: user.isActive },
      after: { isActive: updated.isActive },
    })
    return { user: updated }
  }

  async activate(userId: string, actor: User) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { isActive: true } })
    await this.audit.log({
      actorId: actor.id,
      action: 'user.activate',
      resource: `user:${userId}`,
      before: { isActive: user.isActive },
      after: { isActive: updated.isActive },
    })
    return { user: updated }
  }

  async deleteUser(userId: string, actor: User) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')
    if (user.role === 'admin') throw new BadRequestException('Cannot delete an admin')
    await this.audit.log({
      actorId: actor.id,
      action: 'user.delete',
      resource: `user:${userId}`,
      before: { mobile: user.mobile, role: user.role },
      after: { deleted: true, soft: true },
    })
    // Soft delete: hard-deleting a user cascades through Load → Trip → Payment
    // and destroys the other party's money ledger. Deactivate + anonymize instead.
    const anon = `deleted_${userId.slice(-8)}`
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { isActive: false, mobile: anon, name: 'Deleted user', otpHash: null },
      })
      await tx.supplier.updateMany({ where: { userId }, data: { companyName: 'Deleted user', ownerName: 'Deleted user' } as never })
      await tx.transporter.updateMany({ where: { userId }, data: { companyName: 'Deleted user', ownerName: 'Deleted user' } as never })
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
    })
    return { deleted: true }
  }

  async changeRole(userId: string, role: string, actor: User) {
    // Admins cannot be self/peer-promoted via the console; use a dedicated flow.
    if (!['supplier', 'transporter', 'driver'].includes(role)) {
      throw new BadRequestException('Invalid role')
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('User not found')
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role: role as User['role'] },
    })
    await this.audit.log({
      actorId: actor.id,
      action: 'user.role_change',
      resource: `user:${userId}`,
      before: { role: user.role },
      after: { role: updated.role },
    })
    return { user: updated }
  }

  // ---------- Load / trip moderation ----------

  async cancelLoad(loadId: string, reason: string, actor: User) {
    const load = await this.prisma.load.findUnique({ where: { id: loadId } })
    if (!load) throw new NotFoundException('Load not found')
    if (['cancelled', 'completed', 'delivered'].includes(load.status)) {
      throw new BadRequestException('Cannot cancel a completed or cancelled load')
    }
    // Cancel any active trips and REFUND captured money — mirroring the supplier
    // cancel path, so an admin-cancelled load never strands escrow or leaves a
    // transporter hauling on a cancelled load.
    const activeTrips = await this.prisma.trip.findMany({
      where: { loadId, status: { in: ['accepted', 'in_transit'] } },
      include: { transporter: { include: { user: true } } },
    })
    const updated = await this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.load.update({
        where: { id: loadId },
        data: { status: 'cancelled', cancelReason: reason?.trim() || 'Cancelled by admin' },
      })
      if (activeTrips.length > 0) {
        await tx.trip.updateMany({
          where: { loadId, status: { in: ['accepted', 'in_transit'] } },
          data: { status: 'cancelled' },
        })
      }
      // Reset any committed bids so the truck/load can be re-booked later.
      await tx.bid.updateMany({ where: { loadId }, data: { status: 'withdrawn' } })
      return cancelled
    })
    await this.audit.log({
      actorId: actor.id,
      action: 'load.cancel',
      resource: `load:${loadId}`,
      before: { status: load.status },
      after: { status: updated.status, reason, tripsCancelled: activeTrips.length },
    })
    for (const trip of activeTrips) {
      await this.paymentsService.refundTripCaptures(trip.id).catch(() => {})
      await this.notifications.create({
        userId: trip.transporter.userId,
        type: 'trip_cancelled',
        title: 'Load cancelled by admin',
        body: `Your trip on load #${loadId.slice(-6)} was cancelled by an administrator: ${reason?.trim() || 'policy'}`,
        data: { tripId: trip.id, loadId },
        category: 'trips',
      }).catch(() => {})
    }
    // Keep the canonical Shipment in sync (mirrors ShipmentProjector.syncFromLoad).
    await this.syncShipmentFromLoad(loadId, 'cancelled').catch(() => {})
    return { load: updated }
  }

  async forceCompleteTrip(tripId: string, actor: User) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } })
    if (!trip) throw new NotFoundException('Trip not found')
    if (trip.status === 'delivered' || trip.status === 'cancelled') {
      throw new BadRequestException('Trip is already delivered or cancelled')
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.trip.update({
        where: { id: tripId },
        data: { status: 'delivered', deliveredAt: new Date() },
      })
      await tx.load.update({
        where: { id: trip.loadId },
        data: { status: 'delivered' },
      })
      // Without a confirmed POD, payout is permanently blocked (only the
      // transporter can upload + supplier confirm). Admin force-complete records
      // an admin-confirmed POD so captured money can actually be released.
      const pod = await tx.proofOfDelivery.findUnique({ where: { tripId } })
      if (pod) {
        await tx.proofOfDelivery.update({
          where: { id: pod.id },
          data: { status: 'verified', consigneeConfirmed: true, consigneeConfirmedAt: new Date() },
        })
      } else {
        await tx.proofOfDelivery.create({
          data: { tripId, status: 'verified', consigneeConfirmed: true, consigneeConfirmedAt: new Date() },
        })
      }
      return t
    })
    await this.syncShipmentFromLoad(trip.loadId, 'delivered').catch(() => {})
    await this.audit.log({
      actorId: actor.id,
      action: 'trip.force_complete',
      resource: `trip:${tripId}`,
      before: { status: trip.status },
      after: { status: updated.status, podVerified: true },
    })
    return { trip: updated }
  }

  // ---------- Payments / finance ----------

  async payments(query?: { type?: string; status?: string; q?: string }) {
    const where: Record<string, unknown> = {}
    if (query?.type) where.type = query.type
    if (query?.status) where.status = query.status
    if (query?.q?.trim()) {
      const q = query.q.trim()
      where.OR = [
        { id: { contains: q, mode: 'insensitive' } },
        { trip: { load: { pickupAddr: { contains: q, mode: 'insensitive' } } } },
        { trip: { load: { dropAddr: { contains: q, mode: 'insensitive' } } } },
      ]
    }
    const payments = await this.prisma.payment.findMany({
      where: where as never,
      include: { trip: { include: { load: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return { payments }
  }

  /** Full payment detail with its trip + load info. */
  async paymentDetail(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        trip: {
          include: {
            load: {
              include: {
                material: true,
                supplier: { include: { user: true } },
              },
            },
          },
        },
      },
    })
    if (!payment) throw new NotFoundException('Payment not found')
    return { payment }
  }

  async refund(paymentId: string, actor: User) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } })
    if (!payment) throw new NotFoundException('Payment not found')
    if (payment.type === 'refund') throw new BadRequestException('Already a refund')
    // Only succeeded escrows/payouts can be refunded.
    if (payment.status !== 'succeeded') throw new BadRequestException('Only succeeded payments can be refunded')
    const refundKey = `refund_${paymentId}`
    const existingRefund = await this.prisma.payment.findUnique({ where: { idempotencyKey: refundKey } })
    if (existingRefund) return { refund: existingRefund, alreadyRefunded: true }
    let refunded = false
    if (payment.providerRef) {
      const result = await this.provider.refund({
        amount: payment.amount,
        currency: payment.currency ?? 'INR',
        reference: refundKey,
        originalProviderRef: payment.providerRef,
        metadata: { tripId: payment.tripId ?? '', originalIdempotencyKey: payment.idempotencyKey ?? '' },
      })
      refunded = result.status === 'succeeded'
    } else {
      refunded = true
    }
    const refund = await this.prisma.payment.create({
      data: {
        tripId: payment.tripId,
        type: 'refund',
        amount: payment.amount,
        status: refunded ? 'succeeded' : 'failed',
        method: payment.method,
        providerRef: refunded ? `refund-${payment.providerRef ?? paymentId}` : `refund-failed-${payment.providerRef ?? paymentId}`,
        idempotencyKey: refundKey,
      },
    })
    await this.audit.log({
      actorId: actor.id,
      action: 'payment.refund',
      resource: `payment:${paymentId}`,
      before: { type: payment.type, amount: payment.amount, status: payment.status },
      after: { refundId: refund.id, status: refund.status },
    })
    return { refund }
  }

  // ---------- Reports (trust & safety) ----------

  async actionReport(reportId: string, action: 'dismiss' | 'block', actor: User) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } })
    if (!report) throw new NotFoundException('Report not found')
    if (action === 'dismiss') {
      const updated = await this.prisma.report.update({ where: { id: reportId }, data: { status: 'dismissed' } })
      await this.audit.log({
        actorId: actor.id,
        action: 'report.dismiss',
        resource: `report:${reportId}`,
        before: { status: report.status },
        after: { status: updated.status },
      })
      return { report: updated }
    }
    // block the reported user
    await this.prisma.blockedUser.upsert({
      where: { blockerId_blockedId: { blockerId: actor.id, blockedId: report.reportedId } },
      create: { blockerId: actor.id, blockedId: report.reportedId },
      update: {},
    })
    const updated = await this.prisma.report.update({ where: { id: reportId }, data: { status: 'resolved' } })
    await this.audit.log({
      actorId: actor.id,
      action: 'report.block',
      resource: `report:${reportId}`,
      before: { status: report.status },
      after: { status: updated.status, blocked: report.reportedId },
    })
    return { report: updated, blocked: report.reportedId }
  }

  // ---------- Search + pagination ----------

  async usersSearch(q?: string, page = 1, pageSize = 20) {
    const where: Record<string, unknown> = { role: { in: ['supplier', 'transporter'] } }
    if (q?.trim()) {
      where.OR = [
        { mobile: { contains: q.trim() } },
        { name: { contains: q.trim(), mode: 'insensitive' } },
      ]
    }
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { supplier: true, transporter: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ])
    return { users, total, page, pageSize }
  }

  async ticketsSearch(q?: string, status?: string) {
    const where: Record<string, unknown> = {}
    if (status && status !== 'all') where.status = status
    if (q?.trim()) {
      where.OR = [
        { subject: { contains: q.trim(), mode: 'insensitive' } },
        { message: { contains: q.trim(), mode: 'insensitive' } },
        { user: { mobile: { contains: q.trim() } } },
      ]
    }
    const tickets = await this.prisma.supportTicket.findMany({
      where,
      include: { user: { select: { mobile: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return { tickets }
  }

  // ---------- 360° user detail ----------

  async userDetail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        supplier: true,
        transporter: { include: { vehicles: true } },
        kycDocuments: true,
        notifications: { orderBy: { createdAt: 'desc' }, take: 20 },
        tickets: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    })
    if (!user) throw new NotFoundException('User not found')
    const trips = await this.prisma.trip.findMany({
      where: {
        OR: [
          { transporterId: (user.transporter?.id ?? '__none__') },
          { load: { supplierId: user.supplier?.id ?? '__none__' } },
        ],
      },
      include: { load: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
    const loads = await this.prisma.load.findMany({
      where: { supplierId: user.supplier?.id ?? '__none__' },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
    return { user, trips, loads }
  }

  private async computeMatchRate() {
    const total = await this.prisma.load.count()
    if (total === 0) return 0
    const matched = await this.prisma.load.count({
      where: { status: { in: ['accepted', 'in_transit', 'delivered'] } },
    })
    return Math.round((matched / total) * 100)
  }

  // ---------- Enablement platform (orgs, shipments, plans, claims, webhooks, facilities) ----------

  async organizations() {
    const organizations = await this.prisma.organization.findMany({
      include: { members: { include: { user: { select: { id: true, name: true, mobile: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    const shipmentCounts = await this.prisma.shipment.groupBy({ by: ['ownerOrgId'], _count: { _all: true } })
    const countByOrg = Object.fromEntries(shipmentCounts.map((s) => [s.ownerOrgId, s._count._all]))
    return {
      organizations: organizations.map((o) => ({ ...o, shipmentCount: countByOrg[o.id] ?? 0 })),
    }
  }

  async allShipments(query?: { status?: string; ownerOrgId?: string }) {
    const where: Record<string, unknown> = {}
    if (query?.status) where.status = query.status
    if (query?.ownerOrgId) where.ownerOrgId = query.ownerOrgId
    const [shipments, total] = await Promise.all([
      this.prisma.shipment.findMany({
        where,
        include: { legs: { orderBy: { sequence: 'asc' } }, ownerOrg: true, activePlan: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.shipment.count({ where }),
    ])
    return { shipments, total }
  }

  async plans(shipmentId?: string) {
    const plans = await this.prisma.plan.findMany({
      where: shipmentId ? { shipmentId } : {},
      include: { shipment: { select: { id: true, ref: true, commodity: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { plans }
  }

  async claims(status?: string) {
    const claims = await this.prisma.claim.findMany({
      where: status ? { status } : {},
      include: { shipment: { select: { id: true, ref: true, commodity: true } }, claimant: true, handler: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { claims }
  }

  async webhooks() {
    const webhooks = await this.prisma.webhookSubscription.findMany({
      include: { org: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { webhooks: webhooks.map(({ secret: _s, ...w }) => w) }
  }

  async webhookDeliveries(status?: string) {
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: status ? { status } : {},
      include: { subscription: { include: { org: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { deliveries }
  }

  async facilities() {
    const facilities = await this.prisma.facility.findMany({
      include: { operator: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { facilities }
  }

  async consolidations() {
    const consolidations = await this.prisma.consolidation.findMany({
      include: { forwarder: true, orders: { include: { shipment: true } }, bookedCarrier: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { consolidations }
  }

  async settlements() {
    const settlements = await this.prisma.settlement.findMany({
      include: { shipment: { select: { id: true, ref: true } }, payer: true, payee: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { settlements }
  }

  // ---------- Enablement admin actions ----------

  /** Verify an organization (trust signal for onboarding), optionally per-kind. */
  async verifyOrganization(orgId: string, verified: boolean, actor: User, capability?: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } })
    if (!org) throw new NotFoundException('Organization not found')
    const current: string[] = (org.verifiedCapabilities as string[] | null) ?? []
    let verifiedCapabilities = current
    if (capability) {
      verifiedCapabilities = verified ? [...new Set([...current, capability])] : current.filter((c) => c !== capability)
    }
    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        verified: verified || verifiedCapabilities.length > 0,
        verifiedCapabilities: verifiedCapabilities as never,
      },
    })
    await this.audit.log({
      actorId: actor.id,
      action: `org_${verified ? 'verify' : 'unverify'}${capability ? `:${capability}` : ''}`,
      resource: orgId,
      after: { verifiedCapabilities },
    })
    return { organization: updated }
  }

  /** Force-transition a shipment's status (admin override of the whitelist). */
  async forceShipmentStatus(shipmentId: string, status: string, actor: User) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } })
    if (!shipment) throw new NotFoundException('Shipment not found')
    const updated = await this.prisma.shipment.update({ where: { id: shipmentId }, data: { status: status as never } })
    await this.audit.log({
      actorId: actor.id,
      action: 'shipment_force_status',
      resource: shipmentId,
      before: { status: shipment.status },
      after: { status },
    })
    return { shipment: updated }
  }

  /** Admin decide on a claim (approve/reject) regardless of org membership. */
  async decideClaim(claimId: string, decision: 'approved' | 'rejected', notes: string | undefined, actor: User) {
    const claim = await this.prisma.claim.findUnique({ where: { id: claimId } })
    if (!claim) throw new NotFoundException('Claim not found')
    if (!['filed', 'assessed'].includes(claim.status)) throw new BadRequestException(`Cannot decide a ${claim.status} claim`)
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.claim.update({
        where: { id: claimId },
        data: { status: decision, decision, decidedBy: actor.id, decidedAt: new Date(), notes: notes ?? claim.notes },
      })
      if (decision === 'approved' && claim.amount) {
        // Charge the actually-liable org (insurer / booked carrier), never the
        // handler that reviewed the claim.
        const policy = await tx.insurancePolicy.findFirst({
          where: { shipmentId: claim.shipmentId, status: { in: ['active', 'claimed'] } },
          select: { insurerId: true },
        })
        const booking = policy?.insurerId
          ? null
          : await tx.carrierBooking.findFirst({ where: { shipmentId: claim.shipmentId }, select: { carrierId: true } })
        const liableOrg = policy?.insurerId ?? booking?.carrierId ?? null
        // Same integrity guards as the org path: no double-settlement and the
        // payout is capped at the liable policy's remaining coverage.
        const existingSettlement = await tx.settlement.findFirst({
          where: { shipmentId: claim.shipmentId, type: 'claim', status: { in: ['due', 'cleared'] } },
        })
        if (existingSettlement) {
          throw new BadRequestException('A claim settlement already exists on this shipment')
        }
        let payoutAmount = claim.amount
        if (liableOrg) {
          const insurerPolicy = await tx.insurancePolicy.findFirst({
            where: { shipmentId: claim.shipmentId, insurerId: liableOrg },
            select: { coverage: true },
          })
          if (insurerPolicy?.coverage != null) {
            const paid = await tx.settlement.aggregate({
              where: { shipmentId: claim.shipmentId, type: 'claim', payeeId: claim.claimantId ?? undefined, status: { in: ['due', 'cleared'] } },
              _sum: { amount: true },
            })
            const remaining = Math.max(0, insurerPolicy.coverage - (paid._sum.amount ?? 0))
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
        await tx.insurancePolicy.updateMany({
          where: { shipmentId: claim.shipmentId, status: 'active' },
          data: { status: 'claimed' },
        })
      }
      return changed
    })
    await this.audit.log({ actorId: actor.id, action: `claim_${decision}`, resource: claimId })
    return { claim: updated }
  }

  /** Admin clear a settlement (reconciliation override). */
  async clearSettlement(settlementId: string, actor: User) {
    const settlement = await this.prisma.settlement.findUnique({ where: { id: settlementId } })
    if (!settlement) throw new NotFoundException('Settlement not found')
    if (settlement.status === 'cleared') throw new BadRequestException('Settlement already cleared')
    const amount = settlement.amount ?? 0
    if (amount <= 0) throw new BadRequestException('Settlement has no amount to collect')
    const idempotencyKey = `settlement_${settlementId}`
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } })
    if (existing && existing.status === 'succeeded') {
      return { settlement: { ...settlement, status: 'cleared', settledAt: settlement.settledAt }, payment: existing, alreadyPaid: true }
    }
    // A failed capture must be retryable — release the idempotency slot.
    if (existing && existing.status === 'failed') {
      await this.prisma.payment.delete({ where: { id: existing.id } })
    }
    const result = await this.provider.capture({
      amount,
      currency: settlement.currency || 'INR',
      reference: idempotencyKey,
      metadata: { settlementId, shipmentId: settlement.shipmentId },
    })
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
      // Only a succeeded capture clears the settlement; a failed capture keeps
      // it due so the money can actually be collected on a retry.
      const changed = await tx.settlement.update({
        where: { id: settlementId },
        data: result.status === 'succeeded' ? { status: 'cleared', settledAt: new Date() } : { status: settlement.status },
      })
      return { changed, payment }
    })
    await this.audit.log({ actorId: actor.id, action: 'settlement_clear', resource: settlementId })
    return { settlement: updated.changed, payment: updated.payment }
  }

  /** Admin decline/supersede a selected plan. */
  async cancelPlan(planId: string, actor: User) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } })
    if (!plan) throw new NotFoundException('Plan not found')
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.plan.update({ where: { id: planId }, data: { status: 'declined' } })
      if (plan.status === 'selected') {
        await tx.shipment.update({ where: { id: plan.shipmentId }, data: { activePlanId: null } })
      }
      return changed
    })
    await this.audit.log({ actorId: actor.id, action: 'plan_cancel', resource: planId })
    return { plan: updated }
  }

  /** Admin pause/resume a webhook. */
  async setWebhookStatus(webhookId: string, status: 'active' | 'paused', actor: User) {
    const webhook = await this.prisma.webhookSubscription.findUnique({ where: { id: webhookId } })
    if (!webhook) throw new NotFoundException('Webhook not found')
    const updated = await this.prisma.webhookSubscription.update({ where: { id: webhookId }, data: { status } })
    await this.audit.log({ actorId: actor.id, action: `webhook_${status}`, resource: webhookId })
    return { webhook: updated }
  }

  /** Admin retry a failed webhook delivery. */
  async retryWebhookDelivery(deliveryId: string, actor: User) {
    const delivery = await this.prisma.webhookDelivery.findUnique({ where: { id: deliveryId } })
    if (!delivery) throw new NotFoundException('Delivery not found')
    const updated = await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'pending', attempts: 0, nextRetryAt: null, responseStatus: null },
    })
    await this.audit.log({ actorId: actor.id, action: 'webhook_retry', resource: deliveryId })
    return { delivery: updated }
  }

  /** Dashboard KPIs including enablement counts. */
  async enablementDashboard() {
    const [organizations, shipments, plans, claims, webhookDeliveries, settlements, facilities, consolidations] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.shipment.count(),
      this.prisma.plan.count(),
      this.prisma.claim.count(),
      this.prisma.webhookDelivery.count(),
      this.prisma.settlement.count(),
      this.prisma.facility.count(),
      this.prisma.consolidation.count(),
    ])
    const claimOpen = await this.prisma.claim.count({ where: { status: { in: ['filed', 'assessed'] } } })
    const webhookFailed = await this.prisma.webhookDelivery.count({ where: { status: { in: ['failed', 'dead'] } } })
    return {
      organizations, shipments, plans, claims, claimOpen,
      webhookDeliveries, webhookFailed, settlements, facilities, consolidations,
    }
  }

  // ---------- Marketplace oversight ----------

  async marketListings(query?: { kind?: string; status?: string }) {
    const where: Record<string, unknown> = {}
    if (query?.kind) where.kind = query.kind
    if (query?.status) where.status = query.status
    const listings = await this.prisma.marketListing.findMany({
      where: where as never,
      include: { providerOrg: { select: { id: true, name: true, kind: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { listings }
  }

  async marketRequests(query?: { kind?: string; status?: string }) {
    const where: Record<string, unknown> = {}
    if (query?.kind) where.kind = query.kind
    if (query?.status) where.status = query.status
    const requests = await this.prisma.marketRequest.findMany({
      where: where as never,
      include: { requesterOrg: { select: { id: true, name: true, kind: true } }, quotes: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { requests }
  }

  async marketStats() {
    const [listings, liveListings, requests, openRequests, quotes, ratings, carrierServices] = await Promise.all([
      this.prisma.marketListing.count(),
      this.prisma.marketListing.count({ where: { status: 'live' } }),
      this.prisma.marketRequest.count(),
      this.prisma.marketRequest.count({ where: { status: 'open' } }),
      this.prisma.marketQuote.count(),
      this.prisma.orgRating.count(),
      this.prisma.carrierService.count(),
    ])
    return { listings, liveListings, requests, openRequests, quotes, ratings, carrierServices }
  }

  /** Admin moderation: pause a listing. */
  async pauseListing(listingId: string, actor: User) {
    const listing = await this.prisma.marketListing.findUnique({ where: { id: listingId } })
    if (!listing) throw new NotFoundException('Listing not found')
    const updated = await this.prisma.marketListing.update({ where: { id: listingId }, data: { status: 'paused' } })
    await this.audit.log({ actorId: actor.id, action: 'listing_pause', resource: listingId })
    return { listing: updated }
  }

  /** Admin: all quotes + ratings for marketplace health. */
  async marketQuotes(query?: { status?: string }) {
    const quotes = await this.prisma.marketQuote.findMany({
      where: query?.status ? { status: query.status } : {},
      include: { providerOrg: { select: { id: true, name: true } }, request: { select: { id: true, kind: true, status: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { quotes }
  }

  /** Admin moderation: remove a quote (fraud/abuse). */
  async deleteQuote(quoteId: string, actor: User) {
    const quote = await this.prisma.marketQuote.findUnique({ where: { id: quoteId } })
    if (!quote) throw new NotFoundException('Quote not found')
    await this.prisma.marketQuote.delete({ where: { id: quoteId } })
    await this.audit.log({ actorId: actor.id, action: 'quote_delete', resource: quoteId, after: { requestId: quote.requestId } })
    return { deleted: true }
  }

  /** Admin: carrier services (vessel/flight slots) for moderation oversight. */
  async carrierServices(query?: { status?: string }) {
    const services = await this.prisma.carrierService.findMany({
      where: query?.status ? { status: query.status } : {},
      include: { carrierOrg: { select: { id: true, name: true } }, lane: { select: { originRef: true, destinationRef: true, mode: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { services }
  }

  /** Admin moderation: cancel a carrier service (fraud/no-show/misbooking). */
  async cancelCarrierService(serviceId: string, actor: User) {
    const service = await this.prisma.carrierService.findUnique({ where: { id: serviceId } })
    if (!service) throw new NotFoundException('Carrier service not found')
    const updated = await this.prisma.carrierService.update({ where: { id: serviceId }, data: { status: 'cancelled' } })
    await this.audit.log({ actorId: actor.id, action: 'carrier_service_cancel', resource: serviceId, after: { lane: `${service.originRef}→${service.destinationRef}` } })
    return { service: updated }
  }

  /** Admin: recent AI recommendations (marketplace intelligence). */
  async aiRecommendations() {
    const recommendations = await this.prisma.aiRecommendation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { recommendations }
  }

  async marketRatings() {
    const ratings = await this.prisma.orgRating.findMany({
      include: { subjectOrg: { select: { id: true, name: true, kind: true } }, giverOrg: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { ratings }
  }

  /** Marketplace analytics: liquidity + top lanes + activity trend. */
  async marketAnalytics() {
    const [listings, requests, quotes, ratings, bookings] = await Promise.all([
      this.prisma.marketListing.count(),
      this.prisma.marketRequest.count(),
      this.prisma.marketQuote.count(),
      this.prisma.orgRating.count(),
      this.prisma.carrierBooking.count(),
    ])
    // Top lanes by listing+request volume.
    const lanes = await this.prisma.lane.findMany({
      include: { _count: { select: { listings: true, requests: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    const topLanes = lanes
      .map((l) => ({ origin: l.originRef, destination: l.destinationRef, mode: l.mode, volume: l._count.listings + l._count.requests }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 8)
    // Weekly activity trend.
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentRequests = await this.prisma.marketRequest.count({ where: { createdAt: { gte: since } } })
    const recentQuotes = await this.prisma.marketQuote.count({ where: { createdAt: { gte: since } } })
    return {
      totals: { listings, requests, quotes, ratings, bookings },
      topLanes,
      trend7d: { requests: recentRequests, quotes: recentQuotes },
      liquidityRatio: requests > 0 ? Math.round((quotes / requests) * 100) : 0,
    }
  }

  // ---------- Operations control tower ----------

  /** Live ops triage: open exceptions, at-risk trips, dwell, dead letters. */
  async opsTriage() {
    const [openExceptions, atRiskTrips, dwellOps, deadOutbox, deadWebhooks, staleTrips, recentHealth] = await Promise.all([
      // Open driver/supplier-reported exceptions.
      this.prisma.tripException.findMany({
        where: { status: 'open' },
        include: { trip: { include: { load: { select: { pickupAddr: true, dropAddr: true } } } } },
        orderBy: { createdAt: 'asc' },
        take: 50,
      }),
      // Trips the trip-health agent flagged at_risk/critical (latest per trip).
      this.atRiskTrips(),
      // Warehouse ops currently inside the gate cycle — dwell = time since gate-in.
      this.dwellOperations(),
      // Dead-lettered outbox messages (never delivered).
      this.prisma.outboxMessage.findMany({
        where: { status: 'dead' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      // Dead-lettered webhook deliveries.
      this.prisma.webhookDelivery.findMany({
        where: { status: 'dead' },
        include: { subscription: { include: { org: { select: { id: true, name: true } } } } },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      // In-transit trips with no location evidence in 30+ min.
      this.staleTrips(),
      // Latest trip-health recommendations.
      this.prisma.aiRecommendation.findMany({
        where: { agent: 'trip-health' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ])

    const counts = {
      openExceptions: openExceptions.length,
      atRiskTrips: atRiskTrips.length,
      dwellOps: dwellOps.length,
      deadOutbox: await this.prisma.outboxMessage.count({ where: { status: 'dead' } }),
      deadWebhooks: await this.prisma.webhookDelivery.count({ where: { status: 'dead' } }),
      staleTrips: staleTrips.length,
    }

    return { counts, openExceptions, atRiskTrips, dwellOps, deadOutbox, deadWebhooks, staleTrips, recentHealth }
  }

  /** Latest trip-health recommendation per at-risk trip (score below watch). */
  private async atRiskTrips() {
    const recs = await this.prisma.aiRecommendation.findMany({
      where: { agent: 'trip-health', status: 'proposed' },
      orderBy: { createdAt: 'desc' },
      take: 300,
    })
    const latest = new Map<string, (typeof recs)[number]>()
    for (const r of recs) {
      const key = r.entityId
      if (!latest.has(key)) latest.set(key, r)
    }
    return [...latest.values()]
      .filter((r) => (r.score ?? 1) < 0.55)
      .map((r) => {
        const out = r.output as { band?: string; etaMinutes?: number | null; progress?: number; flags?: Array<{ kind: string; severity: string; message: string }> }
        return {
          recommendationId: r.id,
          tripId: r.entityId,
          score: r.score,
          band: out.band ?? 'unknown',
          etaMinutes: out.etaMinutes ?? null,
          progress: out.progress ?? 0,
          flags: out.flags ?? [],
          createdAt: r.createdAt,
        }
      })
      .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
      .slice(0, 50)
  }

  /** Warehouse ops inside the gate cycle, ranked by dwell duration. */
  private async dwellOperations() {
    const ops = await this.prisma.warehouseOperation.findMany({
      where: { status: { in: ['gate_in', 'receive', 'put_away', 'stored', 'pick', 'stage', 'load'] } },
      include: { facility: { select: { id: true, name: true, city: true } }, shipment: { select: { id: true, ref: true } } },
      orderBy: { gateInAt: 'asc' },
      take: 100,
    })
    return ops
      .map((op) => {
        const anchor = op.gateInAt ?? op.appointmentAt ?? op.createdAt
        const dwellH = Math.max(0, Math.round(((Date.now() - anchor.getTime()) / 3_600_000) * 10) / 10)
        return { id: op.id, ref: op.ref, status: op.status, facility: op.facility, shipmentRef: op.shipment?.ref ?? null, dwellHours: dwellH, anchor }
      })
      .sort((a, b) => b.dwellHours - a.dwellHours)
      .slice(0, 20)
  }

  /** In-transit trips whose last location is 30+ min old (likely no-ping). */
  private async staleTrips() {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000)
    const trips = await this.prisma.trip.findMany({
      where: { status: 'in_transit', startedAt: { not: null } },
      include: { load: { select: { pickupAddr: true, dropAddr: true } }, locations: { orderBy: { recordedAt: 'desc' }, take: 1 } },
      take: 200,
    })
    return trips
      .filter((t) => !t.locations.length || t.locations[0]!.recordedAt < cutoff)
      .map((t) => ({
        tripId: t.id,
        pickup: t.load.pickupAddr,
        drop: t.load.dropAddr,
        lastPingAt: t.locations[0]?.recordedAt ?? null,
      }))
      .slice(0, 50)
  }

  /** Ops: resolve an open trip exception with an audit trail. */
  async resolveException(id: string, actor: User, note?: string) {
    const exception = await this.prisma.tripException.findUnique({ where: { id } })
    if (!exception) throw new NotFoundException('Exception not found')
    if (exception.status === 'resolved') throw new BadRequestException('Exception already resolved')
    const updated = await this.prisma.tripException.update({
      where: { id },
      data: { status: 'resolved', resolvedAt: new Date(), notes: note?.trim() || exception.notes },
    })
    await this.audit.log({
      actorId: actor.id,
      action: 'exception.resolve',
      resource: `exception:${id}`,
      before: { status: exception.status },
      after: { status: 'resolved', note: note?.trim() ?? null },
    })
    // Notify the reporter that ops has acted on their report.
    const reporter = await this.prisma.user.findUnique({ where: { id: exception.reporterId } })
    if (reporter) {
      await this.notifications.create({
        userId: reporter.id,
        type: 'exception_resolved',
        title: 'Exception resolved by Wagon Ops',
        body: note?.trim() || `${exception.title} has been marked resolved`,
        data: { exceptionId: id, tripId: exception.tripId },
        category: 'trips',
      })
    }
    return { exception: updated }
  }

  /** Ops: nudge the transporter (and supplier) about a trip — a human-acknowledged
   *  action with a preference-aware notification, not an automated state change. */
  async nudgeTrip(tripId: string, actor: User, message: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { load: true } })
    if (!trip) throw new NotFoundException('Trip not found')
    const msg = message?.trim()
    if (!msg) throw new BadRequestException('Nudge message is required')
    const [transporter, supplier] = await Promise.all([
      this.prisma.transporter.findUnique({ where: { id: trip.transporterId }, include: { user: true } }),
      this.prisma.supplier.findUnique({ where: { id: trip.load.supplierId }, include: { user: true } }),
    ])
    await this.audit.log({
      actorId: actor.id,
      action: 'trip.nudge',
      resource: `trip:${tripId}`,
      after: { message: msg, notified: [transporter?.user.id, supplier?.user.id].filter(Boolean) },
    })
    const notify = async (user?: { id: string } | null) => {
      if (!user) return
      await this.notifications.create({
        userId: user.id,
        type: 'ops_nudge',
        title: 'Wagon Ops needs your attention',
        body: msg,
        data: { tripId, loadId: trip.loadId },
        category: 'trips',
      })
    }
    await Promise.all([notify(transporter?.user), notify(supplier?.user)])
    return { notified: [transporter?.user.id, supplier?.user.id].filter(Boolean).length }
  }

  /** Ops: live position + GPS history for a trip (admin bypasses participant scoping). */
  async tripTracking(tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { load: { select: { pickupAddr: true, dropAddr: true, pickupLat: true, pickupLng: true, dropLat: true, dropLng: true } } },
    })
    if (!trip) throw new NotFoundException('Trip not found')
    const [latest, history] = await Promise.all([
      this.prisma.tripLocation.findFirst({ where: { tripId }, orderBy: { recordedAt: 'desc' } }),
      this.prisma.tripLocation.findMany({ where: { tripId }, orderBy: { recordedAt: 'asc' }, take: 500 }),
    ])
    return { trip, latest, history }
  }

  /** Admin recovery: reset a dead/failed outbox message back to pending. */
  async retryOutbox(id: string, actor: User) {
    const msg = await this.prisma.outboxMessage.findUnique({ where: { id } })
    if (!msg) throw new NotFoundException('Outbox message not found')
    if (!['dead', 'failed'].includes(msg.status)) throw new BadRequestException('Only dead/failed messages can be retried')
    const updated = await this.prisma.outboxMessage.update({
      where: { id },
      data: { status: 'pending', attempts: 0, lastError: null, nextRetryAt: null },
    })
    await this.audit.log({ actorId: actor.id, action: 'outbox_retry', resource: id, before: { status: msg.status }, after: { status: 'pending' } })
    return { message: updated }
  }

  /** Admin recovery: bulk-retry all dead outbox messages. */
  async retryAllDeadOutbox(actor: User) {
    const res = await this.prisma.outboxMessage.updateMany({
      where: { status: 'dead' },
      data: { status: 'pending', attempts: 0, lastError: null, nextRetryAt: null },
    })
    await this.audit.log({ actorId: actor.id, action: 'outbox_retry_all', resource: 'outbox', after: { count: res.count } })
    return { retried: res.count }
  }

  /** Mirror an admin load-status change onto the canonical Shipment (parity with the projector). */
  private async syncShipmentFromLoad(loadId: string, status: string) {
    const shipment = await this.prisma.shipment.findFirst({ where: { ref: loadId } })
    if (!shipment) return null
    const map: Record<string, string> = { delivered: 'delivered', cancelled: 'cancelled', posted: 'planned', accepted: 'booked', in_transit: 'in_transit' }
    const shipmentStatus = map[status] ?? shipment.status
    await this.prisma.shipment.update({ where: { id: shipment.id }, data: { status: shipmentStatus as never } })
    await this.prisma.shipmentLeg.updateMany({ where: { shipmentId: shipment.id, sequence: 1 }, data: { status: shipmentStatus as never } })
    return shipment
  }
}
