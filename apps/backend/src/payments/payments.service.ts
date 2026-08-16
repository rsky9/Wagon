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
  /** Capture a payment (escrow full, or advance/balance split). Idempotent per (trip, stage). */
  async captureEscrow(tripId: string, amount: number, user: User, stage: 'escrow' | 'advance' | 'balance' = 'escrow') {
    if (!amount || amount <= 0) {
      throw new BadRequestException('amount must be positive')
    }
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { load: true, booking: true } })
    if (!trip) {
      throw new NotFoundException('Trip not found')
    }
    const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
    if (!supplier || supplier.id !== trip.load.supplierId) {
      throw new BadRequestException('Only the load supplier can pay this escrow')
    }
    if (stage === 'advance' && trip.status !== 'accepted' && trip.status !== 'in_transit') {
      throw new BadRequestException('Advance payment requires accepted/in-transit trip')
    }
    if (stage === 'balance' && trip.status !== 'in_transit' && trip.status !== 'delivered') {
      throw new BadRequestException('Balance payment requires trip in transit or delivered')
    }
    if (stage === 'escrow' && trip.status !== 'accepted' && trip.status !== 'in_transit') {
      throw new BadRequestException('Escrow only valid for accepted/in-transit trips')
    }

    // Enforce split terms: advance must match the agreed advance amount exactly.
    if (stage === 'advance') {
      const advanceAgreed = trip.booking?.advanceAmount ?? trip.load.advanceAmount ?? null
      if (advanceAgreed != null && Math.abs(amount - advanceAgreed) > 0.001) {
        throw new BadRequestException(`Advance must equal the agreed ₹${advanceAgreed}`)
      }
    }

    // Money-in must match money-out: a full escrow must equal the agreed rate.
    if (stage === 'escrow') {
      const agreed = trip.booking?.rate ?? trip.load.fareEstimate ?? null
      if (agreed != null && Math.abs(amount - agreed) > 0.001) {
        throw new BadRequestException(`Escrow must equal the agreed rate ₹${agreed}`)
      }
    }
    // Split path: the balance must complete the agreed rate exactly
    // (advance + balance === agreed), so the platform never under-collects.
    if (stage === 'balance') {
      const agreed = trip.booking?.rate ?? trip.load.fareEstimate ?? null
      const advance = await this.prisma.payment.findFirst({ where: { tripId, type: 'advance', status: 'succeeded' } })
      const advanceAmt = advance?.amount ?? 0
      if (agreed != null) {
        const remaining = Math.round((agreed - advanceAmt) * 100) / 100
        if (Math.abs(amount - remaining) > 0.001) {
          throw new BadRequestException(
            `Balance must complete the agreed rate: ₹${remaining} more is owed (advance ₹${advanceAmt} of ₹${agreed})`,
          )
        }
      }
    }

    const idempotencyKey = stage === 'escrow' ? `escrow_${tripId}` : `${stage}_${tripId}`
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } })
    if (existing && existing.status === 'succeeded') {
      return { payment: existing, alreadyCaptured: true }
    }
    // A failed capture must be retryable — release the idempotency slot.
    if (existing && existing.status === 'failed') {
      await this.prisma.payment.delete({ where: { id: existing.id } })
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
        type: stage === 'escrow' ? 'escrow' : stage, // advance | balance
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

    // Canonical event: escrow/advance/balance captured.
    const code = result.status === 'succeeded' ? (stage === 'escrow' ? 'ESCROW_CAPTURED' : `${stage.toUpperCase()}_CAPTURED`) : 'ESCROW_FAILED'
    await this.outbox.emit(await this.tx(), {
      eventType: 'FINANCE',
      eventCode: code,
      entityType: 'trip',
      entityId: trip.id,
      shipmentId: await this.shipmentIdFor(trip.loadId),
      actorId: user.id,
      payload: { tripId, amount, stage, providerRef: result.providerRef },
    })

    return { payment, alreadyCaptured: false }
  }

  /**
   * Refund every captured escrow/advance/balance for a trip, idempotently and
   * via the real payment provider. Used on trip cancellation and admin refunds
   * so captured money actually returns to the payer.
   */
  async refundTripCaptures(tripId: string, options?: { tx?: unknown }): Promise<number> {
    const captures = await this.prisma.payment.findMany({
      where: { tripId, type: { in: ['escrow', 'advance', 'balance'] }, status: 'succeeded' },
    })
    let refundedCount = 0
    for (const c of captures) {
      const refundKey = `refund_${c.idempotencyKey}`
      const existingRefund = await this.prisma.payment.findUnique({ where: { idempotencyKey: refundKey } })
      if (existingRefund) continue
      let refunded = false
      if (c.providerRef) {
        const result = await this.provider.refund({
          amount: c.amount,
          currency: c.currency ?? 'INR',
          reference: refundKey,
          originalProviderRef: c.providerRef,
          metadata: { tripId, originalIdempotencyKey: c.idempotencyKey ?? '' },
        })
        refunded = result.status === 'succeeded'
      } else {
        refunded = true
      }
      await this.prisma.payment.create({
        data: {
          tripId,
          type: 'refund',
          amount: c.amount,
          method: c.method,
          providerRef: refunded ? `refund-${c.providerRef ?? tripId}` : `refund-failed-${c.providerRef ?? tripId}`,
          idempotencyKey: refundKey,
          status: refunded ? 'succeeded' : 'failed',
        },
      })
      if (refunded) refundedCount++
    }
    return refundedCount
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
    // Payouts land in a bank account: a real destination (bankAccount + IFSC)
    // must be on the transporter profile — a verified bank KYC doc alone can't
    // move money, because there's no account/IFSC on it.
    if (!(transporter.bankAccount && transporter.ifsc)) {
      throw new BadRequestException('Add your bank account (Settings → Bank) before payouts can be released')
    }
    // Freeze payouts while a dispute is open on this trip, or an approved claim
    // settlement on the linked shipment is still unpaid.
    const shipmentId = await this.shipmentIdFor(trip.loadId)
    const [openDispute, unpaidClaimSettlement] = await Promise.all([
      this.prisma.dispute.count({ where: { tripId, status: 'open' } }),
      shipmentId
        ? this.prisma.settlement.count({ where: { shipmentId, type: 'claim', status: 'due' } })
        : Promise.resolve(0),
    ])
    if (openDispute > 0) {
      throw new BadRequestException('Payout is frozen while a dispute is open on this trip')
    }
    if (unpaidClaimSettlement > 0) {
      throw new BadRequestException('Payout is frozen while an approved claim settlement is unpaid')
    }
    // Proof of delivery is mandatory before money moves — and the consignee
    // must have CONFIRMED receipt. No confirmed POD, no payout.
    const pod = await this.prisma.proofOfDelivery.findUnique({ where: { tripId } })
    if (!pod || pod.status === 'pending') {
      throw new BadRequestException('Delivery proof must be uploaded and confirmed by the consignee before payout')
    }
    if (pod.status !== 'confirmed' && pod.status !== 'verified') {
      throw new BadRequestException('Delivery proof not yet confirmed by the consignee')
    }

    // Full escrow OR a complete (advance + balance) capture is required.
    const escrow = await this.prisma.payment.findFirst({
      where: { tripId, type: 'escrow', status: 'succeeded' },
    })
    const [advance, balance] = await Promise.all([
      this.prisma.payment.findFirst({ where: { tripId, type: 'advance', status: 'succeeded' } }),
      this.prisma.payment.findFirst({ where: { tripId, type: 'balance', status: 'succeeded' } }),
    ])
    const agreed = trip.booking?.rate ?? trip.load.fareEstimate ?? null
    if (escrow) {
      if (agreed != null && Math.abs(escrow.amount - agreed) > 0.001) {
        throw new BadRequestException(`Escrow (₹${escrow.amount}) does not match the agreed rate ₹${agreed}`)
      }
    } else {
      if (!advance || !balance) {
        throw new BadRequestException('Capture the escrow (or advance + balance) before payout')
      }
      // The split path must have collected the FULL agreed rate — the platform
      // never pays out more than it collected.
      if (agreed != null) {
        const collected = Math.round((advance.amount + balance.amount) * 100) / 100
        if (Math.abs(collected - agreed) > 0.001) {
          throw new BadRequestException(
            `Split collection (₹${collected}) does not cover the agreed rate ₹${agreed} — capture the remaining balance first`,
          )
        }
      }
    }

    const idempotencyKey = `payout_${tripId}`
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } })
    if (existing && existing.status === 'succeeded') {
      return { payment: existing, alreadyPaid: true }
    }
    if (existing && existing.status === 'failed') {
      await this.prisma.payment.delete({ where: { id: existing.id } })
    }

    // Agreed rate is the locked booking rate.
    const base = trip.booking?.rate ?? trip.load.fareEstimate ?? 0
    const tax = PaymentsService.taxBreakdown(base)
    const net = Math.round((base - tax.tdsAmount) * 100) / 100
    // Full-escrow path: the transporter is paid the full net.
    // Split path: the advance was already released at pickup, so the final
    // payout is the net minus the advance already received.
    const advanceAmt = advance?.amount ?? 0
    const payoutAmount = escrow ? net : Math.max(0, Math.round((net - advanceAmt) * 100) / 100)

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
      // Notify the transporter their payout cleared.
      await this.notifications.create({
        userId: user.id,
        type: 'payout_released',
        title: 'Payout released',
        body: `₹${payoutAmount.toLocaleString('en-IN')} paid for load #${trip.loadId.slice(-6)}`,
        data: { tripId, loadId: trip.loadId },
        category: 'payments',
      })
      // First-N-trips cashback: credit Wagon Cash on the first few payouts.
      if (tripsDone < PaymentsService.CASHBACK_FIRST_TRIPS) {
        const cashback = Math.round(base * PaymentsService.CASHBACK_RATE * 100) / 100
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
      t.payments.map((p) => {
        // Role-aware direction:
        //  - supplier pays escrow/advance/balance (out); gets refunds (in)
        //  - transporter receives payouts (in); refunds are out
        //  - both-capability users see both ledgers (each trip's side)
        let amount: number
        if (isTransporter && isSupplier) {
          amount = p.type === 'refund' ? p.amount : p.type === 'payout' ? p.amount : -p.amount
        } else if (isTransporter) {
          amount = p.type === 'payout' ? p.amount : -p.amount
        } else {
          // Supplier
          amount = p.type === 'refund' ? p.amount : -p.amount
        }
        return {
          id: p.id,
          tripId: t.id,
          loadId: t.loadId,
          route: `${t.load.pickupAddr} → ${t.load.dropAddr}`,
          type: p.type,
          amount,
          status: p.status,
          providerRef: p.providerRef,
          createdAt: p.createdAt,
        }
      }),
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

  async uploadPod(tripId: string, input: { photoKey: string; signatureKey?: string; consigneeName?: string; lat?: number; lng?: number; note?: string }, user: User) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { load: true } })
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
    if (!input.photoKey?.trim()) {
      throw new BadRequestException('Delivery photo is required')
    }
    const pod = await this.prisma.proofOfDelivery.upsert({
      where: { tripId },
      update: {
        photoKey: input.photoKey.trim(),
        signatureKey: input.signatureKey ?? null,
        consigneeName: input.consigneeName ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        note: input.note ?? null,
        status: 'pending',
      },
      create: {
        tripId,
        photoKey: input.photoKey.trim(),
        signatureKey: input.signatureKey ?? null,
        consigneeName: input.consigneeName ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        note: input.note ?? null,
        status: 'pending',
      },
    })
    // Keep the legacy podUrl in sync for downstream readers.
    await this.prisma.trip.update({ where: { id: tripId }, data: { podUrl: `s3://${input.photoKey.trim()}` } })
    // Notify the supplier that delivery evidence arrived (for consignee confirm).
    const supplier = await this.prisma.supplier.findUnique({ where: { id: trip.load.supplierId }, include: { user: true } })
    if (supplier) {
      await this.notifications.create({
        userId: supplier.userId,
        type: 'pod_captured',
        title: 'Delivery proof uploaded',
        body: `Transporter uploaded delivery evidence for load #${trip.loadId.slice(-6)} — please confirm receipt.`,
        data: { tripId, loadId: trip.loadId },
        category: 'delivery',
      })
    }
    await this.outbox.emit(await this.tx(), {
      eventType: 'EXECUTION',
      eventCode: 'POD_CAPTURED',
      entityType: 'trip',
      entityId: tripId,
      shipmentId: await this.shipmentIdFor(tripId),
      actorId: user.id,
      payload: { tripId, podId: pod.id, status: 'pending' },
    })
    return { pod }
  }

  /** The consignee/supplier confirms delivery evidence (geotagged receipt). */
  async confirmPod(tripId: string, user: User) {
    const pod = await this.prisma.proofOfDelivery.findUnique({ where: { tripId } })
    if (!pod) throw new NotFoundException('No POD uploaded for this trip')
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { load: true } })
    if (!trip) throw new NotFoundException('Trip not found')
    const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
    if (!supplier || supplier.id !== trip.load.supplierId) {
      throw new BadRequestException('Only the consignee/supplier can confirm delivery')
    }
    if (pod.status === 'confirmed' || pod.status === 'verified') throw new BadRequestException('POD already confirmed')
    const updated = await this.prisma.proofOfDelivery.update({
      where: { id: pod.id },
      data: { status: 'confirmed', consigneeConfirmed: true, consigneeConfirmedAt: new Date() },
    })
    await this.outbox.emit(await this.tx(), {
      eventType: 'EXECUTION',
      eventCode: 'POD_CONFIRMED',
      entityType: 'trip',
      entityId: tripId,
      shipmentId: await this.shipmentIdFor(tripId),
      actorId: user.id,
      payload: { tripId, podId: pod.id },
    })
    return { pod: updated }
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
