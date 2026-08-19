import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { OrgAccessService } from '../org-access/org-access.service'
import type { User } from '@prisma/client'

const INVOICE_TRANSITIONS: Record<string, string[]> = {
  draft: ['issued', 'cancelled'],
  issued: ['disputed', 'approved', 'paid'],
  disputed: ['approved', 'issued'],
  approved: ['paid'],
  paid: [],
  cancelled: [],
}

/** GST 5% / TDS 2% — mirrors the payment-side tax engine so invoice === reality. */
function taxBreakdown(base: number) {
  const gstRate = 0.05
  const tdsRate = 0.02
  const gstAmount = Math.round(base * gstRate * 100) / 100
  const tdsAmount = Math.round(base * tdsRate * 100) / 100
  const net = Math.round((base + gstAmount - tdsAmount) * 100) / 100
  return { base, gstRate, tdsRate, gstAmount, tdsAmount, net }
}

const ACCESSORIAL_KINDS = [
  'fuel_surcharge',
  'waiting',
  'detention',
  'demurrage',
  'toll',
  'loading',
  'unloading',
  'storage',
  'handling',
  'customs',
  'insurance',
  'special_equipment',
  'accessorial',
]

interface InvoiceInput {
  tripId?: string
  shipmentId?: string
  type?: string
  baseAmount?: number
  currency?: string
  dueDate?: string
  accessorials?: Array<{ kind: string; description?: string; qty?: number; rate?: number; amount: number }>
  billToOrgId?: string
  billFromOrgId?: string
}

