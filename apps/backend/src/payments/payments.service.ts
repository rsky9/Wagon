import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { OutboxRelay } from '../outbox/outbox-relay.service'
import { PAYMENT_PROVIDER, PaymentProvider } from './payment-provider.service'
import type { User } from '@prisma/client'

@Injectable()
export class PaymentsService {
  // First-N-trips cashback: a % of the payout is credited to the transporter's Wagon Cash.
  private static readonly CASHBACK_FIRST_TRIPS = 3
  private static readonly CASHBACK_RATE = 0.05 // 5%

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly outbox: OutboxRelay,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /** Supplier pays the escrow/booking amount for an accepted trip. Idempotent per trip. */
  async captureEscrow(tripId: string, amount: number, user: User) {
    if (!amount || amount <= 0) {
      throw new BadRequestException('amount must be positive')
    }
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { load: true } })
    if (!trip) {
      throw new NotFoundException('Trip not found')
    }
    const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
    if (!supplier || supplier.id !== trip.load.supplierId) {
      throw new BadRequestException('Only the load supplier can pay this escrow')
    }
    if (trip.status !== 'accepted' && trip.status !== 'in_transit') {
      throw new BadRequestException('Escrow only valid for accepted/in-transit trips')
    }

    const idempotencyKey = `escrow_${tripId}`
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } })
    if (existing) {
      return { payment: existing, alreadyCaptured: true }
    }

    const result = await this.provider.capture({
      amount,
      currency: 'INR',
      reference: idempotencyKey,
      metadata: { tripId },
    })

    const tax = PaymentsService.taxBreakdown(amount)
    const payment = await this.prisma.payment.create({
      data: {
        tripId,
        type: 'escrow',
        amount,
        gstAmount: tax.gstAmount,
        tdsAmount: tax.tdsAmount,
        method: 'mock',
        providerRef: result.providerRef,
        idempotencyKey,
        status: result.status === 'succeeded' ? 'succeeded' : 'failed',
      },
    })

    const transporter = await this.prisma.transporter.findUnique({
      where: { id: trip.transporterId },
      include: { user: true },
    })
    if (transporter && result.status === 'succeeded') {
      await this.notifications.create({
        userId: transporter.userId,
        type: 'escrow_paid',
        title: 'Booking amount received',
        body: `Supplier paid ₹${amount} for load #${trip.loadId.slice(-6)}`,
        data: { tripId, loadId: trip.loadId },
        category: 'payments',
      })
    }

    // Canonical event: escrow captured.
    await this.outbox.emit(await this.tx(), {
      eventType: 'FINANCE',
      eventCode: result.status === 'succeeded' ? 'ESCROW_CAPTURED' : 'ESCROW_FAILED',
      entityType: 'trip',
      entityId: trip.id,
      shipmentId: await this.shipmentIdFor(trip.loadId),
      actorId: user.id,
      payload: { tripId, amount, providerRef: result.providerRef },
    })

    return { payment, alreadyCaptured: false }
  }

  /** GST 5% / TDS 2% breakdown on the agreed rate. */
  private static taxBreakdown(base: number) {
    const gstRate = 0.05
    const tdsRate = 0.02
    const gstAmount = Math.round(base * gstRate * 100) / 100
    const tdsAmount = Math.round(base * tdsRate * 100) / 100
    const net = Math.round((base + gstAmount - tdsAmount) * 100) / 100
    return { base, gstRate, tdsRate, gstAmount, tdsAmount, net }
  }

  /** Release escrow to transporter once delivered + POD uploaded. Idempotent. */
  async releasePayout(tripId: string, user: User) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { load: true, booking: true },
    })
    if (!trip) {
      throw new NotFoundException('Trip not found')
    }
    const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    if (!transporter || transporter.id !== trip.transporterId) {
      throw new BadRequestException('Only the assigned transporter can request payout')
    }
    if (trip.status !== 'delivered') {
      throw new BadRequestException('Payout requires trip to be delivered')
    }

    const escrow = await this.prisma.payment.findFirst({
      where: { tripId, type: 'escrow', status: 'succeeded' },
    })
    if (!escrow) {
      throw new BadRequestException('No escrow captured for this trip')
    }

    const idempotencyKey = `payout_${tripId}`
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } })
    if (existing) {
      return { payment: existing, alreadyPaid: true }
    }

    // Agreed rate is the locked booking rate (fall back to the escrow amount).
    const base = trip.booking?.rate ?? escrow.amount
    const tax = PaymentsService.taxBreakdown(base)
    // Transporter receives net of TDS; GST is collected on the service.
    const payoutAmount = Math.round((base - tax.tdsAmount) * 100) / 100

    const result = await this.provider.payout({
      amount: payoutAmount,
      currency: 'INR',
      reference: idempotencyKey,
      destination: { account: transporter.bankAccount ?? undefined, ifsc: transporter.ifsc ?? undefined },
    })

    const payment = await this.prisma.payment.create({
      data: {
        tripId,
        type: 'payout',
        amount: payoutAmount,
        gstAmount: tax.gstAmount,
        tdsAmount: tax.tdsAmount,
        method: 'mock',
        providerRef: result.providerRef,
        idempotencyKey,
        status: result.status === 'succeeded' ? 'succeeded' : 'failed',
      },
    })

    if (result.status === 'succeeded') {
      const tripsDone = user.tripsCount
      await this.prisma.user.update({
        where: { id: user.id },
        data: { tripsCount: { increment: 1 } },
      })
      // First-N-trips cashback: credit Wagon Cash on the first few payouts.
      if (tripsDone < PaymentsService.CASHBACK_FIRST_TRIPS) {
        const cashback = Math.round(escrow.amount * PaymentsService.CASHBACK_RATE * 100) / 100
        const note = `Cashback on trip #${tripsDone + 1} (${(PaymentsService.CASHBACK_RATE * 100).toFixed(0)}% of payout)`
        await this.prisma.user.update({
          where: { id: user.id },
          data: { cashbackBalance: { increment: cashback } },
        })
        await this.prisma.walletTransaction.create({
          data: { userId: user.id, kind: 'trip_cashback', amount: cashback, note, tripId },
        })
      }
    }

    // Canonical event: payout released.
    await this.outbox.emit(await this.tx(), {
      eventType: 'FINANCE',
      eventCode: 'PAYOUT_RELEASED',
      entityType: 'trip',
      entityId: tripId,
      shipmentId: await this.shipmentIdFor(tripId),
      actorId: user.id,
      payload: { tripId, amount: payment.amount, providerRef: payment.providerRef },
    })

    return { payment, alreadyPaid: false }
  }

  async passbook(user: User) {
    const isTransporter = (user.capabilities?.includes('transporter') as boolean) || user.role === 'transporter'
    const isSupplier = (user.capabilities?.includes('supplier') as boolean) || user.role === 'supplier'
    // Non-participants (driver/forwarder/warehouse/carrier/enablement-only) have
    // no ledger — never fall back to an unscoped query.
    if (!isTransporter && !isSupplier) {
      return { entries: [], balance: 0 }
    }
    // Both-capability users see trips from both sides.
    const trips =
      isTransporter && isSupplier
        ? await this.prisma.trip.findMany({
            where: {
              OR: [
                { transporterId: (await this.transporterId(user)) ?? '__none__' },
                { load: { supplierId: (await this.supplierId(user)) ?? '__none__' } },
              ],
            },
            include: { payments: true, load: true },
            orderBy: { createdAt: 'desc' },
          })
        : await this.prisma.trip.findMany({
            where: isTransporter
              ? { transporterId: (await this.transporterId(user)) ?? '' }
              : { load: { supplierId: (await this.supplierId(user)) ?? '' } },
            include: { payments: true, load: true },
            orderBy: { createdAt: 'desc' },
          })
    const entries = trips.flatMap((t) =>
      t.payments.map((p) => ({
        id: p.id,
        tripId: t.id,
        loadId: t.loadId,
        route: `${t.load.pickupAddr} → ${t.load.dropAddr}`,
        type: p.type,
        amount: p.type === 'escrow' ? -p.amount : p.amount,
        status: p.status,
        providerRef: p.providerRef,
        createdAt: p.createdAt,
      })),
    )
    entries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    const totalIn = entries.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0)
    const totalOut = Math.abs(entries.filter((e) => e.amount < 0).reduce((s, e) => s + e.amount, 0))
    const balance = totalIn - totalOut

    return { entries, balance }
  }

  /** Reward wallet: Wagon Cash balance + ledger of conversions/cashback/redemptions. */
  async wallet(user: User) {
    const [profile, txs] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: user.id } }),
      this.prisma.walletTransaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ])
    return {
      balance: profile?.cashbackBalance ?? 0,
      transactions: txs.map((t) => ({
        id: t.id,
        kind: t.kind,
        amount: t.amount,
        note: t.note,
        tripId: t.tripId,
        createdAt: t.createdAt,
      })),
    }
  }

  async uploadPod(tripId: string, user: User) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } })
    if (!trip) {
      throw new NotFoundException('Trip not found')
    }
    const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    if (!transporter || transporter.id !== trip.transporterId) {
      throw new BadRequestException('Only the assigned transporter can upload POD')
    }
    if (trip.status !== 'delivered') {
      throw new BadRequestException('POD upload requires trip delivered')
    }
    // Mock: no real file storage yet; record a placeholder reference.
    const podUrl = `mock://pod/${tripId}`
    return this.prisma.trip.update({ where: { id: tripId }, data: { podUrl } })
  }

  /** Invoice for a delivered trip with TDS/GST breakdown. Uses the agreed booking rate. */
  async invoice(tripId: string, user: User) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { load: { include: { supplier: true } }, payments: true, booking: true },
    })
    if (!trip) throw new NotFoundException('Trip not found')
    const isTransporter = (user.capabilities?.includes('transporter') as boolean) || user.role === 'transporter'
    const isSupplier = (user.capabilities?.includes('supplier') as boolean) || user.role === 'supplier'
    const isParticipant =
      (isTransporter && trip.transporterId === (await this.transporterId(user))) ||
      (isSupplier && trip.load.supplierId === (await this.supplierId(user)))
    if (!isParticipant) throw new BadRequestException('Not a participant of this trip')

    const base = trip.booking?.rate ?? trip.load.fareEstimate
    const tax = PaymentsService.taxBreakdown(base)
    const payouts = trip.payments.filter((p) => p.type === 'payout' && p.status === 'succeeded')

    return {
      invoice: {
        invoiceNo: `INV-${tripId.slice(-8).toUpperCase()}`,
        tripId,
        route: `${trip.load.pickupAddr} → ${trip.load.dropAddr}`,
        date: trip.deliveredAt ?? new Date(),
        transporterId: trip.transporterId,
        supplierId: trip.load.supplierId,
        baseAmount: base,
        gstAmount: tax.gstAmount,
        tdsAmount: tax.tdsAmount,
        netAmount: tax.net,
        paidAmount: payouts.length ? (payouts[0]?.amount ?? 0) : 0,
        settled: payouts.length > 0,
        gstRate: tax.gstRate,
        tdsRate: tax.tdsRate,
      },
    }
  }

  private async transporterId(user: User) {
    return (await this.prisma.transporter.findUnique({ where: { userId: user.id } }))?.id
  }

  private async supplierId(user: User) {
    return (await this.prisma.supplier.findUnique({ where: { userId: user.id } }))?.id
  }

  /** Resolve the canonical shipment for a load/trip id. */
  private async shipmentIdFor(ref: string) {
    const s = await this.prisma.shipment.findFirst({ where: { ref } })
    return s?.id ?? null
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
