import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OutboxRelay } from '../outbox/outbox-relay.service'
import type { User } from '@prisma/client'

@Injectable()
export class ForwardingService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OutboxRelay) private readonly outbox: OutboxRelay,
  ) {}

  /** Forwarder: the forwarder's own organizations (kind = forwarder). */
  private async forwarderOrgs(user: User) {
    return this.prisma.organizationMember.findMany({
      where: { userId: user.id, organization: { kind: 'forwarder' } },
      include: { organization: true },
    })
  }

  /** Create a forward order against an existing shipment. */
  async createOrder(input: {
    forwarderId?: string
    customerId?: string
    shipmentId: string
    buyAmount?: number
    sellAmount?: number
    currency?: string
    notes?: string
  }, user: User) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: input.shipmentId } })
    if (!shipment) throw new NotFoundException('Shipment not found')
    const data: Record<string, unknown> = {
      shipmentId: input.shipmentId,
      ref: `FWD-${Date.now().toString(36).toUpperCase()}`,
      currency: input.currency ?? 'INR',
    }
    if (input.forwarderId) data.forwarderId = input.forwarderId
    if (input.customerId) data.customerId = input.customerId
    if (input.buyAmount) data.buyAmount = input.buyAmount
    if (input.sellAmount) data.sellAmount = input.sellAmount
    if (input.notes) data.notes = input.notes
    const order = await this.prisma.forwardOrder.create({ data: data as never })
    await this.outbox.emit(await this.tx(), {
      eventType: 'SHIPMENT',
      eventCode: 'FORWARD_ORDER_CREATED',
      entityType: 'shipment',
      entityId: shipment.id,
      shipmentId: shipment.id,
      actorId: user.id,
      payload: { orderRef: order.ref },
    })
    return { order }
  }

  /** Set buy/sell margin on an order. */
  async setMargin(orderId: string, buyAmount: number, sellAmount: number, user: User) {
    if (!buyAmount || !sellAmount || sellAmount <= 0) throw new BadRequestException('Invalid margin')
    const order = await this.prisma.forwardOrder.update({
      where: { id: orderId },
      data: { buyAmount, sellAmount },
    })
    return { order, margin: sellAmount - buyAmount, pct: ((sellAmount - buyAmount) / sellAmount) * 100 }
  }

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
    const booking = await this.prisma.carrierBooking.create({
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
    await this.outbox.emit(await this.tx(), {
      eventType: 'TRANSPORT',
      eventCode: 'BOOKING_REQUESTED',
      entityType: 'leg',
      entityId: input.legId ?? booking.id,
      shipmentId: input.shipmentId,
      actorId: user.id,
      payload: { bookingRef: input.bookingRef, rate: input.rate },
    })
    return { booking }
  }

  /** Confirm a carrier booking. */
  async confirmBooking(bookingId: string, user: User) {
    const booking = await this.prisma.carrierBooking.update({
      where: { id: bookingId },
      data: { status: 'confirmed' },
    })
    await this.outbox.emit(await this.tx(), {
      eventType: 'TRANSPORT',
      eventCode: 'BOOKING_CONFIRMED',
      entityType: 'leg',
      entityId: booking.legId ?? booking.id,
      shipmentId: booking.shipmentId,
      actorId: user.id,
      payload: { bookingRef: booking.bookingRef },
    })
    return { booking }
  }

  /** Add a trade/transport/customs document. */
  async addDocument(shipmentId: string, kind: string, number: string | undefined, storageKey: string | undefined, user: User) {
    if (!['commercial_invoice', 'packing_list', 'waybill', 'bill_of_lading', 'air_waybill', 'customs_declaration', 'certificate'].includes(kind)) {
      throw new BadRequestException('Invalid document kind')
    }
    const doc = await this.prisma.forwardDocument.create({
      data: { shipmentId, kind, number, storageKey },
    })
    await this.outbox.emit(await this.tx(), {
      eventType: 'DOCUMENT',
      eventCode: 'DOCUMENT_ADDED',
      entityType: 'shipment',
      entityId: shipmentId,
      shipmentId,
      actorId: user.id,
      payload: { kind, number },
    })
    return { document: doc }
  }

  async listOrders(user: User) {
    const orders = await this.prisma.forwardOrder.findMany({
      include: { shipment: { include: { legs: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return { orders }
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
