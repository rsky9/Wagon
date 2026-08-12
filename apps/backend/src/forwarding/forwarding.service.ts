import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OutboxRelay } from '../outbox/outbox-relay.service'
import { OrgAccessService } from '../org-access/org-access.service'
import type { User } from '@prisma/client'

const DOC_KINDS = ['commercial_invoice', 'packing_list', 'waybill', 'bill_of_lading', 'air_waybill', 'customs_declaration', 'certificate']
const ORDER_TRANSITIONS: Record<string, string[]> = {
  intake: ['consolidated', 'booked', 'cancelled'],
  consolidated: ['booked', 'cancelled'],
  booked: ['in_transit', 'cancelled'],
  in_transit: ['delivered'],
  delivered: ['closed'],
  closed: [],
  cancelled: [],
}
const DOC_TRANSITIONS: Record<string, string[]> = {
  draft: ['issued'],
  issued: ['cleared', 'draft'],
  cleared: [],
}

@Injectable()
export class ForwardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAccess: OrgAccessService,
    @Inject(OutboxRelay) private readonly outbox: OutboxRelay,
  ) {}

  /** The forwarder's own organizations (kind = forwarder) the user belongs to. */
  private async forwarderOrgs(user: User) {
    return this.orgAccess.orgsOfKind(user, ['forwarder'])
  }

  private async requireForwarder(user: User) {
    const orgs = await this.forwarderOrgs(user)
    if (orgs.length === 0) throw new ForbiddenException('Requires membership of a forwarder organization')
    return orgs[0]!
  }

  private async requireOrderAccess(user: User, orderId: string) {
    const order = await this.prisma.forwardOrder.findUnique({ where: { id: orderId } })
    if (!order) throw new NotFoundException('Forward order not found')
    if (!(await this.orgAccess.isMember(user, order.forwarderId))) {
      throw new ForbiddenException('Not your forward order')
    }
    return order
  }

  // ---------- Orders ----------

  /** Create a forward order against an existing shipment (forwarder = caller's org). */
  async createOrder(input: {
    customerId?: string
    shipmentId: string
    buyAmount?: number
    sellAmount?: number
    currency?: string
    notes?: string
  }, user: User) {
    const forwarder = await this.requireForwarder(user)
    const shipment = await this.orgAccess.assertShipmentAccess(user, input.shipmentId)
    this.validateAmounts(input.buyAmount, input.sellAmount)
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.forwardOrder.create({
        data: {
          forwarderId: forwarder.id,
          customerId: input.customerId ?? shipment.ownerOrgId ?? null,
          shipmentId: input.shipmentId,
          ref: `FWD-${Date.now().toString(36).toUpperCase()}`,
          buyAmount: input.buyAmount ?? null,
          sellAmount: input.sellAmount ?? null,
          currency: input.currency ?? 'INR',
          notes: input.notes,
          status: 'intake',
        },
      })
      await this.outbox.emit(tx as never, {
        eventType: 'SHIPMENT',
        eventCode: 'FORWARD_ORDER_CREATED',
        entityType: 'shipment',
        entityId: input.shipmentId,
        orgId: forwarder.id,
        shipmentId: input.shipmentId,
        actorId: user.id,
        payload: { orderRef: created.ref },
      })
      return created
    })
    return { order }
  }

  async orderDetail(orderId: string, user: User) {
    const order = await this.requireOrderAccess(user, orderId)
    const detail = await this.prisma.forwardOrder.findUnique({
      where: { id: order.id },
      include: {
        shipment: { include: { legs: { orderBy: { sequence: 'asc' } }, plans: true } },
        consolidation: true,
      },
    })
    return { order: detail }
  }

  async updateOrderStatus(orderId: string, status: string, user: User) {
    const order = await this.requireOrderAccess(user, orderId)
    const allowed = ORDER_TRANSITIONS[order.status]
    if (!allowed?.includes(status)) throw new BadRequestException(`Cannot go ${order.status} -> ${status}`)
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.forwardOrder.update({ where: { id: orderId }, data: { status } })
      await this.outbox.emit(tx as never, {
        eventType: 'SHIPMENT',
        eventCode: `ORDER_${status.toUpperCase().replace('-', '_')}`,
        entityType: 'shipment',
        entityId: order.shipmentId,
        orgId: order.forwarderId,
        shipmentId: order.shipmentId,
        actorId: user.id,
        payload: { orderRef: order.ref, from: order.status, to: status },
      })
      return changed
    })
    return { order: updated }
  }

  /** Set buy/sell margin on an order. Margin must be >= 0 and within 100%. */
  async setMargin(orderId: string, buyAmount: number, sellAmount: number, user: User) {
    const order = await this.requireOrderAccess(user, orderId)
    this.validateAmounts(buyAmount, sellAmount)
    const margin = sellAmount - buyAmount
    if (margin < 0) throw new BadRequestException('Sell amount must exceed buy amount')
    if (sellAmount > 0 && margin / sellAmount > 1) throw new BadRequestException('Margin cannot exceed 100%')
    const updated = await this.prisma.forwardOrder.update({
      where: { id: order.id },
      data: { buyAmount, sellAmount },
    })
    return { order: updated, margin, pct: sellAmount > 0 ? (margin / sellAmount) * 100 : 0 }
  }

  // ---------- Bookings ----------

  /** Book capacity with a carrier on a leg. */
  async book(input: {
    shipmentId: string
    legId?: string
    carrierId?: string
    bookingRef?: string
    vessel?: string
    voyage?: string
    flight?: string
    equipment?: string
    rate?: number
  }, user: User) {
    await this.orgAccess.assertShipmentAccess(user, input.shipmentId)
    if (input.legId) {
      const leg = await this.prisma.shipmentLeg.findUnique({ where: { id: input.legId } })
      if (!leg) throw new NotFoundException('Leg not found')
      if (leg.shipmentId !== input.shipmentId) throw new BadRequestException('Leg does not belong to shipment')
    }
    if (input.carrierId) {
      const carrier = await this.prisma.organization.findUnique({ where: { id: input.carrierId } })
      if (!carrier) throw new NotFoundException('Carrier not found')
      if (carrier.kind !== 'carrier') throw new BadRequestException('Organization is not a carrier')
    }
    if (input.rate != null && input.rate <= 0) throw new BadRequestException('Rate must be positive')
    const booking = await this.prisma.$transaction(async (tx) => {
      const created = await tx.carrierBooking.create({
        data: {
          shipmentId: input.shipmentId,
          legId: input.legId,
          carrierId: input.carrierId,
          bookingRef: input.bookingRef,
          vessel: input.vessel,
          voyage: input.voyage,
          flight: input.flight,
          equipment: input.equipment,
          rate: input.rate,
          status: 'requested',
        },
      })
      await this.outbox.emit(tx as never, {
        eventType: 'TRANSPORT',
        eventCode: 'BOOKING_REQUESTED',
        entityType: 'leg',
        entityId: input.legId ?? created.id,
        orgId: (await this.orgAccess.primaryOrg(user)).id,
        shipmentId: input.shipmentId,
        actorId: user.id,
        payload: { bookingRef: input.bookingRef, rate: input.rate },
      })
      return created
    })
    return { booking }
  }

  /** Confirm a carrier booking (only from 'requested'). */
  async confirmBooking(bookingId: string, user: User) {
    const booking = await this.prisma.carrierBooking.findUnique({ where: { id: bookingId } })
    if (!booking) throw new NotFoundException('Booking not found')
    await this.orgAccess.assertShipmentAccess(user, booking.shipmentId)
    if (booking.status !== 'requested') throw new BadRequestException('Only requested bookings can be confirmed')
    const updated = await this.prisma.$transaction(async (tx) => {
      const confirmed = await tx.carrierBooking.update({ where: { id: bookingId }, data: { status: 'confirmed' } })
      await this.outbox.emit(tx as never, {
        eventType: 'TRANSPORT',
        eventCode: 'BOOKING_CONFIRMED',
        entityType: 'leg',
        entityId: booking.legId ?? booking.id,
        orgId: (await this.orgAccess.primaryOrg(user)).id,
        shipmentId: booking.shipmentId,
        actorId: user.id,
        payload: { bookingRef: booking.bookingRef },
      })
      return confirmed
    })
    return { booking: updated }
  }

  async cancelBooking(bookingId: string, user: User) {
    const booking = await this.prisma.carrierBooking.findUnique({ where: { id: bookingId } })
    if (!booking) throw new NotFoundException('Booking not found')
    await this.orgAccess.assertShipmentAccess(user, booking.shipmentId)
    if (booking.status === 'confirmed') throw new BadRequestException('Confirmed bookings cannot be cancelled (contact carrier)')
    if (booking.status === 'cancelled') throw new BadRequestException('Booking already cancelled')
    const updated = await this.prisma.carrierBooking.update({ where: { id: bookingId }, data: { status: 'cancelled' } })
    return { booking: updated }
  }

  async listBookings(shipmentId: string, user: User) {
    await this.orgAccess.assertShipmentAccess(user, shipmentId)
    const bookings = await this.prisma.carrierBooking.findMany({
      where: { shipmentId },
      include: { carrier: true },
      orderBy: { createdAt: 'desc' },
    })
    return { bookings }
  }

  // ---------- Documents ----------

  /** Add a trade/transport/customs document. */
  async addDocument(shipmentId: string, kind: string, number: string | undefined, storageKey: string | undefined, user: User) {
    if (!DOC_KINDS.includes(kind)) throw new BadRequestException('Invalid document kind')
    await this.orgAccess.assertShipmentAccess(user, shipmentId)
    const doc = await this.prisma.$transaction(async (tx) => {
      const created = await tx.forwardDocument.create({
        data: { shipmentId, kind, number, storageKey, status: 'draft' },
      })
      await this.outbox.emit(tx as never, {
        eventType: 'DOCUMENT',
        eventCode: 'DOCUMENT_ADDED',
        entityType: 'shipment',
        entityId: shipmentId,
        orgId: (await this.orgAccess.primaryOrg(user)).id,
        shipmentId,
        actorId: user.id,
        payload: { kind, number },
      })
      return created
    })
    return { document: doc }
  }

  async listDocuments(shipmentId: string, user: User) {
    await this.orgAccess.assertShipmentAccess(user, shipmentId)
    const documents = await this.prisma.forwardDocument.findMany({ where: { shipmentId }, orderBy: { createdAt: 'desc' } })
    return { documents }
  }

  async transitionDocument(documentId: string, status: string, user: User) {
    const doc = await this.prisma.forwardDocument.findUnique({ where: { id: documentId } })
    if (!doc) throw new NotFoundException('Document not found')
    await this.orgAccess.assertShipmentAccess(user, doc.shipmentId)
    const allowed = DOC_TRANSITIONS[doc.status]
    if (!allowed?.includes(status)) throw new BadRequestException(`Cannot go ${doc.status} -> ${status}`)
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.forwardDocument.update({ where: { id: documentId }, data: { status } })
      await this.outbox.emit(tx as never, {
        eventType: 'DOCUMENT',
        eventCode: `DOCUMENT_${status.toUpperCase()}`,
        entityType: 'shipment',
        entityId: doc.shipmentId,
        orgId: (await this.orgAccess.primaryOrg(user)).id,
        shipmentId: doc.shipmentId,
        actorId: user.id,
        payload: { kind: doc.kind, status },
      })
      return changed
    })
    return { document: updated }
  }

  async listOrders(user: User) {
    const orgs = await this.forwarderOrgs(user)
    const orders = await this.prisma.forwardOrder.findMany({
      where: { forwarderId: { in: orgs.map((o) => o.id) } },
      include: { shipment: { include: { legs: { orderBy: { sequence: 'asc' } } } }, consolidation: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return { orders }
  }

  // ---------- Consolidation / LCL ----------

  /** Create a consolidation and attach orders to it. */
  async createConsolidation(input: {
    mode?: string
    origin?: string
    destination?: string
    equipment?: string
    orderIds?: string[]
  }, user: User) {
    const forwarder = await this.requireForwarder(user)
    const consolidation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.consolidation.create({
        data: {
          ref: `CONS-${Date.now().toString(36).toUpperCase()}`,
          forwarderId: forwarder.id,
          mode: input.mode ?? 'ocean',
          origin: input.origin,
          destination: input.destination,
          equipment: input.equipment,
          status: 'grouping',
        },
      })
      if (input.orderIds?.length) {
        for (const orderId of input.orderIds) {
          const order = await tx.forwardOrder.findUnique({ where: { id: orderId } })
          if (!order) throw new NotFoundException(`Order ${orderId} not found`)
          if (order.forwarderId !== forwarder.id) throw new ForbiddenException(`Order ${orderId} belongs to another forwarder`)
          if (order.status === 'consolidated') throw new BadRequestException(`Order ${order.ref} already consolidated`)
          await tx.forwardOrder.update({
            where: { id: orderId },
            data: { consolidationId: created.id, status: 'consolidated' },
          })
        }
      }
      await this.outbox.emit(tx as never, {
        eventType: 'SHIPMENT',
        eventCode: 'CONSOLIDATION_CREATED',
        entityType: 'shipment',
        entityId: created.id,
        orgId: forwarder.id,
        actorId: user.id,
        payload: { ref: created.ref, orderCount: input.orderIds?.length ?? 0 },
      })
      return created
    })
    return { consolidation }
  }

  async addOrderToConsolidation(consolidationId: string, orderId: string, user: User) {
    const forwarder = await this.requireForwarder(user)
    const consolidation = await this.prisma.consolidation.findUnique({ where: { id: consolidationId } })
    if (!consolidation) throw new NotFoundException('Consolidation not found')
    if (consolidation.forwarderId !== forwarder.id) throw new ForbiddenException('Not your consolidation')
    if (!['grouping', 'ready'].includes(consolidation.status)) throw new BadRequestException('Consolidation is locked')
    const order = await this.prisma.forwardOrder.findUnique({ where: { id: orderId } })
    if (!order) throw new NotFoundException('Order not found')
    if (order.forwarderId !== forwarder.id) throw new ForbiddenException('Order belongs to another forwarder')
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.forwardOrder.update({
        where: { id: orderId },
        data: { consolidationId, status: 'consolidated' },
      })
      await this.recomputeConsolidationTotals(tx as unknown as Parameters<typeof this.recomputeConsolidationTotals>[0], consolidationId)
      return changed
    })
    return { order: updated }
  }

  /** Recompute cargo totals across the consolidation's orders (from shipments). */
  private async recomputeConsolidationTotals(tx: {
    forwardOrder: {
      findMany: (args: { where: { consolidationId: string }; include: { shipment: boolean } }) => Promise<
        { shipment: { weightKg: number | null; volumeM3: number | null; pieces: number | null } | null }[]
      >
      updateMany: (args: { where: { consolidationId: string }; data: { cargoWeightKg: number; cargoVolumeM3: number; cargoPieces: number } }) => Promise<unknown>
    }
  }, consolidationId: string) {
    const orders = await tx.forwardOrder.findMany({
      where: { consolidationId },
      include: { shipment: true },
    })
    const totals = orders.reduce(
      (acc: { cargoWeightKg: number; cargoVolumeM3: number; cargoPieces: number }, o: { shipment: { weightKg: number | null; volumeM3: number | null; pieces: number | null } | null }) => ({
        cargoWeightKg: (acc.cargoWeightKg ?? 0) + (o.shipment?.weightKg ?? 0),
        cargoVolumeM3: (acc.cargoVolumeM3 ?? 0) + (o.shipment?.volumeM3 ?? 0),
        cargoPieces: (acc.cargoPieces ?? 0) + (o.shipment?.pieces ?? 0),
      }),
      { cargoWeightKg: 0, cargoVolumeM3: 0, cargoPieces: 0 },
    )
    await tx.forwardOrder.updateMany({ where: { consolidationId }, data: totals })
  }

  /** Mark a consolidation ready for booking once it has orders. */
  async markConsolidationReady(consolidationId: string, user: User) {
    const forwarder = await this.requireForwarder(user)
    const consolidation = await this.prisma.consolidation.findUnique({
      where: { id: consolidationId },
      include: { orders: true },
    })
    if (!consolidation) throw new NotFoundException('Consolidation not found')
    if (consolidation.forwarderId !== forwarder.id) throw new ForbiddenException('Not your consolidation')
    if (consolidation.orders.length === 0) throw new BadRequestException('Consolidation has no orders')
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.consolidation.update({ where: { id: consolidationId }, data: { status: 'ready' } })
      await this.outbox.emit(tx as never, {
        eventType: 'SHIPMENT',
        eventCode: 'CONSOLIDATION_READY',
        entityType: 'shipment',
        entityId: consolidationId,
        orgId: forwarder.id,
        actorId: user.id,
        payload: { ref: consolidation.ref, orderCount: consolidation.orders.length },
      })
      return changed
    })
    return { consolidation: updated }
  }

  async listConsolidations(user: User) {
    const orgs = await this.forwarderOrgs(user)
    const consolidations = await this.prisma.consolidation.findMany({
      where: { forwarderId: { in: orgs.map((o) => o.id) } },
      include: { orders: { include: { shipment: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return { consolidations }
  }

  async consolidationDetail(id: string, user: User) {
    const forwarder = await this.requireForwarder(user)
    const consolidation = await this.prisma.consolidation.findUnique({
      where: { id },
      include: { orders: { include: { shipment: true } }, bookedCarrier: true },
    })
    if (!consolidation) throw new NotFoundException('Consolidation not found')
    if (consolidation.forwarderId !== forwarder.id) throw new ForbiddenException('Not your consolidation')
    return { consolidation }
  }

  // ---------- Helpers ----------

  private validateAmounts(buy?: number, sell?: number) {
    if (buy != null && buy < 0) throw new BadRequestException('buyAmount cannot be negative')
    if (sell != null && sell <= 0) throw new BadRequestException('sellAmount must be positive')
  }
}
