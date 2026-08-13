import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { UploadsService } from '../uploads/uploads.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PAYMENT_PROVIDER, PaymentProvider } from '../payments/payment-provider.service'
import type { User } from '@prisma/client'

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
    private readonly notifications: NotificationsService,
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

  async loads(query?: { status?: string }) {
    const where = query?.status ? { status: query.status as never } : undefined
    const loads = await this.prisma.load.findMany({
      where,
      include: { material: true, supplier: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { loads }
  }

  async trips() {
    const trips = await this.prisma.trip.findMany({
      include: { load: { include: { material: true } }, payments: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
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
    const where = role && role !== 'all' ? { role: role as never } : undefined
    const users = await this.prisma.user.findMany({ where, take: 1000 })
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
      after: { deleted: true },
    })
    await this.prisma.user.delete({ where: { id: userId } }).catch(async () => {
      await this.prisma.user.update({ where: { id: userId }, data: { isActive: false } })
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
    const updated = await this.prisma.load.update({
      where: { id: loadId },
      data: { status: 'cancelled', cancelReason: reason?.trim() || 'Cancelled by admin' },
    })
    await this.audit.log({
      actorId: actor.id,
      action: 'load.cancel',
      resource: `load:${loadId}`,
      before: { status: load.status },
      after: { status: updated.status, reason },
    })
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
    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: { status: 'delivered', deliveredAt: new Date() },
    })
    await this.prisma.load.update({
      where: { id: trip.loadId },
      data: { status: 'delivered' },
    })
    await this.syncShipmentFromLoad(trip.loadId, 'delivered').catch(() => {})
    await this.audit.log({
      actorId: actor.id,
      action: 'trip.force_complete',
      resource: `trip:${tripId}`,
      before: { status: trip.status },
      after: { status: updated.status },
    })
    return { trip: updated }
  }

  // ---------- Payments / finance ----------

  async payments(query?: { type?: string; status?: string }) {
    const where: Record<string, unknown> = {}
    if (query?.type) where.type = query.type
    if (query?.status) where.status = query.status
    const payments = await this.prisma.payment.findMany({
      where,
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
    const refund = await this.prisma.payment.create({
      data: {
        tripId: payment.tripId,
        type: 'refund',
        amount: payment.amount,
        status: 'succeeded',
        method: payment.method,
        idempotencyKey: `refund_${paymentId}`,
      },
    })
    await this.audit.log({
      actorId: actor.id,
      action: 'payment.refund',
      resource: `payment:${paymentId}`,
      before: { type: payment.type, amount: payment.amount, status: payment.status },
      after: { refundId: refund.id },
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
        await tx.settlement.create({
          data: {
            shipmentId: claim.shipmentId,
            payerId: claim.handlerId ?? undefined,
            payeeId: claim.claimantId ?? undefined,
            type: 'claim',
            amount: claim.amount,
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
    if (existing) {
      return { settlement: { ...settlement, status: 'cleared', settledAt: settlement.settledAt }, payment: existing, alreadyPaid: true }
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
      const changed = await tx.settlement.update({
        where: { id: settlementId },
        data: { status: 'cleared', settledAt: new Date() },
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

  async marketRatings() {
    const ratings = await this.prisma.orgRating.findMany({
      include: { subjectOrg: { select: { id: true, name: true, kind: true } }, giverOrg: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { ratings }
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
