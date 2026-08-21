import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AlertsService } from '../alerts/alerts.service'
import { NotificationsService } from '../notifications/notifications.service'
import { ShipmentProjector } from '../shipments/shipment-projector.service'
import { MarketService } from '../market/market.service'
import { PaymentsService } from '../payments/payments.service'
import { LoadMatchingService } from '../matching/matching.service'
import type { User } from '@prisma/client'
import type { Load } from '@wagon/contracts'

interface CreateLoadInput {
  pickupAddr: string
  dropAddr: string
  haltAddr?: string
  pickupLat: number
  pickupLng: number
  dropLat: number
  dropLng: number
  haltLat?: number
  haltLng?: number
  date: string
  pickupDate?: string
  dropDate?: string
  truckType: string
  modelId: string
  weight: number
  distanceKm: number
  materialId: string
  bodyType?: string
  description?: string
  loadingReq?: string
  unloadingReq?: string
  specialReq?: string
  documents?: string[]
  advanceAmount?: number
  contactName?: string
  contactPhone?: string
  noOfTrucks?: number
  payLater?: boolean
  // Commercial model + terms
  commercialModel?: string
  referenceRate?: number
  biddingDeadline?: string
  advancePct?: number
  paymentTerms?: string
  extraCharges?: string
}

interface ListLoadsQuery {
  truckType?: string
  modelId?: string
  fromLane?: string
  toLane?: string
  date?: string
  materialId?: string
  minWeight?: number
  maxWeight?: number
  minPrice?: number
  maxPrice?: number
  q?: string
  sort?: 'newest' | 'cheapest' | 'priciest' | 'nearest' | 'lightest' | 'heaviest'
  page?: number
  pageSize?: number
  mine?: boolean
}

const VALID_TRUCK_TYPES = ['open', 'container', 'trailer'] as const

