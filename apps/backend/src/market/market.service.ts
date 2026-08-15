import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OutboxRelay } from '../outbox/outbox-relay.service'
import { OrgAccessService } from '../org-access/org-access.service'
import { NotificationsService } from '../notifications/notifications.service'
import { PlanningService } from '../planning/planning.service'
import type { User } from '@prisma/client'

const LISTING_KINDS = ['truck_capacity', 'warehouse_space', 'carrier_service', 'forwarder_service']
const REQUEST_KINDS = ['transport', 'warehouse', 'forwarding', 'carrier', 'insurance']

@Injectable()
export class MarketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAccess: OrgAccessService,
    private readonly notifications: NotificationsService,
    @Inject(OutboxRelay) private readonly outbox: OutboxRelay,
    @Inject(PlanningService) private readonly planning: PlanningService,
  ) {}

  // ---------- Lanes (shared primitive) ----------

  /** Normalize a free-text place into a lane key and upsert the Lane. */
  async upsertLane(input: {
    originRef: string
    destinationRef: string
    originLat?: number
    originLng?: number
    destLat?: number
    destLng?: number
    distanceKm?: number
    mode?: string
  }, user: User) {
    if (!input.originRef?.trim() || !input.destinationRef?.trim()) {
      throw new BadRequestException('Lane needs origin and destination')
    }
    const originRef = input.originRef.trim().replace(/\s+/g, ' ').toLowerCase()
    const destinationRef = input.destinationRef.trim().replace(/\s+/g, ' ').toLowerCase()
    const org = await this.orgAccess.primaryOrg(user)
    const lane = await this.prisma.lane.upsert({
      where: { originRef_destinationRef_mode: { originRef, destinationRef, mode: input.mode ?? 'road' } },
      update: {
        originLat: input.originLat ?? undefined,
        originLng: input.originLng ?? undefined,
        destLat: input.destLat ?? undefined,
        destLng: input.destLng ?? undefined,
        distanceKm: input.distanceKm ?? undefined,
      },
      create: {
        originRef,
        destinationRef,
        originLat: input.originLat,
        originLng: input.originLng,
        destLat: input.destLat,
        destLng: input.destLng,
        distanceKm: input.distanceKm,
        mode: input.mode ?? 'road',
        createdByOrgId: org.id,
      },
    })
    return { lane }
  }

  async lanes(query?: { origin?: string; destination?: string; mode?: string }) {
    const where: Record<string, unknown> = {}
    if (query?.origin) where.originRef = { contains: query.origin.toLowerCase() }
    if (query?.destination) where.destinationRef = { contains: query.destination.toLowerCase() }
    if (query?.mode) where.mode = query.mode
    const lanes = await this.prisma.lane.findMany({ where: where as never, take: 100, orderBy: { createdAt: 'desc' } })
    return { lanes }
  }

  // ---------- Phase A: Listings (supply) ----------

  /** Publish a supply listing. */
  async createListing(input: {
    kind: string
    laneId?: string
    originRef?: string
    destinationRef?: string
    city?: string
    equipment?: string
    capacityAvailable?: number
    capacityUnit?: string
    price?: number
    currency?: string
    availableFrom?: string
    availableTo?: string
    description?: string
    sourceType?: string
    sourceId?: string
  }, user: User) {
    if (!LISTING_KINDS.includes(input.kind)) throw new BadRequestException('Invalid listing kind')
    const org = await this.orgAccess.primaryOrg(user)
    const listing = await this.prisma.marketListing.create({
      data: {
        providerOrgId: org.id,
        kind: input.kind,
        laneId: input.laneId,
        originRef: input.originRef,
        destinationRef: input.destinationRef,
        city: input.city,
        equipment: input.equipment,
        capacityAvailable: input.capacityAvailable,
        capacityUnit: input.capacityUnit ?? 'kg',
        price: input.price,
        currency: input.currency ?? 'INR',
        availableFrom: input.availableFrom ? new Date(input.availableFrom) : null,
        availableTo: input.availableTo ? new Date(input.availableTo) : null,
        description: input.description,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        status: 'live',
      },
    })
    await this.outbox.emit(await this.tx(), {
      eventType: 'MARKET',
      eventCode: 'LISTING_CREATED',
      entityType: 'listing',
      entityId: listing.id,
      orgId: org.id,
      actorId: user.id,
      payload: { kind: input.kind, providerOrgId: org.id },
    })
    return { listing }
  }
  /** Browse supply — PUBLIC read (any authenticated user; cross-type discovery). */
  async browseListings(query?: {
    kind?: string
    city?: string
    origin?: string
    destination?: string
    status?: string
    lat?: number
    lng?: number
    radiusKm?: number
  }) {
    // Expiry sweep: listings past their availableTo window go off-market.
    await this.prisma.marketListing.updateMany({
      where: { status: 'live', availableTo: { lte: new Date() } },
      data: { status: 'expired' },
    })
    const where: Record<string, unknown> = { status: query?.status ?? 'live' }
    if (query?.kind) where.kind = query.kind
    if (query?.city) where.city = { contains: query.city.toLowerCase() }
    if (query?.origin) where.originRef = { contains: query.origin.toLowerCase() }
    if (query?.destination) where.destinationRef = { contains: query.destination.toLowerCase() }
    const listings = await this.prisma.marketListing.findMany({
      where: where as never,
      include: { providerOrg: { select: { id: true, name: true, verified: true, verifiedCapabilities: true } }, lane: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    // Radius filter: keep listings whose lane origin is within radiusKm of lat/lng.
    let filtered = listings
    if (query?.lat != null && query.lng != null && query.radiusKm != null) {
      filtered = listings.filter((l) => {
        if (!l.lane?.originLat || !l.lane.originLng) return false
        const d = haversineKm(query.lat!, query.lng!, l.lane.originLat, l.lane.originLng)
        return d <= query.radiusKm!
      })
    }
    // Attach org reputation for trust signals.
    const withRating = await Promise.all(
      filtered.map(async (l) => {
        const trust = await this.orgTrust(l.providerOrgId)
        // Live-state: availability window + freshness + latest provider activity.
        const latestEvent = await this.prisma.logisticsEvent.findFirst({
          where: { orgId: l.providerOrgId },
          orderBy: { occurredAt: 'desc' },
          select: { eventCode: true, occurredAt: true },
        })
        const now = Date.now()
        return {
          ...l,
          orgRating: trust.rating,
          ratingCount: trust.ratingCount,
          completionRate: trust.completionRate,
          claimRate: trust.claimRate,
          activeTrips: trust.trips,
          onMarketNow: !l.availableFrom || new Date(l.availableFrom) <= new Date() ? (!l.availableTo || new Date(l.availableTo) >= new Date()) : false,
          availableFrom: l.availableFrom,
          availableTo: l.availableTo,
          fresh: latestEvent ? Math.round((now - new Date(latestEvent.occurredAt).getTime()) / 36e5) : null,
          lastEvent: latestEvent?.eventCode ?? null,
        }
      }),
    )
    return { listings: withRating }
  }

  async listingDetail(id: string) {
    const listing = await this.prisma.marketListing.findUnique({
      where: { id },
      include: { providerOrg: { select: { id: true, name: true, verified: true, verifiedCapabilities: true } }, lane: true },
    })
    if (!listing) throw new NotFoundException('Listing not found')
    const trust = await this.orgTrust(listing.providerOrgId)
    const latestEvent = await this.prisma.logisticsEvent.findFirst({
      where: { orgId: listing.providerOrgId },
      orderBy: { occurredAt: 'desc' },
      select: { eventCode: true, occurredAt: true },
    })
    return {
      listing: {
        ...listing,
        orgRating: trust.rating,
        ratingCount: trust.ratingCount,
        completionRate: trust.completionRate,
        claimRate: trust.claimRate,
        activeTrips: trust.trips,
        onMarketNow: !listing.availableFrom || new Date(listing.availableFrom) <= new Date() ? (!listing.availableTo || new Date(listing.availableTo) >= new Date()) : false,
        fresh: latestEvent ? Math.round((Date.now() - new Date(latestEvent.occurredAt).getTime()) / 36e5) : null,
        lastEvent: latestEvent?.eventCode ?? null,
      },
    }
  }

  /** Provider pauses/resumes/expires their own listing. */
  async setListingStatus(id: string, status: string, user: User) {
    if (!['live', 'paused', 'expired'].includes(status)) throw new BadRequestException('Invalid listing status')
    const listing = await this.prisma.marketListing.findUnique({ where: { id } })
    if (!listing) throw new NotFoundException('Listing not found')
    if (!(await this.orgAccess.isMember(user, listing.providerOrgId))) throw new ForbiddenException('Not your listing')
    const updated = await this.prisma.marketListing.update({ where: { id }, data: { status } })
    return { listing: updated }
  }

  /** Listings the caller's orgs publish (supply management). */
  async myListings(user: User) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const listings = await this.prisma.marketListing.findMany({
      where: { providerOrgId: { in: orgIds } },
      include: { lane: true, quotes: { select: { id: true, amount: true, status: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { listings }
  }

  /** Auto-publish listings from existing supply records (facilities, consolidations). */
  async publishFromFacility(facilityId: string, user: User) {
    const facility = await this.prisma.facility.findUnique({ where: { id: facilityId } })
    if (!facility) throw new NotFoundException('Facility not found')
    if (!facility.operatorId) throw new BadRequestException('Facility has no operator org')
    const existing = await this.prisma.marketListing.findFirst({
      where: { sourceType: 'facility', sourceId: facilityId },
    })
    if (existing) return { listing: existing }
    const listing = await this.prisma.marketListing.create({
      data: {
        providerOrgId: facility.operatorId,
        kind: 'warehouse_space',
        city: facility.city?.toLowerCase() ?? undefined,
        capacityAvailable: facility.capacitySlots || undefined,
        capacityUnit: 'slots',
        description: `${facility.name} (${facility.kind}) — available slots`,
        sourceType: 'facility',
        sourceId: facilityId,
        status: 'live',
      },
    })
    return { listing }
  }

  /** Auto-publish an LCL/consolidation as forwarder_service supply. */
  async publishFromConsolidation(consolidationId: string, user: User) {
    const con = await this.prisma.consolidation.findUnique({ where: { id: consolidationId } })
    if (!con) throw new NotFoundException('Consolidation not found')
    const existing = await this.prisma.marketListing.findFirst({
      where: { sourceType: 'consolidation', sourceId: consolidationId },
    })
    if (existing) return { listing: existing }
    const listing = await this.prisma.marketListing.create({
      data: {
        providerOrgId: con.forwarderId,
        kind: 'forwarder_service',
        originRef: con.origin?.toLowerCase(),
        destinationRef: con.destination?.toLowerCase(),
        equipment: con.equipment,
        capacityAvailable: con.cargoWeightKg ?? undefined,
        capacityUnit: 'kg',
        description: `${con.ref} — LCL space available`,
        sourceType: 'consolidation',
        sourceId: consolidationId,
        status: 'live',
      },
    })
    return { listing }
  }

  /** Auto-publish a Load as a transport MarketRequest (marketplace bridge). */
  async publishLoadRequest(load: { id: string; pickupAddr: string; dropAddr: string; weight: number; date?: Date | null }, user: User) {
    const org = await this.orgAccess.primaryOrg(user)
    const existing = await this.prisma.marketRequest.findFirst({
      where: { sourceType: 'load', sourceId: load.id },
    })
    if (existing) return { request: existing }
    const request = await this.prisma.marketRequest.create({
      data: {
        requesterOrgId: org.id,
        kind: 'transport',
        originRef: load.pickupAddr.toLowerCase(),
        destinationRef: load.dropAddr.toLowerCase(),
        capacityNeeded: load.weight * 1000,
        capacityUnit: 'kg',
        date: load.date ?? undefined,
        description: `Transport demand from load ${load.id.slice(-6)}`,
        sourceType: 'load',
        sourceId: load.id,
        status: 'open',
      },
    })
    return { request }
  }

  /** Auto-publish a Shipment as a transport MarketRequest when it's planned. */
  async publishShipmentRequest(shipment: { id: string; commodity?: string | null; weightKg?: number | null }, user: User) {
    const org = await this.orgAccess.primaryOrg(user)
    const existing = await this.prisma.marketRequest.findFirst({
      where: { sourceType: 'shipment', sourceId: shipment.id },
    })
    if (existing) return { request: existing }
    const request = await this.prisma.marketRequest.create({
      data: {
        requesterOrgId: org.id,
        kind: 'transport',
        capacityNeeded: shipment.weightKg ?? undefined,
        capacityUnit: 'kg',
        description: `Transport demand for ${shipment.commodity ?? 'shipment'} ${shipment.id.slice(-6)}`,
        sourceType: 'shipment',
        sourceId: shipment.id,
        status: 'open',
      },
    })
    return { request }
  }

  /** Auto-publish a truck as truck_capacity supply. */
  async publishTruck(truck: { id: string; type: string; origin?: string | null; activeStatus?: boolean | null }, user: User) {
    const org = await this.orgAccess.primaryOrg(user)
    const existing = await this.prisma.marketListing.findFirst({
      where: { sourceType: 'truck', sourceId: truck.id },
    })
    if (existing) {
      // Keep availability in sync with activeStatus.
      if (truck.activeStatus === false && existing.status === 'live') {
        await this.prisma.marketListing.update({ where: { id: existing.id }, data: { status: 'paused' } })
      } else if (truck.activeStatus !== false && existing.status === 'paused') {
        await this.prisma.marketListing.update({ where: { id: existing.id }, data: { status: 'live' } })
      }
      return { listing: existing }
    }
    const listing = await this.prisma.marketListing.create({
      data: {
        providerOrgId: org.id,
        kind: 'truck_capacity',
        city: truck.origin?.toLowerCase() ?? undefined,
        originRef: truck.origin?.toLowerCase(),
        equipment: truck.type,
        capacityUnit: 'kg',
        description: `${truck.type} truck available from ${truck.origin ?? 'origin'}`,
        sourceType: 'truck',
        sourceId: truck.id,
        status: truck.activeStatus === false ? 'paused' : 'live',
      },
    })
    return { listing }
  }

  // ---------- Phase B: Requests (demand) + Quotes ----------

  /** Post a universal demand request (transport | warehouse | forwarding | carrier | insurance). */
  async createRequest(input: {
    kind: string
    laneId?: string
    originRef?: string
    destinationRef?: string
    city?: string
    capacityNeeded?: number
    capacityUnit?: string
    date?: string
    budget?: number
    currency?: string
    description?: string
    sourceType?: string
    sourceId?: string
  }, user: User) {
    if (!REQUEST_KINDS.includes(input.kind)) throw new BadRequestException('Invalid request kind')
    const org = await this.orgAccess.primaryOrg(user)
    const request = await this.prisma.marketRequest.create({
      data: {
        requesterOrgId: org.id,
        kind: input.kind,
        laneId: input.laneId,
        originRef: input.originRef,
        destinationRef: input.destinationRef,
        city: input.city,
        capacityNeeded: input.capacityNeeded,
        capacityUnit: input.capacityUnit ?? 'kg',
        date: input.date ? new Date(input.date) : null,
        budget: input.budget,
        currency: input.currency ?? 'INR',
        description: input.description,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        status: 'open',
      },
    })
    await this.outbox.emit(await this.tx(), {
      eventType: 'MARKET',
      eventCode: 'REQUEST_CREATED',
      entityType: 'request',
      entityId: request.id,
      orgId: org.id,
      actorId: user.id,
      payload: { kind: input.kind, requesterOrgId: org.id },
    })
    // Notify providers who subscribed to lane alerts matching this demand.
    if (request.originRef) {
      const alerts = await this.prisma.laneAlert.findMany({
        where: { isActive: true, OR: [{ fromLane: { contains: request.originRef } }, { fromLane: { contains: request.city ?? request.originRef } }] },
        include: { transporter: { include: { user: true } } },
      })
      for (const a of alerts) {
        await this.notifications.create({
          userId: a.transporter.userId,
          type: 'market_request',
          title: 'New demand near your lane',
          body: `${request.kind} demand: ${request.originRef} → ${request.destinationRef ?? '—'}`,
          data: { requestId: request.id, kind: request.kind },
          category: 'market',
        }).catch(() => {})
      }
    }
    // Reverse bridge: a direct transport request also enters the classic load
    // feed so transporters using the legacy marketplace see it too.
    if (request.kind === 'transport' && !input.sourceType) {
      try {
        await this.bridgeToLoad(request, user)
      } catch (e) {
        console.error('[market] bridgeToLoad failed:', e)
      }
    }
    return { request }
  }

  /** Create a classic Load mirroring a transport MarketRequest. */
  private async bridgeToLoad(request: { id: string; originRef?: string | null; destinationRef?: string | null; capacityNeeded?: number | null }, user: User) {
    const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
    if (!supplier) return null
    const material = await this.prisma.material.findFirst()
    const model = await this.prisma.truckModel.findFirst()
    if (!material || !model) return null
    const weightT = Math.max(1, Math.round((request.capacityNeeded ?? 1000) / 1000))
    await this.prisma.load.create({
      data: {
        supplierId: supplier.id,
        pickupAddr: request.originRef ?? 'Origin',
        dropAddr: request.destinationRef ?? 'Destination',
        pickupLat: 0,
        pickupLng: 0,
        dropLat: 0,
        dropLng: 0,
        date: new Date(),
        truckType: 'open',
        modelId: model.id,
        weight: weightT,
        distanceKm: 100,
        materialId: material.id,
        fareEstimate: weightT * 100 * 15,
        status: 'posted' as never,
      } as never,
    })
    return null
  }

  /**
   * Reverse direction: a requester finds a listing and asks that provider to
   * fulfill their need. Creates a request pre-linked to the listing and
   * notifies the provider's org members.
   */
  async requestFromListing(input: {
    listingId: string
    capacityNeeded?: number
    budget?: number
    originRef?: string
    destinationRef?: string
    city?: string
    description?: string
  }, user: User) {
    const listing = await this.prisma.marketListing.findUnique({ where: { id: input.listingId } })
    if (!listing) throw new NotFoundException('Listing not found')
    if (listing.status !== 'live') throw new BadRequestException('Listing is not live')
    const requester = await this.orgAccess.primaryOrg(user)
    // Block if the requester belongs to the listing's provider org (can't ask yourself).
    if (await this.orgAccess.isMember(user, listing.providerOrgId)) {
      throw new BadRequestException('Cannot request from your own listing')
    }
    const kindFromListing: Record<string, string> = {
      truck_capacity: 'transport',
      warehouse_space: 'warehouse',
      carrier_service: 'carrier',
      forwarder_service: 'forwarding',
    }
    const request = await this.prisma.marketRequest.create({
      data: {
        requesterOrgId: requester.id,
        kind: kindFromListing[listing.kind] ?? 'transport',
        laneId: listing.laneId,
        originRef: input.originRef ?? listing.originRef,
        destinationRef: input.destinationRef ?? listing.destinationRef,
        city: input.city ?? listing.city,
        capacityNeeded: input.capacityNeeded,
        capacityUnit: listing.capacityUnit,
        budget: input.budget,
        description: input.description ?? `Requested from ${listing.description ?? 'listing'} ${listing.id.slice(-6)}`,
        listingId: listing.id,
        sourceType: 'listing',
        sourceId: listing.id,
        status: 'open',
      },
    })
    // Notify the provider's org members that demand arrived against their listing.
    const members = await this.prisma.organizationMember.findMany({ where: { organizationId: listing.providerOrgId } })
    for (const m of members) {
      await this.notifications.create({
        userId: m.userId,
        type: 'market_ask',
        title: 'Demand on your listing',
        body: `Someone needs ${request.kind} from your ${listing.kind} listing`,
        data: { requestId: request.id, listingId: listing.id },
        category: 'market',
      }).catch(() => {})
    }
    return { request, listing }
  }

  /** Browse open demand — PUBLIC read (providers discover what's needed). */
  async browseRequests(query?: { kind?: string; city?: string; status?: string; lat?: number; lng?: number; radiusKm?: number }) {
    // Request expiry: open/quoted requests older than 30 days with no booking auto-close.
    const expiryCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    await this.prisma.marketRequest.updateMany({
      where: { status: { in: ['open', 'quoted'] }, createdAt: { lte: expiryCutoff } },
      data: { status: 'closed' },
    })
    const where: Record<string, unknown> = { status: query?.status ?? 'open' }
    if (query?.kind) where.kind = query.kind
    if (query?.city) where.city = { contains: query.city.toLowerCase() }
    const requests = await this.prisma.marketRequest.findMany({
      where: where as never,
      include: { requesterOrg: { select: { id: true, name: true, verified: true } }, lane: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    // Radius filter on the request's lane origin.
    let filtered = requests
    if (query?.lat != null && query.lng != null && query.radiusKm != null) {
      filtered = requests.filter((r) => {
        if (!r.lane?.originLat || !r.lane.originLng) return false
        return haversineKm(query.lat!, query.lng!, r.lane.originLat, r.lane.originLng) <= query.radiusKm!
      })
    }
    // Attach requester trust so providers can decide whether to quote.
    const withTrust = await Promise.all(
      filtered.map(async (r) => {
        const rating = await this.orgAverageRating(r.requesterOrgId)
        const trust = await this.orgTrust(r.requesterOrgId)
        return { ...r, requesterRating: rating.avg, requesterCompletion: trust.completionRate }
      }),
    )
    return { requests: withTrust }
  }

  /** The requester manually closes their own open request. */
  async closeRequest(requestId: string, user: User) {
    const request = await this.prisma.marketRequest.findUnique({ where: { id: requestId } })
    if (!request) throw new NotFoundException('Request not found')
    const orgIds = await this.orgAccess.memberOrgIds(user)
    if (!orgIds.includes(request.requesterOrgId)) throw new ForbiddenException('Not your request')
    if (request.status === 'booked' || request.status === 'closed') throw new BadRequestException(`Request is ${request.status}`)
    const updated = await this.prisma.marketRequest.update({ where: { id: requestId }, data: { status: 'closed' } })
    return { request: updated }
  }

  /** My posted requests. */
  async myRequests(user: User) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const requests = await this.prisma.marketRequest.findMany({
      where: { requesterOrgId: { in: orgIds } },
      include: { quotes: { include: { providerOrg: true } }, lane: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return { requests }
  }

  /** Quotes I submitted (provider view) with their requests. */
  async myQuotes(user: User) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const quotes = await this.prisma.marketQuote.findMany({
      where: { providerOrgId: { in: orgIds } },
      include: { request: { include: { requesterOrg: { select: { id: true, name: true, kind: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return { quotes }
  }

  /** Inbound requests on my listings (provider view). */
  async listingRequests(user: User) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const listings = await this.prisma.marketListing.findMany({
      where: { providerOrgId: { in: orgIds } },
      select: { id: true, kind: true, originRef: true, destinationRef: true, sourceType: true, sourceId: true },
    })
    const listingIds = listings.map((l) => l.id)
    const requests = await this.prisma.marketRequest.findMany({
      where: { listingId: { in: listingIds } },
      include: { requesterOrg: { select: { id: true, name: true, kind: true } }, quotes: true, listing: { select: { kind: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return { listings, requests }
  }

  /** A provider submits a quote on an open request. */
  async submitQuote(requestId: string, input: { listingId?: string; amount?: number; currency?: string; etaHours?: number; message?: string }, user: User) {
    const request = await this.prisma.marketRequest.findUnique({ where: { id: requestId } })
    if (!request) throw new NotFoundException('Request not found')
    if (request.status !== 'open' && request.status !== 'quoted') {
      throw new BadRequestException(`Request is ${request.status}`)
    }
    // Attribute the quote to the provider's org. When quoting against a specific
    // listing, that listing's org is authoritative; otherwise resolve by request
    // kind (warehouse -> warehouse org, carrier -> carrier org, ...) with
    // primaryOrg as fallback.
    let org: { id: string }
    if (input.listingId) {
      const listing = await this.prisma.marketListing.findUnique({ where: { id: input.listingId } })
      if (!listing) throw new NotFoundException('Listing not found')
      org = { id: listing.providerOrgId }
    } else {
      const kindToOrgKind: Record<string, string[]> = {
        warehouse: ['warehouse', 'cfs', 'icd', 'yard'],
        carrier: ['carrier'],
        forwarding: ['forwarder'],
        insurance: ['carrier', 'broker', 'other'],
        transport: ['transporter', 'shipper'],
      }
      const candidateKinds = kindToOrgKind[request.kind]
      org = await this.orgAccess.primaryOrg(user)
      if (candidateKinds) {
        const matched = await this.orgAccess.orgsOfKind(user, candidateKinds)
        if (matched.length > 0) org = { id: matched[0]!.id }
      }
    }
    if (request.requesterOrgId === org.id) throw new BadRequestException('Cannot quote your own request')
    const quote = await this.prisma.marketQuote.create({
      data: {
        requestId,
        providerOrgId: org.id,
        listingId: input.listingId,
        amount: input.amount,
        currency: input.currency ?? 'INR',
        etaHours: input.etaHours,
        message: input.message,
        status: 'submitted',
      },
    })
    await this.prisma.marketRequest.update({ where: { id: requestId }, data: { status: 'quoted' } })
    // Notify the requester's org members that a quote arrived.
    const members = await this.prisma.organizationMember.findMany({ where: { organizationId: request.requesterOrgId } })
    for (const m of members) {
      await this.notifications.create({
        userId: m.userId,
        type: 'market_quote',
        title: 'New quote received',
        body: `Your ${request.kind} demand got a quote of ${quote.amount != null ? `${quote.currency} ${quote.amount}` : '—'}`,
        data: { requestId, quoteId: quote.id },
        category: 'market',
      }).catch(() => {})
    }
    return { quote }
  }

  /** The requester accepts a quote -> request booked + operational object created. */
  async acceptQuote(quoteId: string, user: User) {
    const quote = await this.prisma.marketQuote.findUnique({
      where: { id: quoteId },
      include: { request: { include: { lane: true } }, listing: true, providerOrg: true },
    })
    if (!quote) throw new NotFoundException('Quote not found')
    const orgIds = await this.orgAccess.memberOrgIds(user)
    if (!orgIds.includes(quote.request.requesterOrgId)) throw new ForbiddenException('Only the requester can accept')
    if (quote.status !== 'submitted') throw new BadRequestException(`Quote is ${quote.status}`)
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.marketQuote.updateMany({
        where: { requestId: quote.requestId, status: 'submitted' },
        data: { status: 'rejected' },
      })
      const accepted = await tx.marketQuote.update({ where: { id: quoteId }, data: { status: 'accepted' } })
      await tx.marketRequest.update({ where: { id: quote.requestId }, data: { status: 'booked' } })
      // Materialize the booked request into an operational object so the
      // execute/settle layers can run (not just a paper booking).
      await this.materializeBooking(tx as unknown as Record<string, never>, quote)
      // Money flow: the accepted quote becomes a settlement (requester pays provider).
      let settlementId: string | null = null
      if (quote.amount != null) {
        const shipment = await tx.shipment.findFirst({ where: { ownerOrgId: quote.request.requesterOrgId } })
        const settlement = await tx.settlement.create({
          data: {
            shipmentId: shipment?.id ?? quote.request.id,
            payerId: quote.request.requesterOrgId,
            payeeId: quote.providerOrgId,
            type: 'freight',
            amount: quote.amount,
            currency: quote.currency,
            status: 'due',
          },
        })
        settlementId = settlement.id
      }
      return { accepted, settlementId }
    })
    // Notify the provider's org members that their quote was accepted.
    const providerMembers = await this.prisma.organizationMember.findMany({ where: { organizationId: quote.providerOrgId } })
    for (const m of providerMembers) {
      await this.notifications.create({
        userId: m.userId,
        type: 'market_accepted',
        title: 'Your quote was accepted',
        body: `Your quote of ${quote.amount != null ? `${quote.currency} ${quote.amount}` : '—'} for ${quote.request.kind} demand was accepted`,
        data: { requestId: quote.requestId, quoteId },
        category: 'market',
      }).catch(() => {})
    }
    return { quote: updated.accepted, settlementId: updated.settlementId }
  }

  /** A provider withdraws their own submitted quote. */
  async withdrawQuote(quoteId: string, user: User) {
    const quote = await this.prisma.marketQuote.findUnique({ where: { id: quoteId }, include: { request: true } })
    if (!quote) throw new NotFoundException('Quote not found')
    if (!(await this.orgAccess.isMember(user, quote.providerOrgId))) throw new ForbiddenException('Not your quote')
    if (quote.status !== 'submitted') throw new BadRequestException(`Quote is ${quote.status}`)
    const updated = await this.prisma.marketQuote.update({ where: { id: quoteId }, data: { status: 'withdrawn' } })
    // Revert the request to open if no other quotes remain.
    const otherSubmitted = await this.prisma.marketQuote.count({ where: { requestId: quote.requestId, status: 'submitted' } })
    if (otherSubmitted === 0 && quote.request.status === 'quoted') {
      await this.prisma.marketRequest.update({ where: { id: quote.requestId }, data: { status: 'open' } })
    }
    return { quote: updated }
  }

  /** A requester rejects a specific quote (leaves others open). */
  async rejectQuote(quoteId: string, user: User) {
    const quote = await this.prisma.marketQuote.findUnique({ where: { id: quoteId }, include: { request: true } })
    if (!quote) throw new NotFoundException('Quote not found')
    const orgIds = await this.orgAccess.memberOrgIds(user)
    if (!orgIds.includes(quote.request.requesterOrgId)) throw new ForbiddenException('Only the requester can reject')
    if (quote.status !== 'submitted') throw new BadRequestException(`Quote is ${quote.status}`)
    const updated = await this.prisma.marketQuote.update({ where: { id: quoteId }, data: { status: 'rejected' } })
    return { quote: updated }
  }

  /** Map an accepted request to its operational object by kind. */
  private async materializeBooking(tx: { [k: string]: any }, quote: {
    request: { id: string; kind: string; requesterOrgId: string; originRef?: string | null; destinationRef?: string | null; city?: string | null; capacityNeeded?: number | null }
    providerOrgId: string
    amount?: number | null
    currency: string
    listing?: { id: string; sourceType?: string | null; sourceId?: string | null } | null
  }) {
    const r = quote.request
    switch (r.kind) {
      case 'warehouse': {
        // Find an operator facility near the requested city and open an operation.
        const facility = await tx.facility.findFirst({
          where: { operatorId: quote.providerOrgId, city: { contains: r.city ?? r.originRef ?? '' } },
        })
        if (facility) {
          const shipment = await tx.shipment.findFirst({ where: { ownerOrgId: r.requesterOrgId } })
          await tx.warehouseOperation.create({
            data: {
              facilityId: facility.id,
              shipmentId: shipment?.id ?? null,
              operatorId: quote.providerOrgId,
              ref: `MK-${r.id.slice(-6)}`,
              status: 'appointment',
              appointmentAt: new Date(),
            },
          })
        }
        break
      }
      case 'carrier': {
        await tx.carrierBooking.create({
          data: {
            shipmentId: (await tx.shipment.findFirst({ where: { ownerOrgId: r.requesterOrgId } }))?.id ?? '',
            carrierId: quote.providerOrgId,
            bookingRef: `MK-${r.id.slice(-6)}`,
            rate: quote.amount,
            currency: quote.currency,
            status: 'confirmed',
          },
        })
        break
      }
      case 'forwarding': {
        const shipment = await tx.shipment.findFirst({ where: { ownerOrgId: r.requesterOrgId } })
        if (shipment) {
          await tx.forwardOrder.create({
            data: {
              forwarderId: quote.providerOrgId,
              customerId: r.requesterOrgId,
              shipmentId: shipment.id,
              ref: `MK-${r.id.slice(-6)}`,
              buyAmount: quote.amount ?? null,
              sellAmount: null,
              currency: quote.currency,
              status: 'intake',
            },
          })
        }
        break
      }
      case 'insurance': {
        const shipment = await tx.shipment.findFirst({ where: { ownerOrgId: r.requesterOrgId } })
        if (shipment) {
          await tx.insurancePolicy.create({
            data: {
              shipmentId: shipment.id,
              insurerId: quote.providerOrgId,
              policyRef: `MK-${r.id.slice(-6)}`,
              premium: quote.amount ?? null,
              coverage: quote.amount ? quote.amount * 10 : null,
              currency: quote.currency,
              status: 'active',
            },
          })
        }
        break
      }
      default: {
        // transport: create the canonical Shipment + road leg + a CarrierBooking
        // so booked road capacity is operational in the enablement model.
        const shipment = await tx.shipment.create({
          data: {
            ref: `MK-TR-${r.id.slice(-6)}`,
            ownerOrgId: r.requesterOrgId,
            commodity: 'transport',
            status: 'booked',
            mode: 'road',
            originId: quote.providerOrgId,
            destinationId: r.requesterOrgId,
          },
        })
        await tx.shipmentLeg.create({
          data: {
            shipmentId: shipment.id,
            sequence: 1,
            mode: 'road',
            pickupAddr: r.originRef ?? r.city ?? 'origin',
            dropAddr: r.destinationRef ?? 'destination',
            status: 'booked',
            providerId: quote.providerOrgId,
            bookedAt: new Date(),
          },
        })
        await tx.carrierBooking.create({
          data: {
            shipmentId: shipment.id,
            carrierId: quote.providerOrgId,
            bookingRef: `MK-TR-${r.id.slice(-6)}`,
            rate: quote.amount,
            currency: quote.currency,
            status: 'confirmed',
          },
        })
        break
      }
    }
  }

  /** Quotes on a request (requester or participants). */
  async quotesFor(requestId: string, user: User) {
    const request = await this.prisma.marketRequest.findUnique({ where: { id: requestId } })
    if (!request) throw new NotFoundException('Request not found')
    const orgIds = await this.orgAccess.memberOrgIds(user)
    if (!orgIds.includes(request.requesterOrgId)) throw new ForbiddenException('Not your request')
    const quotes = await this.prisma.marketQuote.findMany({
      where: { requestId },
      include: { providerOrg: { select: { id: true, name: true, verified: true, verifiedCapabilities: true } } },
      orderBy: { amount: 'asc' },
    })
    return { quotes }
  }

  /** Match a request against live listings (cross-type ranking). */
  async matchRequest(requestId: string, user: User) {
    const request = await this.prisma.marketRequest.findUnique({ where: { id: requestId } })
    if (!request) throw new NotFoundException('Request not found')
    const orgIds = await this.orgAccess.memberOrgIds(user)
    if (!orgIds.includes(request.requesterOrgId)) throw new ForbiddenException('Not your request')

    const kindToListing = {
      transport: 'truck_capacity',
      warehouse: 'warehouse_space',
      forwarding: 'forwarder_service',
      carrier: 'carrier_service',
    } as Record<string, string>

    const listingKind = kindToListing[request.kind]
    const where: Record<string, unknown> = { status: 'live' }
    if (listingKind) where.kind = listingKind
    const candidates = await this.prisma.marketListing.findMany({
      where: where as never,
      include: { providerOrg: true, lane: true },
    })

    const scored = await Promise.all(
      candidates.map(async (c) => {
        let score = 0
        if (request.laneId && c.laneId === request.laneId) score += 40
        if (request.originRef && c.originRef && request.originRef === c.originRef) score += 15
        if (request.destinationRef && c.destinationRef && request.destinationRef === c.destinationRef) score += 15
        if (request.city && c.city && request.city === c.city) score += 20
        if (c.capacityAvailable && request.capacityNeeded && c.capacityAvailable >= request.capacityNeeded) score += 10
        const orgRating = await this.orgAverageRating(c.providerOrgId)
        score += (orgRating.avg ?? 3) * 2 // up to +10
        // Reliability: completion rate rewards orgs that actually finish work.
        const trust = await this.orgTrust(c.providerOrgId)
        if (trust.completionRate != null) {
          score += (trust.completionRate / 100) * 10 // up to +10
        }
        // Per-kind verification: the provider verified FOR this role outranks
        // a generic verified org.
        const kinds: string[] = (c.providerOrg.verifiedCapabilities as string[] | null) ?? []
        const kindMatch = kinds.some((k) => {
          const map: Record<string, string> = { truck_capacity: 'transporter', warehouse_space: 'warehouse', carrier_service: 'carrier', forwarder_service: 'forwarder' }
          return k === (map[c.kind] ?? '')
        })
        if (c.providerOrg.verified) score += 5
        if (kindMatch) score += 5
        return { ...c, score, orgRating: orgRating.avg, completionRate: trust.completionRate }
      }),
    )
    const matches = scored.sort((a, b) => b.score - a.score).slice(0, 10)
    return { matches }
  }

  // ---------- Layer 3: capability decomposition ----------

  /**
   * Decompose one need into a multi-party Plan. The caller gives a route spec
   * (one or more legs: origin/destination/mode/kind), and each leg is fanned
   * out to live listings of the matching capability kind, scored by lane/city/
   * capacity fit + rating + completion, then the best provider per leg is
   * assembled into a single Plan the orderer can select. This is the
   * "describe an outcome, get a plan" engine.
   */
  async decompose(input: {
    requestId: string
    legs: Array<{
      origin: string
      destination?: string
      city?: string
      mode?: string
      kind?: string
      capacityNeeded?: number
    }>
  }, user: User) {
    if (!input.legs?.length) throw new BadRequestException('Need at least one leg')
    if (input.legs.length > 12) throw new BadRequestException('At most 12 legs')

    const request = await this.prisma.marketRequest.findUnique({ where: { id: input.requestId } })
    if (!request) throw new NotFoundException('Request not found')
    const orgIds = await this.orgAccess.memberOrgIds(user)
    if (!orgIds.includes(request.requesterOrgId)) throw new ForbiddenException('Not your request')

    // Capability kind -> listing kind, and -> plan-leg mode.
    const KIND_TO_LISTING: Record<string, string> = {
      transport: 'truck_capacity',
      warehouse: 'warehouse_space',
      forwarding: 'forwarder_service',
      carrier: 'carrier_service',
    }
    const KIND_TO_MODE: Record<string, string> = {
      transport: 'road',
      warehouse: 'road',
      forwarding: 'multimodal',
      carrier: 'ocean',
    }

    let totalCost = 0
    let totalEta = 0
    const planLegs: Array<Record<string, unknown>> = []
    const selections: Array<{ legIndex: number; listing: Record<string, unknown>; providerOrgId: string }> = []

    for (let i = 0; i < input.legs.length; i++) {
      const leg = input.legs[i]!
      const legKind = leg.kind ?? request.kind
      const listingKind = KIND_TO_LISTING[legKind]
      const mode = leg.mode ?? KIND_TO_MODE[legKind] ?? 'road'

      const where: Record<string, unknown> = { status: 'live' }
      if (listingKind) where.kind = listingKind
      const candidates = await this.prisma.marketListing.findMany({
        where: where as never,
        include: { providerOrg: { select: { id: true, name: true, verified: true, verifiedCapabilities: true } }, lane: true },
      })

      // Score candidates for this leg (reuse the matchRequest scoring shape).
      const scored = await Promise.all(
        candidates.map(async (c) => {
          let score = 0
          const o = leg.origin.toLowerCase()
          const d = leg.destination?.toLowerCase()
          const laneHit =
            (c.originRef && c.originRef.toLowerCase() === o) ||
            (c.city && c.city.toLowerCase() === o) ||
            (d && c.destinationRef && c.destinationRef.toLowerCase() === d)
          if (laneHit) score += 25
          if (c.originRef && c.originRef.toLowerCase() === o) score += 20
          if (c.city && c.city.toLowerCase() === o) score += 15
          if (d && c.destinationRef && c.destinationRef.toLowerCase() === d) score += 15
          if (leg.capacityNeeded && c.capacityAvailable && c.capacityAvailable >= leg.capacityNeeded) score += 10
          const rating = await this.orgAverageRating(c.providerOrgId)
          score += (rating.avg ?? 3) * 2
          const trust = await this.orgTrust(c.providerOrgId)
          if (trust.completionRate != null) score += (trust.completionRate / 100) * 10
          const kinds: string[] = (c.providerOrg.verifiedCapabilities as string[] | null) ?? []
          if (c.providerOrg.verified) score += 5
          if (kinds.some((k) => k === (listingKind === 'warehouse_space' ? 'warehouse' : listingKind === 'carrier_service' ? 'carrier' : listingKind === 'forwarder_service' ? 'forwarder' : 'transporter'))) score += 5
          return { listing: c, score, rating: rating.avg, completionRate: trust.completionRate, laneHit }
        }),
      )
      scored.sort((a, b) => b.score - a.score)

      // Only listings touching the requested lane/city can fulfill this leg;
      // a listing on a completely different lane is not a viable option.
      const viable = scored.filter((s) => s.laneHit)
      if (viable.length === 0) {
        return {
          request,
          plan: null,
          note: `No live ${listingKind ?? legKind} supply on lane ${leg.origin} → ${leg.destination ?? leg.city ?? '—'} for leg ${i + 1}`,
          selections,
          unsatisfiable: true,
        }
      }

      const best = viable[0]!
      const cost = (best.listing.price ?? 0) || 0
      totalCost += cost
      const eta = 24 + (best.listing.capacityAvailable ? (best.listing.capacityAvailable > 5000 ? 12 : 6) : 0)
      totalEta += eta
      planLegs.push({
        mode,
        origin: leg.origin,
        destination: leg.destination ?? leg.city,
        equipment: best.listing.equipment ?? undefined,
        providerId: best.listing.providerOrgId,
        cost: cost || undefined,
        etaHours: eta,
      })
      selections.push({ legIndex: i, listing: best.listing, providerOrgId: best.listing.providerOrgId })
    }

    // Assemble a Plan for the shipment behind the request (or a new one).
    const plan = await this.planning.propose(
      { shipmentId: (await this.ensureShipmentForRequest(request.id, user)).id, source: 'market_decompose', legs: planLegs as never, cost: totalCost, etaHours: totalEta },
      user,
    )

    await this.outbox.emit(await this.tx(), {
      eventType: 'PLAN',
      eventCode: 'PLAN_DECOMPOSED',
      entityType: 'request',
      entityId: request.id,
      orgId: request.requesterOrgId,
      actorId: user.id,
      payload: { planRef: plan.plan.ref, legCount: planLegs.length, cost: totalCost, etaHours: totalEta },
    })

    return { request, plan: plan.plan, selections, legs: planLegs, cost: totalCost, etaHours: totalEta, unsatisfiable: false }
  }

  /** A MarketRequest may not have a shipment; create a canonical one to hold the plan. */
  private async ensureShipmentForRequest(requestId: string, user: User) {
    const existing = await this.prisma.shipment.findFirst({ where: { ref: `MRQ-${requestId.slice(-8)}` } })
    if (existing) return existing
    return this.prisma.shipment.create({
      data: {
        ref: `MRQ-${requestId.slice(-8)}`,
        ownerOrgId: (await this.orgAccess.primaryOrg(user)).id,
        commodity: 'Marketplace request',
        status: 'draft',
      },
    })
  }

  // ---------- Layer 4: failure -> instant re-procurement ----------

  /**
   * Find a live replacement provider for a failed leg's lane. Returns the best
   * matching listing (kind implied by mode) so the planner can re-procure
   * instantly instead of falling back to a static mode flip.
   */
  async findReplacementForLane(input: { originRef?: string | null; destinationRef?: string | null; mode?: string | null; capacityNeeded?: number }, user: User) {
    const MODE_TO_KIND: Record<string, string[]> = {
      road: ['truck_capacity'],
      rail: ['truck_capacity'],
      inland_water: ['truck_capacity'],
      ocean: ['carrier_service'],
      air: ['carrier_service'],
      multimodal: ['forwarder_service', 'truck_capacity', 'carrier_service'],
    }
    const kinds = input.mode ? (MODE_TO_KIND[input.mode] ?? ['truck_capacity', 'carrier_service']) : ['truck_capacity', 'carrier_service', 'warehouse_space', 'forwarder_service']

    const where: Record<string, unknown> = { status: 'live', kind: { in: kinds } }
    const candidates = await this.prisma.marketListing.findMany({
      where: where as never,
      include: { providerOrg: { select: { id: true, name: true, verified: true } } },
    })

    const o = input.originRef?.toLowerCase()
    const d = input.destinationRef?.toLowerCase()
    const scored = await Promise.all(
      candidates.map(async (c) => {
        let score = 0
        if (o && c.originRef && c.originRef.toLowerCase() === o) score += 30
        if (d && c.destinationRef && c.destinationRef.toLowerCase() === d) score += 30
        if (input.capacityNeeded && c.capacityAvailable && c.capacityAvailable >= input.capacityNeeded) score += 10
        const rating = await this.orgAverageRating(c.providerOrgId)
        score += (rating.avg ?? 3) * 2
        const trust = await this.orgTrust(c.providerOrgId)
        if (trust.completionRate != null) score += (trust.completionRate / 100) * 10
        if (c.providerOrg.verified) score += 5
        return { listing: c, score, rating: rating.avg, completionRate: trust.completionRate }
      }),
    )
    scored.sort((a, b) => b.score - a.score)
    // Only a candidate on the failed leg's lane is a real replacement.
    const viable = scored.filter((s) => {
      const c = s.listing
      return o && (c.originRef?.toLowerCase() === o || c.city?.toLowerCase() === o)
    })
    if (viable.length === 0) {
      return { replacement: null, reason: `No live replacement supply on lane ${input.originRef} → ${input.destinationRef ?? '—'}` }
    }
    const best = viable[0]!
    return {
      replacement: {
        mode: input.mode ?? 'road',
        origin: best.listing.originRef ?? best.listing.city ?? input.originRef ?? undefined,
        destination: best.listing.destinationRef ?? input.destinationRef ?? undefined,
        equipment: best.listing.equipment ?? undefined,
        providerId: best.listing.providerOrgId,
        carrier: best.listing.providerOrg.name,
        cost: best.listing.price ?? undefined,
        etaHours: 24,
        marketListingId: best.listing.id,
      },
      providerOrgId: best.listing.providerOrgId,
      providerName: best.listing.providerOrg.name,
      rating: best.rating,
      completionRate: best.completionRate,
      score: best.score,
    }
  }

  // ---------- Phase C: org reputation ----------

  /** Average rating of an org on a given axis (default: any axis). */
  async orgAverageRating(orgId: string, axis?: string) {
    const where: Record<string, unknown> = { subjectOrgId: orgId }
    if (axis) where.axis = axis
    const ratings = await this.prisma.orgRating.findMany({ where: where as never })
    if (ratings.length === 0) return { avg: null, count: 0 }
    return { avg: ratings.reduce((s, r) => s + r.score, 0) / ratings.length, count: ratings.length }
  }

  /** Rate an org on an axis (the rated axis must be the subject's kind-implied role). */
  async rateOrg(input: { subjectOrgId: string; axis: string; score: number; review?: string; referenceType?: string; referenceId?: string }, user: User) {
    if (!['transporter', 'supplier', 'forwarder', 'warehouse', 'carrier'].includes(input.axis)) {
      throw new BadRequestException('Invalid rating axis')
    }
    if (input.score < 1 || input.score > 5) throw new BadRequestException('Score must be 1..5')
    const subject = await this.prisma.organization.findUnique({ where: { id: input.subjectOrgId } })
    if (!subject) throw new NotFoundException('Organization not found')
    const giver = await this.orgAccess.primaryOrg(user)
    if (subject.id === giver.id) throw new BadRequestException('Cannot rate your own org')
    // One rating per (giver, subject, axis, reference) if referenceId provided.
    const existing = await this.prisma.orgRating.findFirst({
      where: {
        subjectOrgId: input.subjectOrgId,
        giverOrgId: giver.id,
        axis: input.axis,
        ...(input.referenceId ? { referenceId: input.referenceId } : {}),
      },
    })
    if (existing) throw new BadRequestException('Already rated')
    const rating = await this.prisma.orgRating.create({
      data: {
        subjectOrgId: input.subjectOrgId,
        giverOrgId: giver.id,
        axis: input.axis,
        score: input.score,
        review: input.review,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      },
    })
    return { rating }
  }

  // ---------- Phase D: Carrier schedules ----------

  /** A carrier publishes a scheduled service with bookable slots. */
  async createCarrierService(input: {
    laneId?: string
    originRef?: string
    destinationRef?: string
    mode?: string
    vessel?: string
    voyage?: string
    flight?: string
    departureAt?: string
    arrivalAt?: string
    equipment?: string
    totalSlots?: number
    rate?: number
    currency?: string
  }, user: User) {
    const org = await this.orgAccess.requireOrgOfKind(user, ['carrier'])
    const service = await this.prisma.carrierService.create({
      data: {
        carrierOrgId: org.id,
        laneId: input.laneId,
        originRef: input.originRef,
        destinationRef: input.destinationRef,
        mode: input.mode ?? 'ocean',
        vessel: input.vessel,
        voyage: input.voyage,
        flight: input.flight,
        departureAt: input.departureAt ? new Date(input.departureAt) : null,
        arrivalAt: input.arrivalAt ? new Date(input.arrivalAt) : null,
        equipment: input.equipment,
        totalSlots: input.totalSlots ?? 1,
        availableSlots: input.totalSlots ?? 1,
        rate: input.rate,
        currency: input.currency ?? 'INR',
        status: 'active',
      },
    })
    // Auto-publish as a carrier_service listing.
    await this.prisma.marketListing.create({
      data: {
        providerOrgId: org.id,
        kind: 'carrier_service',
        laneId: input.laneId,
        originRef: input.originRef,
        destinationRef: input.destinationRef,
        equipment: input.equipment,
        capacityAvailable: service.availableSlots,
        capacityUnit: 'slots',
        price: input.rate,
        currency: input.currency ?? 'INR',
        description: `${input.mode ?? 'ocean'} ${input.vessel ?? input.flight ?? 'service'} — ${service.voyage ?? ''}`.trim(),
        sourceType: 'carrier_service',
        sourceId: service.id,
        carrierServiceId: service.id,
        status: 'live',
      },
    })
    return { service }
  }

  /** Public browse of carrier schedules. */
  async browseCarrierServices(query?: { origin?: string; destination?: string; mode?: string }) {
    const where: Record<string, unknown> = { status: 'active' }
    if (query?.origin) where.originRef = { contains: query.origin.toLowerCase() }
    if (query?.destination) where.destinationRef = { contains: query.destination.toLowerCase() }
    if (query?.mode) where.mode = query.mode
    const services = await this.prisma.carrierService.findMany({
      where: where as never,
      include: { carrierOrg: { select: { id: true, name: true, verified: true } } },
      orderBy: { departureAt: 'asc' },
      take: 100,
    })
    return { services }
  }

  /** Book slots on a carrier service: decrement slots + create a real CarrierBooking. */
  async bookCarrierService(serviceId: string, user: User) {
    const service = await this.prisma.carrierService.findUnique({ where: { id: serviceId } })
    if (!service) throw new NotFoundException('Service not found')
    if (service.status !== 'active') throw new BadRequestException('Service is not active')
    if (service.availableSlots <= 0) throw new BadRequestException('Service is sold out')
    const org = await this.orgAccess.primaryOrg(user)
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.carrierService.update({
        where: { id: serviceId },
        data: { availableSlots: { decrement: 1 }, ...(service.availableSlots - 1 <= 0 ? { status: 'sold_out' } : {}) },
      })
      // Operational bridge: create a canonical Shipment + CarrierBooking so the
      // booking flows into the forwarding/execution model, not just the market.
      const shipment = await tx.shipment.create({
        data: {
          ref: `SVC-${serviceId.slice(-6)}-${Date.now().toString(36).toUpperCase()}`,
          ownerOrgId: org.id,
          commodity: `${service.mode} cargo`,
          status: 'booked',
          mode: service.mode,
          originId: service.carrierOrgId,
          destinationId: service.carrierOrgId,
        },
      })
      await tx.carrierBooking.create({
        data: {
          shipmentId: shipment.id,
          carrierId: service.carrierOrgId,
          bookingRef: `SVC-${serviceId.slice(-6)}`,
          vessel: service.vessel,
          voyage: service.voyage,
          flight: service.flight,
          equipment: service.equipment,
          rate: service.rate,
          currency: service.currency,
          status: 'confirmed',
        },
      })
      return next
    })
    await this.outbox.emit(await this.tx(), {
      eventType: 'MARKET',
      eventCode: 'CARRIER_SERVICE_BOOKED',
      entityType: 'service',
      entityId: serviceId,
      orgId: org.id,
      actorId: user.id,
      payload: { serviceId, remaining: updated.availableSlots },
    })
    return { service: updated }
  }

  /** Auto-create org ratings after a completed trip (both directions). */
  async autoRateFromTrip(trip: { id: string; transporterId: string; load: { supplierId: string } }, user: User) {
    const transporter = await this.prisma.transporter.findUnique({ where: { id: trip.transporterId } }).catch(() => null)
    if (!transporter) return null
    // Transporter's org (subject: transporter) rated by supplier's org (axis transporter)
    const transporterOrg = await this.orgOfUser(transporter.userId)
    const supplier = await this.prisma.supplier.findUnique({ where: { id: trip.load.supplierId } }).catch(() => null)
    const supplierOrg = await this.orgOfUser(supplier?.userId ?? '')
    if (transporterOrg && supplierOrg) {
      const existing = await this.prisma.orgRating.findFirst({
        where: { subjectOrgId: transporterOrg, axis: 'transporter', referenceId: trip.id },
      })
      if (!existing) {
        await this.prisma.orgRating.create({
          data: { subjectOrgId: transporterOrg, giverOrgId: supplierOrg, axis: 'transporter', score: 5, referenceType: 'trip', referenceId: trip.id },
        })
      }
    }
    return null
  }

  /** Partner directory: publicly browse active integration connectors (Phase 5). */
  async browsePartners() {
    const partners = await this.prisma.integrationConnector.findMany({
      where: { status: 'active' },
      include: { org: { select: { id: true, name: true, verified: true, verifiedCapabilities: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { partners }
  }

  /** Auto-rate a warehouse org after a completed warehouse operation. */
  async autoRateFromWarehouseOp(op: { id: string; operatorId: string | null; shipmentId: string | null }, user: User) {
    if (!op.operatorId || !op.shipmentId) return null
    const shipment = await this.prisma.shipment.findUnique({ where: { id: op.shipmentId } })
    if (!shipment?.ownerOrgId) return null
    const existing = await this.prisma.orgRating.findFirst({
      where: { subjectOrgId: op.operatorId, axis: 'warehouse', referenceId: op.id },
    })
    if (!existing) {
      await this.prisma.orgRating.create({
        data: { subjectOrgId: op.operatorId, giverOrgId: shipment.ownerOrgId, axis: 'warehouse', score: 5, referenceType: 'warehouse_op', referenceId: op.id },
      })
    }
    return null
  }

  /** Resolve the first org of a user, if any. */
  private async orgOfUser(userId: string) {
    if (!userId) return null
    const member = await this.prisma.organizationMember.findFirst({ where: { userId }, include: { organization: true } })
    return member?.organizationId ?? null
  }

  /** Reliability summary for an org, derived from real activity. */
  async orgTrust(orgId: string) {
    const [rating, tripsAsTransporter, tripsAsSupplier, claims, shipments, warehouseOps] = await Promise.all([
      this.orgAverageRating(orgId),
      this.prisma.trip.count({ where: { transporter: { user: { memberships: { some: { organizationId: orgId } } } } } }),
      this.prisma.trip.count({ where: { load: { supplier: { user: { memberships: { some: { organizationId: orgId } } } } } } }),
      this.prisma.claim.count({ where: { claimantId: orgId } }),
      this.prisma.shipment.count({ where: { ownerOrgId: orgId } }),
      this.prisma.warehouseOperation.count({ where: { operatorId: orgId } }),
    ])
    const trips = tripsAsTransporter + tripsAsSupplier
    const delivered = await this.prisma.trip.count({
      where: {
        AND: [
          { status: 'delivered' },
          { OR: [
            { transporter: { user: { memberships: { some: { organizationId: orgId } } } } },
            { load: { supplier: { user: { memberships: { some: { organizationId: orgId } } } } } },
          ] },
        ],
      },
    })
    return {
      orgId,
      rating: rating.avg,
      ratingCount: rating.count,
      trips,
      completionRate: trips > 0 ? Math.round((delivered / trips) * 100) : null,
      claims,
      claimRate: trips > 0 ? claims / trips : null,
      shipments,
      warehouseOps,
    }
  }

  // ---------- Layer 1: "For You" personalization ----------

  /**
   * Personalized marketplace home: what THIS user can offer (by capability)
   * and what demand they can quote on, plus what they can get from others.
   * Turns the generic feed into a capability-matched surface.
   */
  async forYou(user: User) {
    const capabilities = (user.capabilities?.length ? user.capabilities : [user.role]) as string[]
    const orgIds = await this.orgAccess.memberOrgIds(user)

    // Capability -> market kinds the user can SUPPLY (offer) and can FULFILL (quote).
    const CAP_TO_OFFER: Record<string, string[]> = {
      transporter: ['truck_capacity'],
      warehouse: ['warehouse_space'],
      carrier: ['carrier_service'],
      forwarder: ['forwarder_service'],
      supplier: ['truck_capacity'],
      driver: [],
    }
    const CAP_TO_FULFILL: Record<string, string[]> = {
      transporter: ['transport'],
      warehouse: ['warehouse'],
      carrier: ['carrier', 'insurance'],
      forwarder: ['forwarding'],
      supplier: ['transport', 'warehouse', 'forwarding', 'carrier', 'insurance'],
      driver: [],
    }
    // Kinds the user might NEED to buy (complementary capabilities).
    const CAP_TO_NEED: Record<string, string[]> = {
      transporter: ['warehouse_space', 'forwarder_service', 'carrier_service'],
      warehouse: ['truck_capacity', 'forwarder_service'],
      carrier: ['truck_capacity', 'forwarder_service'],
      forwarder: ['truck_capacity', 'warehouse_space', 'carrier_service'],
      supplier: ['truck_capacity', 'warehouse_space', 'carrier_service', 'forwarder_service'],
      driver: [],
    }

    const offerKinds = [...new Set(capabilities.flatMap((c) => CAP_TO_OFFER[c] ?? []))]
    const fulfillKinds = [...new Set(capabilities.flatMap((c) => CAP_TO_FULFILL[c] ?? []))]
    const needKinds = [...new Set(capabilities.flatMap((c) => CAP_TO_NEED[c] ?? []))]

    // What I already have live.
    const [myListings, myOpenRequests, mySubmittedQuotes] = await Promise.all([
      this.prisma.marketListing.count({ where: { providerOrgId: { in: orgIds }, status: 'live' } }),
      this.prisma.marketRequest.count({ where: { requesterOrgId: { in: orgIds }, status: { in: ['open', 'quoted'] } } }),
      this.prisma.marketQuote.count({ where: { providerOrgId: { in: orgIds }, status: { in: ['submitted', 'accepted'] } } }),
    ])

    // Demand I can quote: open requests whose kind matches my capability.
    const demandWhere: Record<string, unknown> = { status: 'open', requesterOrgId: { notIn: orgIds } }
    if (fulfillKinds.length) demandWhere.kind = { in: fulfillKinds }
    const demand = await this.prisma.marketRequest.findMany({
      where: demandWhere as never,
      include: { requesterOrg: { select: { id: true, name: true, verified: true } }, lane: true },
      orderBy: { createdAt: 'desc' },
      take: 8,
    })
    const demandForMe = await Promise.all(
      demand.map(async (r) => {
        const rating = await this.orgAverageRating(r.requesterOrgId)
        return { ...r, requesterRating: rating.avg, requesterCompletion: (await this.orgTrust(r.requesterOrgId)).completionRate }
      }),
    )

    // Supply I can get: live listings of complementary kinds, trust-scored.
    const supplyWhere: Record<string, unknown> = { status: 'live', providerOrgId: { notIn: orgIds } }
    if (needKinds.length) supplyWhere.kind = { in: needKinds }
    const supply = await this.prisma.marketListing.findMany({
      where: supplyWhere as never,
      include: { providerOrg: { select: { id: true, name: true, verified: true } } },
      orderBy: { createdAt: 'desc' },
      take: 8,
    })
    const supplyForMe = await Promise.all(
      supply.map(async (l) => {
        const rating = await this.orgAverageRating(l.providerOrgId)
        const trust = await this.orgTrust(l.providerOrgId)
        return { ...l, providerRating: rating.avg, providerCompletion: trust.completionRate }
      }),
    )

    return {
      capabilities,
      canOffer: offerKinds,
      canFulfill: fulfillKinds,
      canGet: needKinds,
      myLive: { listings: myListings, openRequests: myOpenRequests, submittedQuotes: mySubmittedQuotes },
      demandForMe,
      supplyForMe,
    }
  }

  // ---------- Helpers ----------

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

/** Great-circle distance in km (haversine). */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.sqrt(a))
}
