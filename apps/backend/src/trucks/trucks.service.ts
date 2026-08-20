import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { MarketService } from '../market/market.service'
import type { User, TruckType } from '@prisma/client'

const VALID_TYPES: TruckType[] = ['open', 'container', 'trailer']

@Injectable()
export class TrucksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
  ) {}

  private async transporterId(user: User) {
    const t = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    return t?.id
  }

  async list(user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) return { trucks: [] }
    const trucks = await this.prisma.truck.findMany({
      where: { transporterId },
      include: { driver: true },
      orderBy: { createdAt: 'desc' },
    })
    return { trucks }
  }

  /** Fleet dashboard: trucks grouped by status + document-expiry alerts + maintenance due. */
  async fleetDashboard(user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) return { trucks: [], alerts: [], summary: { active: 0, inactive: 0 } }
    const trucks = await this.prisma.truck.findMany({
      where: { transporterId },
      include: { driver: true },
      orderBy: { createdAt: 'desc' },
    })

    const now = Date.now()
    const days = (d: Date | null) => (d ? Math.ceil((d.getTime() - now) / 86400000) : null)

    const alerts: Array<{ truckId: string; truckNo: string; kind: string; daysLeft: number | null; critical: boolean }> = []
    for (const t of trucks) {
      const docs = [
        { kind: 'insurance', d: t.insuranceUpto },
        { kind: 'permit', d: t.permitUpto },
        { kind: 'fitness', d: t.fitnessUpto },
        { kind: 'pollution', d: t.pollutionUpto },
      ]
      for (const doc of docs) {
        if (doc.d) {
          const left = days(doc.d)!
          if (left <= 30) {
            alerts.push({ truckId: t.id, truckNo: t.truckNo, kind: doc.kind, daysLeft: left, critical: left <= 0 })
          }
        }
      }
      // Service-due alert: next service odometer reached or within 1000 km.
      const svc = await this.serviceDue(t)
      if (svc?.due) alerts.push({ truckId: t.id, truckNo: t.truckNo, kind: 'service-due', daysLeft: -1, critical: true })
      else if (svc?.dueSoon) alerts.push({ truckId: t.id, truckNo: t.truckNo, kind: 'service-due', daysLeft: Math.ceil((svc.kmLeft ?? 0) / 100), critical: false })
    }

    return {
      trucks,
      alerts: alerts.sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999)),
      summary: {
        active: trucks.filter((t) => t.activeStatus).length,
        inactive: trucks.filter((t) => !t.activeStatus).length,
        expiringSoon: alerts.filter((a) => !a.critical).length,
        expired: alerts.filter((a) => a.critical).length,
      },
    }
  }

  /** Fleet earnings & utilization overview: aggregate trips, earnings, driver coverage. */
  async fleetOverview(user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) return { fleet: { trucks: 0, activeTrips: 0 }, earnings: 0, drivers: 0, covered: 0, driverCoverage: 0 }

    const [trucks, trips, drivers, earnedTrips] = await Promise.all([
      this.prisma.truck.findMany({ where: { transporterId }, select: { id: true, activeStatus: true } }),
      this.prisma.trip.findMany({ where: { transporterId }, select: { id: true, status: true, driverId: true, load: { select: { fareEstimate: true } }, booking: true } }),
      this.prisma.driver.findMany({ where: { transporterId }, select: { id: true, payRate: true, status: true } }),
      this.prisma.trip.findMany({ where: { transporterId, status: 'delivered' }, include: { load: true, booking: true } }),
    ])

    const activeTrips = trips.filter((t) => t.status === 'in_transit').length
    const earnings = earnedTrips.reduce((s, t) => s + (t.booking?.rate ?? t.load.fareEstimate ?? 0), 0)
    const assignedTrips = trips.filter((t) => t.driverId).length
    const activeDrivers = drivers.filter((d) => d.status).length

    return {
      fleet: { trucks: trucks.length, activeTrucks: trucks.filter((t) => t.activeStatus).length, activeTrips },
      drivers: { total: drivers.length, active: activeDrivers },
      coverage: { assignedTrips, totalTrips: trips.length, driverCoverage: trips.length ? Math.round((assignedTrips / trips.length) * 100) / 100 : 0 },
      earnings,
      currency: 'INR',
    }
  }

  async create(input: CreateTruckInput, user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) throw new BadRequestException('Transporter profile not found')
    if (!input.truckNo?.trim()) throw new BadRequestException('truckNo is required')
    if (!VALID_TYPES.includes(input.type as TruckType)) throw new BadRequestException('Invalid truck type')

    const model = await this.prisma.truckModel.findUnique({ where: { id: input.modelId } })
    if (!model) throw new BadRequestException('Unknown truck model')

    const truck = await this.prisma.truck.create({
      data: {
        transporterId,
        truckNo: input.truckNo.trim().toUpperCase(),
        type: input.type as TruckType,
        modelId: input.modelId,
        capacityId: input.capacityId,
        driverId: input.driverId,
        origin: input.origin,
        lat: input.lat,
        lng: input.lng,
        gpsLogin: input.gpsLogin,
        activeStatus: input.activeStatus ?? true,
        insuranceUpto: input.insuranceUpto ? new Date(input.insuranceUpto) : undefined,
        permitUpto: input.permitUpto ? new Date(input.permitUpto) : undefined,
        fitnessUpto: input.fitnessUpto ? new Date(input.fitnessUpto) : undefined,
        pollutionUpto: input.pollutionUpto ? new Date(input.pollutionUpto) : undefined,
        lastServiceAt: input.lastServiceAt ? new Date(input.lastServiceAt) : undefined,
        nextServiceKm: input.nextServiceKm,
        odometerKm: input.odometerKm,
      },
    })
    // Marketplace bridge: every truck is publishable capacity.
    await this.market.publishTruck(truck, user).catch(() => {})
    return { truck }
  }

  async update(id: string, input: Partial<CreateTruckInput>, user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) throw new BadRequestException('Transporter profile not found')
    const truck = await this.prisma.truck.findFirst({ where: { id, transporterId } })
    if (!truck) throw new NotFoundException('Truck not found')
    const updated = await this.prisma.truck.update({
      where: { id },
      data: {
        truckNo: input.truckNo?.toUpperCase(),
        type: input.type as TruckType | undefined,
        modelId: input.modelId,
        capacityId: input.capacityId,
        driverId: input.driverId,
        origin: input.origin,
        gpsLogin: input.gpsLogin,
        activeStatus: input.activeStatus,
        insuranceUpto: input.insuranceUpto ? new Date(input.insuranceUpto) : undefined,
        permitUpto: input.permitUpto ? new Date(input.permitUpto) : undefined,
        fitnessUpto: input.fitnessUpto ? new Date(input.fitnessUpto) : undefined,
        pollutionUpto: input.pollutionUpto ? new Date(input.pollutionUpto) : undefined,
        lastServiceAt: input.lastServiceAt ? new Date(input.lastServiceAt) : undefined,
        nextServiceKm: input.nextServiceKm,
        odometerKm: input.odometerKm,
      },
    })
    // Keep the market truck_capacity listing in sync with availability changes
    // (paused truck → paused listing, re-enabled → live again).
    if (input.activeStatus !== undefined) {
      await this.market.publishTruck(updated, user).catch(() => {})
    }
    return { truck: updated }
  }

  async remove(id: string, user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) throw new BadRequestException('Transporter profile not found')
    const truck = await this.prisma.truck.findFirst({ where: { id, transporterId } })
    if (!truck) throw new NotFoundException('Truck not found')
    // Block removal while the truck is committed to an active trip or booking.
    const active = await this.prisma.trip.findFirst({
      where: {
        booking: { truckId: id },
        status: { in: ['accepted', 'in_transit'] },
      },
    })
    if (active) throw new BadRequestException('Cannot remove a truck that is on an active trip')
    const pending = await this.prisma.bid.findFirst({
      where: { truckId: id, status: { in: ['accepted', 'booking_pending', 'shortlisted'] } },
    })
    if (pending) throw new BadRequestException('Cannot remove a truck with a committed booking')
    await this.prisma.truck.delete({ where: { id } })
    // Pause/expire the truck_capacity market listing so no one books removed capacity.
    await this.market.publishTruck({ ...truck, activeStatus: false } as never, user).catch(() => {})
    return { success: true }
  }

  private async requireTruck(user: User, truckId: string) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) throw new BadRequestException('Transporter profile not found')
    const truck = await this.prisma.truck.findFirst({ where: { id: truckId, transporterId } })
    if (!truck) throw new NotFoundException('Truck not found')
    return truck
  }

  private async serviceDue(truck: { id: string; odometerKm: number | null; nextServiceKm: number | null }) {
    if (!truck.nextServiceKm) return null
    const current = truck.odometerKm ?? 0
    const diff = truck.nextServiceKm - current
    if (diff <= 0) return { due: true, kmOver: Math.abs(diff), nextServiceKm: truck.nextServiceKm }
    if (diff <= 1000) return { dueSoon: true, kmLeft: diff, nextServiceKm: truck.nextServiceKm }
    return null
  }

  /** Log a maintenance/repair event for a truck and update its service odometer. */
  async logMaintenance(input: {
    truckId: string
    kind: string
    title: string
    odometerKm?: number
    cost?: number
    performedAt?: string
    nextServiceKm?: number
    notes?: string
    documents?: string[]
  }, user: User) {
    await this.requireTruck(user, input.truckId)
    if (!input.title?.trim()) throw new BadRequestException('Maintenance title is required')
    if (!['service', 'repair', 'inspection', 'tyre', 'battery'].includes(input.kind)) {
      throw new BadRequestException('Invalid maintenance kind')
    }
    if (input.cost != null && input.cost < 0) throw new BadRequestException('Cost cannot be negative')

    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.truckMaintenance.create({
        data: {
          truckId: input.truckId,
          kind: input.kind,
          title: input.title.trim(),
          odometerKm: input.odometerKm,
          cost: input.cost,
          performedAt: input.performedAt ? new Date(input.performedAt) : undefined,
          nextServiceKm: input.nextServiceKm,
          notes: input.notes,
          documents: input.documents ?? [],
          createdBy: user.id,
        },
      })
      // Reflect the latest odometer and next-service odometer on the truck.
      const data: Record<string, unknown> = {}
      if (input.odometerKm != null) data.odometerKm = input.odometerKm
      if (input.kind === 'service' && input.nextServiceKm != null) data.nextServiceKm = input.nextServiceKm
      if (input.kind === 'service') data.lastServiceAt = new Date()
      if (Object.keys(data).length) await tx.truck.update({ where: { id: input.truckId }, data })
      return created
    })
    return { maintenance: record }
  }

  /** Maintenance history for a truck (most recent first). */
  async maintenanceHistory(truckId: string, user: User) {
    await this.requireTruck(user, truckId)
    const records = await this.prisma.truckMaintenance.findMany({
      where: { truckId },
      orderBy: { performedAt: 'desc' },
      take: 100,
    })
    return { maintenance: records }
  }

  /** Maintenance-due overview across the transporter's fleet. */
  async maintenanceDue(user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) return { due: [], dueSoon: [], totalMaintenanceCost: 0 }
    const trucks = await this.prisma.truck.findMany({
      where: { transporterId },
      select: { id: true, truckNo: true, odometerKm: true, nextServiceKm: true },
    })
    const due: Array<Record<string, unknown>> = []
    const dueSoon: Array<Record<string, unknown>> = []
    for (const t of trucks) {
      const status = await this.serviceDue(t)
      if (status?.due) due.push({ truckId: t.id, truckNo: t.truckNo, ...status })
      else if (status?.dueSoon) dueSoon.push({ truckId: t.id, truckNo: t.truckNo, ...status })
    }
    const costAgg = await this.prisma.truckMaintenance.aggregate({ where: { truck: { transporterId } }, _sum: { cost: true } })
    return { due, dueSoon, totalMaintenanceCost: costAgg._sum.cost ?? 0 }
  }
}

export interface CreateTruckInput {
  truckNo: string
  type: string
  modelId: string
  capacityId?: string
  driverId?: string
  origin?: string
  lat?: number
  lng?: number
  gpsLogin?: string
  activeStatus?: boolean
  insuranceUpto?: string
  permitUpto?: string
  fitnessUpto?: string
  pollutionUpto?: string
  lastServiceAt?: string
  nextServiceKm?: number
  odometerKm?: number
}