@Injectable()
export class LoadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
    private readonly notifications: NotificationsService,
    private readonly shipments: ShipmentProjector,
    private readonly market: MarketService,
    private readonly payments: PaymentsService,
    private readonly matching: LoadMatchingService,
  ) {}

  async create(input: CreateLoadInput, user: User) {
    if (!VALID_TRUCK_TYPES.includes(input.truckType as (typeof VALID_TRUCK_TYPES)[number])) {
      throw new BadRequestException('Invalid truck type')
    }
    if (!input.pickupAddr || !input.dropAddr || !input.date) {
      throw new BadRequestException('pickupAddr, dropAddr and date are required')
    }
    if (input.distanceKm <= 0) {
      throw new BadRequestException('distanceKm must be positive')
    }

    const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
    if (!supplier) {
      throw new BadRequestException('Supplier profile not found — complete onboarding first')
    }
    // Split-brain guard: posting a load is the supplier-side analogue of a
    // transporter quoting — both must pass their per-capability KYC gate.
    const supplierUser = await this.prisma.user.findUnique({ where: { id: user.id }, select: { supplierVerified: true } })
    if (!supplierUser?.supplierVerified) {
      throw new BadRequestException('Complete KYC verification to post loads')
    }

    const model = await this.prisma.vehicleModel.findUnique({ where: { id: input.modelId } })
    if (!model) {
      throw new BadRequestException('Unknown truck model')
    }
    const material = await this.prisma.material.findUnique({ where: { id: input.materialId } })
    if (!material) {
      throw new BadRequestException('Unknown material')
    }

    const fareEstimate = this.estimateFare(
      input.truckType as (typeof VALID_TRUCK_TYPES)[number],
      input.distanceKm,
    )

    const load = await this.prisma.load.create({
      data: {
        supplierId: supplier.id,
        pickupAddr: input.pickupAddr,
        dropAddr: input.dropAddr,
        haltAddr: input.haltAddr,
        pickupLat: input.pickupLat,
        pickupLng: input.pickupLng,
        dropLat: input.dropLat,
        dropLng: input.dropLng,
        haltLat: input.haltLat,
        haltLng: input.haltLng,
        date: new Date(input.date),
        pickupDate: input.pickupDate ? new Date(input.pickupDate) : null,
        dropDate: input.dropDate ? new Date(input.dropDate) : null,
        truckType: input.truckType as Load['truckType'],
        modelId: input.modelId,
        weight: input.weight,
        distanceKm: input.distanceKm,
        materialId: input.materialId,
        bodyType: input.bodyType,
        description: input.description,
        loadingReq: input.loadingReq,
        unloadingReq: input.unloadingReq,
        specialReq: input.specialReq,
        documents: input.documents ?? [],
        advanceAmount: input.advanceAmount,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        noOfTrucks: input.noOfTrucks ?? 1,
        fareEstimate,
        payLater: input.payLater ?? false,
        commercialModel: (input.commercialModel as Load['commercialModel']) ?? 'fixed_rate',
        referenceRate: input.referenceRate,
        biddingDeadline: input.biddingDeadline ? new Date(input.biddingDeadline) : null,
        advancePct: input.advancePct,
        paymentTerms: input.paymentTerms,
        extraCharges: input.extraCharges,
      },
      include: { material: true },
    })

    // Notify transporters with saved lane alerts matching this load.
    await this.alerts.notifyForLoad(load)

    // Phase 1 — canonical projection: Load -> Shipment + road leg, emit event.
    const shipment = await this.shipments.fromLoad(load as never)
    await this.shipments.emit({
      eventType: 'SHIPMENT',
      eventCode: 'LOAD_CREATED',
      entityType: 'load',
      entityId: load.id,
      orgId: shipment?.ownerOrgId ?? null,
      shipmentId: shipment?.id,
      legId: shipment ? (await this.prisma.shipmentLeg.findFirst({ where: { shipmentId: shipment.id }, orderBy: { sequence: 'asc' } }))?.id : null,
      actorId: user.id,
      location: input.pickupAddr,
      payload: { ref: load.id, route: `${input.pickupAddr} → ${input.dropAddr}` },
    })

    // Marketplace bridge: every posted Load is transport demand on the lane.
    await this.market.publishLoadRequest(load as never, user).catch(() => {})

    return { load }
  }

  async list(query: ListLoadsQuery, user: User) {
    await this.expireStaleLoads()
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(50, query.pageSize ?? 20)
    const where: Record<string, unknown> = { status: { not: 'cancelled' } }

    if (query.truckType) where.truckType = query.truckType
    if (query.modelId) where.modelId = query.modelId
    if (query.date) {
      const day = new Date(query.date)
      const next = new Date(day)
      next.setDate(next.getDate() + 1)
      where.date = { gte: day, lt: next }
    }
    if (query.fromLane) {
      where.pickupAddr = { contains: query.fromLane, mode: 'insensitive' }
    }
    if (query.toLane) {
      where.dropAddr = { contains: query.toLane, mode: 'insensitive' }
    }
    if (query.materialId) {
      where.materialId = query.materialId
    }
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.fareEstimate = {
        ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
      }
    }
    if (query.minWeight !== undefined || query.maxWeight !== undefined) {
      where.weight = {
        ...(query.minWeight !== undefined ? { gte: query.minWeight } : {}),
        ...(query.maxWeight !== undefined ? { lte: query.maxWeight } : {}),
      }
    }
    if (query.q?.trim()) {
      const q = query.q.trim()
      where.OR = [
        { pickupAddr: { contains: q, mode: 'insensitive' } },
        { dropAddr: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ]
    }

    // Suppliers see their own loads; transporters see the open feed. A `mine`
    // flag forces the caller's own loads (e.g. a both-capability user on the
    // "My loads" surface must never see the whole network feed).
    const isSupplier = (user.capabilities?.includes('supplier') as boolean) || user.role === 'supplier'
    const isTransporter = (user.capabilities?.includes('transporter') as boolean) || user.role === 'transporter'
    if ((isSupplier && !isTransporter) || query.mine) {
      const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
      where.supplierId = supplier?.id
    }

    // Quotes are competitive intelligence — only the load's supplier sees them;
    // transporters browsing the open feed must not see other bidders' amounts.
    const includeQuotes = isSupplier && !isTransporter

    // Sort: 'nearest' sorts by distance, everything else by createdAt/fare/weight.
    const orderBy: Record<string, 'asc' | 'desc'> =
      query.sort === 'cheapest' ? { fareEstimate: 'asc' }
      : query.sort === 'priciest' ? { fareEstimate: 'desc' }
      : query.sort === 'lightest' ? { weight: 'asc' }
      : query.sort === 'heaviest' ? { weight: 'desc' }
      : query.sort === 'nearest' ? { distanceKm: 'asc' }
      : { createdAt: 'desc' }

    const [items, total] = await Promise.all([
      this.prisma.load.findMany({
        where,
        include: { material: true, ...(includeQuotes ? { quotes: true } : {}) },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.load.count({ where }),
    ])

    // For transporters, enrich with a smart-match score based on their fleet.
    // The engine matches per-truck (type + capacity + location + goods affinity)
    // so a fleet of distinct truck types surfaces the BEST truck per load.
    let enriched = items
    if (isTransporter) {
      const ctx = await this.matching.fleetContext(user.id)
      enriched = items.map((l) => ({ ...l, ...this.matching.scoreLoad(l, ctx) }))
    }

    return { items: enriched, total, page, pageSize }
  }

  /** Return-load discovery: loads whose pickup is near the drop of a completed trip. */
  async returnLoads(tripId: string, user: User) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { load: true } })
    if (!trip) throw new NotFoundException('Trip not found')
    const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    if (!transporter || transporter.id !== trip.transporterId) throw new BadRequestException('Not your trip')

    // Loads starting near this trip's drop location.
    const dropCity = trip.load.dropAddr.split(',')[0]?.trim()
    const loads = await this.prisma.load.findMany({
      where: {
        status: 'posted',
        pickupAddr: { contains: dropCity, mode: 'insensitive' },
      },
      include: { material: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    const ctx = await this.matching.fleetContext(user.id)
    const enriched = loads.map((l) => ({ ...l, ...this.matching.scoreLoad(l, ctx) }))
    return { returnLoads: enriched, fromCity: dropCity }
  }

  async detail(id: string, user?: User) {
    const load = await this.prisma.load.findUnique({
      where: { id },
      include: { material: true, quotes: true },
    })
    if (!load) {
      throw new NotFoundException('Load not found')
    }
    // Mask contact details AND competitor quote amounts unless the caller is the
    // load's supplier (or a transporter awarded the trip) — competitive info must
    // never leak to any authenticated user.
    const isOwner = user ? (await this.isSupplier(user))?.id === load.supplierId : false
    const isAssigned = user
      ? await this.prisma.trip.findFirst({ where: { loadId: id, transporter: { userId: user.id } } })
      : null
    const canSeeSensitive = isOwner || !!isAssigned
    let visible: Record<string, unknown> = { ...load }
    if (!canSeeSensitive) {
      visible = { ...load, contactName: null, contactPhone: null }
      delete visible.quotes
    }
    // Enablement linkage: the canonical shipment projected from this load.
    const shipment = await this.prisma.shipment.findFirst({ where: { ref: id } })
    return { load: visible, shipmentId: shipment?.id ?? null, shipment: shipment ?? null }
  }

  private async isSupplier(user: User) {
    return this.prisma.supplier.findUnique({ where: { userId: user.id } })
  }

  /** Reveal a load's supplier contact to the load owner or a transporter who has
   *  meaningfully engaged (submitted a bid/quote) — the phone-first contact flow.
   *  Prevents open spam while enabling call/WhatsApp before committing. */
  async contact(id: string, user: User) {
    const load = await this.prisma.load.findUnique({ where: { id } })
    if (!load) throw new NotFoundException('Load not found')
    const isOwner = (await this.isSupplier(user))?.id === load.supplierId
    let canSee = isOwner
    if (!canSee) {
      const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
      if (transporter) {
        // A transporter who has meaningfully engaged (submitted a bid or, once
        // accepted into a trip, holds a quote) may contact the supplier.
        const [bid, quote] = await Promise.all([
          this.prisma.bid.findFirst({
            where: { loadId: id, transporterId: transporter.id, status: { notIn: ['withdrawn'] } },
          }),
          this.prisma.quote.findFirst({ where: { loadId: id, transporterId: transporter.id } }),
        ])
        canSee = !!bid || !!quote
      }
    }
    if (!canSee) throw new ForbiddenException('Contact is shared after you bid on this load')
    return { contactName: load.contactName, contactPhone: load.contactPhone }
  }

  /** Supplier: all quotes/interest received on their posted loads. */
  async responses(user: User) {
    const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
    if (!supplier) return { responses: [] }
    const loads = await this.prisma.load.findMany({
      where: { supplierId: supplier.id },
      include: { quotes: true },
      orderBy: { createdAt: 'desc' },
    })
    const responses = loads.flatMap((l) =>
      l.quotes.map((q) => ({
        quoteId: q.id,
        loadId: l.id,
        route: `${l.pickupAddr} → ${l.dropAddr}`,
        amount: q.amount,
        status: q.status,
        date: l.date,
        createdAt: q.createdAt,
      })),
    )
    responses.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    return { responses }
  }

  /** Supplier load management: pause / reopen / cancel(with reason) / complete. */
  private async ownedLoad(id: string, user: User) {
    const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
    if (!supplier) throw new BadRequestException('Supplier profile not found')
    const load = await this.prisma.load.findFirst({ where: { id, supplierId: supplier.id } })
    if (!load) throw new NotFoundException('Load not found')
    return load
  }

  async pause(id: string, user: User) {
    const load = await this.ownedLoad(id, user)
    if (load.status === 'accepted' || load.status === 'in_transit' || load.status === 'delivered') {
      throw new BadRequestException('Cannot pause an active load')
    }
    const updated = await this.prisma.load.update({ where: { id }, data: { status: 'paused' } })
    await this.shipments.syncFromLoad(id, 'paused', 'LOAD_PAUSED', 'SHIPMENT', user.id)
    return { load: updated }
  }

  async reopen(id: string, user: User) {
    const load = await this.ownedLoad(id, user)
    if (load.status !== 'paused') throw new BadRequestException('Only paused loads can be reopened')
    const updated = await this.prisma.load.update({ where: { id }, data: { status: 'posted' } })
    await this.shipments.syncFromLoad(id, 'posted', 'LOAD_REOPENED', 'SHIPMENT', user.id)
    return { load: updated }
  }

  async reschedule(id: string, body: { date: string; pickupDate?: string; dropDate?: string }, user: User) {
    const load = await this.ownedLoad(id, user)
    if (!['posted', 'interested', 'paused'].includes(load.status)) {
      throw new BadRequestException('Only posted/interested/paused loads can be rescheduled')
    }
    const date = new Date(body.date)
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date')
    if (date.getTime() <= Date.now()) throw new BadRequestException('New pickup date must be in the future')
    const update: Record<string, unknown> = { date, pickupDate: body.pickupDate ? new Date(body.pickupDate) : date }
    if (body.dropDate) {
      const dd = new Date(body.dropDate)
      if (Number.isNaN(dd.getTime())) throw new BadRequestException('Invalid dropDate')
      if (dd.getTime() <= date.getTime()) throw new BadRequestException('Delivery date must be after pickup date')
      update.dropDate = dd
    }
    // Bidding deadline must not already be in the past — otherwise the load
    // would be in an expired-but-still-posted zombie state.
    if (load.biddingDeadline && new Date(load.biddingDeadline).getTime() <= Date.now()) {
      throw new BadRequestException('Bidding deadline has passed — cancel and repost instead')
    }
    const updated = await this.prisma.load.update({ where: { id }, data: update as never })
    await this.shipments.syncFromLoad(id, updated.status, 'LOAD_RESCHEDULED', 'SHIPMENT', user.id)
    return { load: updated }
  }

  async cancel(id: string, reason: string, user: User) {
    if (!reason?.trim()) throw new BadRequestException('Cancellation reason is required')
    const load = await this.ownedLoad(id, user)
    if (load.status === 'delivered') throw new BadRequestException('Cannot cancel a delivered load')

    const { cancelled, trips } = await this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.load.update({
        where: { id },
        data: { status: 'cancelled', cancelReason: reason.trim(), ewbStatus: 'cancelled', ewbCancelledAt: new Date() },
      })
      // Cancel any active trips so none are left orphaned on a cancelled load.
      const trips = await tx.trip.findMany({
        where: { loadId: id, status: { in: ['accepted', 'in_transit'] } },
        include: { transporter: { include: { user: true } } },
      })
      if (trips.length > 0) {
        await tx.trip.updateMany({
          where: { loadId: id, status: { in: ['accepted', 'in_transit'] } },
          data: { status: 'cancelled' },
        })
      }
      // Reset committed bids so the truck isn't blocked forever and the load can
      // be re-posted later.
      await tx.bid.updateMany({ where: { loadId: id }, data: { status: 'withdrawn' } })
      return { cancelled, trips }
    })

    for (const trip of trips) {
      await this.notifications.create({
        userId: trip.transporter.userId,
        type: 'trip_cancelled',
        title: 'Load cancelled — trip cancelled',
        body: `Your trip for load #${id.slice(-6)} was cancelled by the supplier: ${reason.trim()}`,
        data: { tripId: trip.id, loadId: id },
        category: 'trips',
      })
    }

    // Refund any captured escrow/advance/balance on the cancelled trips so the
    // supplier's money actually returns (real provider refund, idempotent).
    for (const trip of trips) {
      await this.payments.refundTripCaptures(trip.id).catch(() => {})
    }

    await this.shipments.syncFromLoad(id, 'cancelled', 'LOAD_CANCELLED', 'EXCEPTION', user.id)

    return { load: cancelled }
  }

  async complete(id: string, user: User) {
    const load = await this.ownedLoad(id, user)
    if (load.status !== 'delivered') throw new BadRequestException('Only delivered loads can be completed')
    const updated = await this.prisma.load.update({ where: { id }, data: { status: 'completed' } })
    await this.shipments.syncFromLoad(id, 'completed', 'LOAD_COMPLETED', 'SHIPMENT', user.id)
    return { load: updated }
  }

  /** Supplier load history (completed/expired). */
  async history(user: User) {
    const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
    if (!supplier) return { loads: [] }
    const loads = await this.prisma.load.findMany({
      where: { supplierId: supplier.id, status: { in: ['completed', 'cancelled', 'expired'] } },
      include: { material: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return { loads }
  }

  /**
   * Lazy expiry sweep: `posted` loads whose bidding deadline (or pickup date)
   * has passed with no accepted bid are moved to `expired`. Runs cheaply on
   * every browse/list call; idempotent and bounded.
   */
  private async expireStaleLoads() {
    const now = new Date()
    const sweep = await this.prisma.load.findMany({
      where: {
        status: 'posted',
        OR: [
          { biddingDeadline: { lt: now } },
          { biddingDeadline: null, pickupDate: { lt: now } },
          { biddingDeadline: null, pickupDate: null, date: { lt: now } },
        ],
      },
      select: { id: true },
      take: 200,
    })
    if (!sweep.length) return
    // Only expire loads with no accepted bid; keep ones that have shortlist activity.
    const accepted = await this.prisma.bid.findMany({
      where: { loadId: { in: sweep.map((l) => l.id) }, status: { in: ['accepted', 'booking_pending', 'shortlisted', 'negotiating'] } },
      select: { loadId: true },
    })
    const protectedIds = new Set(accepted.map((b) => b.loadId))
    const toExpire = sweep.filter((l) => !protectedIds.has(l.id)).map((l) => l.id)
    if (toExpire.length) {
      await this.prisma.load.updateMany({ where: { id: { in: toExpire } }, data: { status: 'expired' } })
    }
  }

  private estimateFare(truckType: string, distanceKm: number) {
    const ratePerKm = truckType === 'trailer' ? 25 : truckType === 'container' ? 20 : 15
    return Math.round(distanceKm * ratePerKm)
  }
}
