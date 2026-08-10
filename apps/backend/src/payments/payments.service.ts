import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PAYMENT_PROVIDER, PaymentProvider } from './payment-provider.service'
import type { User } from '@prisma/client'

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
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

    const payment = await this.prisma.payment.create({
      data: {
        tripId,
        type: 'escrow',
        amount,
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
      })
    }

    return { payment, alreadyCaptured: false }
  }

  /** Release escrow to transporter once delivered + POD uploaded. Idempotent. */
  async releasePayout(tripId: string, user: User) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { load: true } })
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

    const result = await this.provider.payout({
      amount: escrow.amount,
      currency: 'INR',
      reference: idempotencyKey,
      destination: { account: transporter.bankAccount ?? undefined, ifsc: transporter.ifsc ?? undefined },
    })

    const payment = await this.prisma.payment.create({
      data: {
        tripId,
        type: 'payout',
        amount: escrow.amount,
        method: 'mock',
        providerRef: result.providerRef,
        idempotencyKey,
        status: result.status === 'succeeded' ? 'succeeded' : 'failed',
      },
    })

    if (result.status === 'succeeded') {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { tripsCount: { increment: 1 } },
      })
    }

    return { payment, alreadyPaid: false }
  }

  async passbook(user: User) {
    const isTransporter = (user.capabilities?.includes('transporter') as boolean) || user.role === 'transporter'
    const isSupplier = (user.capabilities?.includes('supplier') as boolean) || user.role === 'supplier'
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
            where:
              isTransporter
                ? { transporterId: (await this.transporterId(user)) ?? '' }
                : isSupplier
                  ? { load: { supplierId: (await this.supplierId(user)) ?? '' } }
                  : {},
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

  /** Invoice for a delivered trip with TDS/GST breakdown. */
  async invoice(tripId: string, user: User) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { load: { include: { supplier: true } }, payments: true },
    })
    if (!trip) throw new NotFoundException('Trip not found')
    const isTransporter = (user.capabilities?.includes('transporter') as boolean) || user.role === 'transporter'
    const isSupplier = (user.capabilities?.includes('supplier') as boolean) || user.role === 'supplier'
    const isParticipant =
      (isTransporter && trip.transporterId === (await this.transporterId(user))) ||
      (isSupplier && trip.load.supplierId === (await this.supplierId(user)))
    if (!isParticipant) throw new BadRequestException('Not a participant of this trip')

    const base = trip.load.fareEstimate
    const gstRate = 0.05
    const gstAmount = Math.round(base * gstRate)
    const tdsRate = 0.02
    const tdsAmount = Math.round(base * tdsRate)
    const net = base + gstAmount - tdsAmount
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
        gstAmount,
        tdsAmount,
        netAmount: net,
        settled: payouts.length > 0,
        gstRate,
        tdsRate,
      },
    }
  }

  private async transporterId(user: User) {
    return (await this.prisma.transporter.findUnique({ where: { userId: user.id } }))?.id
  }

  private async supplierId(user: User) {
    return (await this.prisma.supplier.findUnique({ where: { userId: user.id } }))?.id
  }
}
