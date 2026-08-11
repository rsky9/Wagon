import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { UploadsService } from '../uploads/uploads.service'
import { NotificationsService } from '../notifications/notifications.service'
import type { User } from '@prisma/client'

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly uploads: UploadsService,
    private readonly notifications: NotificationsService,
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
    await this.audit.log({
      actorId: actor.id,
      action: 'broadcast.send',
      resource: `broadcast`,
      after: { role: role ?? 'all', title, sent: notifications.length },
    })
    return { sent: notifications.length }
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
}
