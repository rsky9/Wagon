import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AlertsService } from '../alerts/alerts.service'
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
  date?: string
  materialId?: string
  minWeight?: number
  maxWeight?: number
  q?: string
  page?: number
  pageSize?: number
}

const VALID_TRUCK_TYPES = ['open', 'container', 'trailer'] as const

@Injectable()
export class LoadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AlertsService,
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

    const model = await this.prisma.truckModel.findUnique({ where: { id: input.modelId } })
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

    return { load }
  }

  async list(query: ListLoadsQuery, user: User) {
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
    if (query.materialId) {
      where.materialId = query.materialId
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

    // Suppliers see their own loads; transporters see the open feed.
    if (user.role === 'supplier') {
      const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
      where.supplierId = supplier?.id
    }

    const [items, total] = await Promise.all([
      this.prisma.load.findMany({
        where,
        include: { material: true, quotes: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.load.count({ where }),
    ])

    // For transporters, enrich with a smart-match score based on their fleet.
    let enriched = items
    if (user.role === 'transporter') {
      const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
      if (transporter) {
        const fleet = await this.prisma.truck.findMany({ where: { transporterId: transporter.id } })
        enriched = items.map((l) => ({ ...l, matchScore: this.computeMatchScore(l, fleet) }))
      }
    }

    return { items: enriched, total, page, pageSize }
  }

  /**
   * Smart matching: 0-100 score based on truck type match, capacity fit,
   * route compatibility (pickup near truck origin) and historical acceptance.
   */
  private computeMatchScore(load: { truckType: string; weight: number }, fleet: { type: string; weight?: number | null }[]) {
    if (fleet.length === 0) return 40 // no fleet yet — neutral
    const typeMatches = fleet.some((t) => t.type === load.truckType)
    const capacityOk = fleet.some((t) => (t.weight ?? 0) >= load.weight)
    let score = 0
    if (typeMatches) score += 35
    if (capacityOk) score += 35
    score += 15 // route compatibility placeholder (origin proximity)
    score += 15 // acceptance history placeholder
    return Math.min(100, score)
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
    const fleet = await this.prisma.truck.findMany({ where: { transporterId: transporter.id } })
    const enriched = loads.map((l) => ({ ...l, matchScore: this.computeMatchScore(l, fleet) }))
    return { returnLoads: enriched, fromCity: dropCity }
  }

  async detail(id: string) {
    const load = await this.prisma.load.findUnique({
      where: { id },
      include: { material: true, quotes: true },
    })
    if (!load) {
      throw new NotFoundException('Load not found')
    }
    return { load }
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
    return { load: updated }
  }

  async reopen(id: string, user: User) {
    const load = await this.ownedLoad(id, user)
    if (load.status !== 'paused') throw new BadRequestException('Only paused loads can be reopened')
    const updated = await this.prisma.load.update({ where: { id }, data: { status: 'posted' } })
    return { load: updated }
  }

  async cancel(id: string, reason: string, user: User) {
    if (!reason?.trim()) throw new BadRequestException('Cancellation reason is required')
    const load = await this.ownedLoad(id, user)
    if (load.status === 'delivered') throw new BadRequestException('Cannot cancel a delivered load')
    const updated = await this.prisma.load.update({
      where: { id },
      data: { status: 'cancelled', cancelReason: reason.trim() },
    })
    return { load: updated }
  }

  async complete(id: string, user: User) {
    const load = await this.ownedLoad(id, user)
    if (load.status !== 'delivered') throw new BadRequestException('Only delivered loads can be completed')
    const updated = await this.prisma.load.update({ where: { id }, data: { status: 'completed' } })
    return { load: updated }
  }

  /** Supplier load history (completed/expired). */
  async history(user: User) {
    const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
    if (!supplier) return { loads: [] }
    const loads = await this.prisma.load.findMany({
      where: { supplierId: supplier.id, status: { in: ['completed', 'cancelled'] } },
      include: { material: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return { loads }
  }

  private estimateFare(truckType: string, distanceKm: number) {
    const ratePerKm = truckType === 'trailer' ? 25 : truckType === 'container' ? 20 : 15
    return Math.round(distanceKm * ratePerKm)
  }
}