@Injectable()
export class InvoicingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orgAccess: OrgAccessService,
  ) {}

  /** The org that will bill (transporter for freight on a road trip). */
  private async billingOrgFor(user: User) {
    const orgs = await this.orgAccess.userOrgs(user)
    if (orgs.length === 0) throw new BadRequestException('Complete organization onboarding to invoice')
    return orgs[0]!
  }

  private async requireInvoiceAccess(user: User, invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } })
    if (!invoice) throw new NotFoundException('Invoice not found')
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    if (isAdmin) return invoice
    const biller = invoice.billFromOrgId ? await this.orgAccess.isMember(user, invoice.billFromOrgId) : false
    const billTo = invoice.billToOrgId ? await this.orgAccess.isMember(user, invoice.billToOrgId) : false
    if (!biller && !billTo) throw new ForbiddenException('Not a party to this invoice')
    return invoice
  }

  /** Persist an invoice derived from an executed trip (freight + accessorials + tax). */
  async create(input: InvoiceInput, user: User) {
    if (!input.tripId && !input.shipmentId) {
      throw new BadRequestException('tripId or shipmentId is required')
    }
    const trip = input.tripId
      ? await this.prisma.trip.findUnique({
          where: { id: input.tripId },
          include: { load: { include: { supplier: true } }, booking: true, payments: true, transporter: true },
        })
      : null
    if (input.tripId && !trip) throw new NotFoundException('Trip not found')

    // Resolve billing orgs from each party's organization memberships.
    const resolveOrg = async (userId?: string | null) => {
      if (!userId) return null
      const member = await this.prisma.organizationMember.findFirst({
        where: { userId },
        include: { organization: true },
        orderBy: { createdAt: 'asc' },
      })
      return member?.organization.id ?? null
    }
    const billFromOrgId = input.billFromOrgId ?? (await resolveOrg(trip?.transporter.userId)) ?? (await this.billingOrgFor(user)).id
    const billToOrgId = input.billToOrgId ?? (await resolveOrg(trip?.load.supplier.userId)) ?? null

    const base = input.baseAmount ?? trip?.booking?.rate ?? trip?.load.fareEstimate ?? 0
    const tax = taxBreakdown(base)
    const accessorials = (input.accessorials ?? []).map((a) => {
      if (!ACCESSORIAL_KINDS.includes(a.kind)) throw new BadRequestException(`Unknown accessorial ${a.kind}`)
      return { kind: a.kind, description: a.description, qty: a.qty, rate: a.rate, amount: a.amount }
    })
    const accessorialTotal = Math.round(accessorials.reduce((s, a) => s + a.amount, 0) * 100) / 100
    const net = Math.round((tax.net + accessorialTotal) * 100) / 100

    const ref = input.tripId ?? input.shipmentId!
    const invoiceNo = `INV-${ref.slice(-8).toUpperCase()}-${Math.floor(Math.random() * 90 + 10)}`
    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNo,
        type: input.type ?? 'freight',
        tripId: input.tripId,
        shipmentId: input.shipmentId,
        billFromOrgId,
        billToOrgId,
        baseAmount: base,
        gstAmount: tax.gstAmount,
        tdsAmount: tax.tdsAmount,
        netAmount: net,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        lines: {
          create: [
            { kind: 'base_freight', description: 'Base freight', qty: 1, rate: base, amount: base },
            { kind: 'gst', description: `GST @ ${Math.round(tax.gstRate * 100)}%`, amount: tax.gstAmount },
            { kind: 'tds', description: `TDS @ ${Math.round(tax.tdsRate * 100)}%`, amount: tax.tdsAmount },
            ...accessorials,
          ],
        },
      },
      include: { lines: true, trip: { include: { load: { select: { pickupAddr: true, dropAddr: true } } } } },
    })
    await this.audit.log({ actorId: user.id, action: 'invoice.create', resource: invoice.id, after: { net, invoiceNo } })
    return { invoice }
  }

  async list(user: User, query?: { status?: string; type?: string }) {
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    const where: Record<string, unknown> = {}
    if (query?.status) where.status = query.status
    if (query?.type) where.type = query.type
    if (!isAdmin) {
      const orgIds = await this.orgAccess.memberOrgIds(user)
      where.OR = [{ billFromOrgId: { in: orgIds } }, { billToOrgId: { in: orgIds } }]
    }
    const invoices = await this.prisma.invoice.findMany({
      where: where as never,
      include: {
        lines: true,
        billFromOrg: { select: { id: true, name: true } },
        billToOrg: { select: { id: true, name: true } },
        settlements: true,
        trip: { include: { load: { select: { pickupAddr: true, dropAddr: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { invoices }
  }

  async get(invoiceId: string, user: User) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        lines: true,
        billFromOrg: { select: { id: true, name: true } },
        billToOrg: { select: { id: true, name: true } },
        settlements: true,
        trip: { include: { load: { select: { pickupAddr: true, dropAddr: true } } } },
      },
    })
    if (!invoice) throw new NotFoundException('Invoice not found')
    return { invoice }
  }

  /** Lifecycle moves: draft→issued→disputed→approved→paid (with settlement reconcile). */
  async transition(invoiceId: string, status: string, user: User) {
    await this.requireInvoiceAccess(user, invoiceId)
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } })
    if (!invoice) throw new NotFoundException('Invoice not found')
    if (!INVOICE_TRANSITIONS[invoice.status]?.includes(status)) {
      throw new BadRequestException(`Cannot move invoice ${invoice.status} → ${status}`)
    }

    const data: Record<string, unknown> = { status }
    if (status === 'issued') data.issueDate = new Date()
    if (status === 'paid') data.paidAt = new Date()
    const updated = await this.prisma.invoice.update({ where: { id: invoiceId }, data, include: { lines: true, settlements: true } })

    // Reconciliation: when an invoice is paid, settle every linked settlement.
    if (status === 'paid') {
      const settled = await this.prisma.settlement.updateMany({
        where: { invoiceId: invoiceId, status: 'due' },
        data: { status: 'cleared', settledAt: new Date() },
      })
      await this.audit.log({ actorId: user.id, action: 'invoice.paid', resource: invoiceId, after: { clearedSettlements: settled.count } })
    } else {
      await this.audit.log({ actorId: user.id, action: 'invoice.transition', resource: invoiceId, after: { status } })
    }
    return { invoice: updated }
  }

  /** Reconcile an invoice against its settlements — exposes due vs cleared balance. */
  async reconcile(invoiceId: string, user: User) {
    await this.requireInvoiceAccess(user, invoiceId)
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { lines: true, settlements: true, trip: { include: { payments: true } } },
    })
    if (!invoice) throw new NotFoundException('Invoice not found')
    const settledAmount = invoice.settlements.filter((s) => s.status === 'cleared').reduce((s, x) => s + (x.amount ?? 0), 0)
    const paidViaPayments = invoice.trip?.payments.filter((p) => p.status === 'succeeded').reduce((s, p) => s + p.amount, 0) ?? 0
    const due = Math.round(((invoice.netAmount ?? 0) - settledAmount - paidViaPayments) * 100) / 100
    return {
      invoice: { ...invoice, settledAmount: Math.round(settledAmount * 100) / 100, paidViaPayments, due: Math.max(due, 0) },
    }
  }

  /** Link an open dispute to an invoice so payout stays frozen until resolution. */
  async attachDispute(invoiceId: string, disputeId: string, user: User) {
    await this.requireInvoiceAccess(user, invoiceId)
    const dispute = await this.prisma.dispute.findUnique({ where: { id: disputeId } })
    if (!dispute) throw new NotFoundException('Dispute not found')
    const updated = await this.prisma.invoice.update({ where: { id: invoiceId }, data: { disputeId, status: 'disputed' } })
    await this.audit.log({ actorId: user.id, action: 'invoice.dispute', resource: invoiceId, after: { disputeId } })
    return { invoice: updated }
  }
}