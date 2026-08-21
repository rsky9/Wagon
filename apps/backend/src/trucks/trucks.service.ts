import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { MarketService } from '../market/market.service'
import { UploadsService, ALLOWED_UPLOAD_MIMES } from '../uploads/uploads.service'
import { VerificationService } from '../verification/verification.service'
import type { User, TruckType, KycStatus } from '@prisma/client'

const VALID_TYPES: TruckType[] = ['open', 'container', 'trailer']

@Injectable()
export class TrucksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
    private readonly uploads: UploadsService,
    private readonly verification: VerificationService,
  ) {}

  private async transporterId(user: User) {
    const t = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    return t?.id
  }

  private assertMime(mimeType: string) {
    if (!ALLOWED_UPLOAD_MIMES.has(mimeType)) {
      throw new BadRequestException(`File type not allowed: ${mimeType}`)
    }
  }

  async list(user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) return { vehicles: [] }
    const vehicles = await this.prisma.vehicle.findMany({
      where: { transporterId },
      include: { driver: true },
      orderBy: { createdAt: 'desc' },
    })
    return { vehicles }
  }

  async get(id: string, user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) throw new BadRequestException('Transporter profile not found')
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, transporterId },
      include: { driver: true, model: true },
    })
    if (!vehicle) throw new NotFoundException('Vehicle not found')
    return { vehicle }
  }

  /** Fleet dashboard: vehicles grouped by status + verification + document-expiry alerts. */
  async fleetDashboard(user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) return { vehicles: [], alerts: [], summary: { active: 0, inactive: 0, verified: 0, unverified: 0 } }
    const vehicles = await this.prisma.vehicle.findMany({
      where: { transporterId },
      include: { driver: true },
      orderBy: { createdAt: 'desc' },
    })

    const now = Date.now()
    const days = (d: Date | null) => (d ? Math.ceil((d.getTime() - now) / 86400000) : null)

    const alerts: Array<{ vehicleId: string; vehicleNo: string; kind: string; daysLeft: number | null; critical: boolean }> = []
    for (const v of vehicles) {
      const docs = [
        { kind: 'insurance', d: v.insuranceUpto },
        { kind: 'permit', d: v.permitUpto },
        { kind: 'fitness', d: v.fitnessUpto },
        { kind: 'pollution', d: v.pollutionUpto },
      ]
      for (const doc of docs) {
        if (doc.d) {
          const left = days(doc.d)!
          if (left <= 30) {
            alerts.push({ vehicleId: v.id, vehicleNo: v.vehicleNo, kind: doc.kind, daysLeft: left, critical: left <= 0 })
          }
        }
      }
      const svc = await this.serviceDue(v)
      if (svc?.due) alerts.push({ vehicleId: v.id, vehicleNo: v.vehicleNo, kind: 'service-due', daysLeft: -1, critical: true })
      else if (svc?.dueSoon) alerts.push({ vehicleId: v.id, vehicleNo: v.vehicleNo, kind: 'service-due', daysLeft: Math.ceil((svc.kmLeft ?? 0) / 100), critical: false })
      if (v.verificationStatus !== 'approved') {
        alerts.push({ vehicleId: v.id, vehicleNo: v.vehicleNo, kind: 'verification', daysLeft: -1, critical: true })
      }
    }

    return {
      vehicles,
      alerts: alerts.sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999)),
      summary: {
        active: vehicles.filter((v) => v.activeStatus).length,
        inactive: vehicles.filter((v) => !v.activeStatus).length,
        verified: vehicles.filter((v) => v.verificationStatus === 'approved').length,
        unverified: vehicles.filter((v) => v.verificationStatus !== 'approved').length,
        expiringSoon: alerts.filter((a) => !a.critical).length,
        expired: alerts.filter((a) => a.critical).length,
      },
    }
  }

  /** Fleet earnings & utilization overview: aggregate trips, earnings, driver coverage. */
  async fleetOverview(user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) return { fleet: { vehicles: 0, activeTrips: 0 }, earnings: 0, drivers: 0, covered: 0, driverCoverage: 0 }

    const [vehicles, trips, drivers, earnedTrips] = await Promise.all([
      this.prisma.vehicle.findMany({ where: { transporterId }, select: { id: true, activeStatus: true, verificationStatus: true } }),
      this.prisma.trip.findMany({ where: { transporterId }, select: { id: true, status: true, driverId: true, load: { select: { fareEstimate: true } }, booking: true } }),
      this.prisma.driver.findMany({ where: { transporterId }, select: { id: true, payRate: true, status: true, verificationStatus: true } }),
      this.prisma.trip.findMany({ where: { transporterId, status: 'delivered' }, include: { load: true, booking: true } }),
    ])

    const activeTrips = trips.filter((t) => t.status === 'in_transit').length
    const earnings = earnedTrips.reduce((s, t) => s + (t.booking?.rate ?? t.load.fareEstimate ?? 0), 0)
    const assignedTrips = trips.filter((t) => t.driverId).length
    const activeDrivers = drivers.filter((d) => d.status).length

    return {
      fleet: { vehicles: vehicles.length, activeVehicles: vehicles.filter((v) => v.activeStatus).length, verifiedVehicles: vehicles.filter((v) => v.verificationStatus === 'approved').length, activeTrips },
      drivers: { total: drivers.length, active: activeDrivers, verified: drivers.filter((d) => d.verificationStatus === 'approved').length },
      coverage: { assignedTrips, totalTrips: trips.length, driverCoverage: trips.length ? Math.round((assignedTrips / trips.length) * 100) / 100 : 0 },
      earnings,
      currency: 'INR',
    }
  }

  async create(input: CreateVehicleInput, user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) throw new BadRequestException('Transporter profile not found')
    if (!input.vehicleNo?.trim()) throw new BadRequestException('vehicleNo is required')
    if (!VALID_TYPES.includes(input.type as TruckType)) throw new BadRequestException('Invalid vehicle type')

    const model = await this.prisma.vehicleModel.findUnique({ where: { id: input.modelId } })
    if (!model) throw new BadRequestException('Unknown vehicle model')

    const vehicleNo = input.vehicleNo.trim().toUpperCase()
    const duplicate = await this.prisma.vehicle.findFirst({ where: { transporterId, vehicleNo } })
    if (duplicate) throw new BadRequestException('A vehicle with this number is already registered')

    const vehicle = await this.prisma.vehicle.create({
      data: {
        transporterId,
        vehicleNo,
        rcNumber: input.rcNumber ? input.rcNumber.trim().toUpperCase() : vehicleNo,
        type: input.type as TruckType,
        modelId: input.modelId,
        capacityId: input.capacityId,
        driverId: input.driverId,
        origin: input.origin,
        lat: input.lat,
        lng: input.lng,
        gpsLogin: input.gpsLogin,
        images: input.images ?? [],
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
    await this.market.publishTruck(vehicle as never, user).catch(() => {})
    return { vehicle }
  }

  async update(id: string, input: Partial<CreateVehicleInput>, user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) throw new BadRequestException('Transporter profile not found')
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id, transporterId } })
    if (!vehicle) throw new NotFoundException('Vehicle not found')
    const updated = await this.prisma.vehicle.update({
      where: { id },
      data: {
        vehicleNo: input.vehicleNo?.toUpperCase(),
        rcNumber: input.rcNumber?.toUpperCase(),
        type: input.type as TruckType | undefined,
        modelId: input.modelId,
        capacityId: input.capacityId,
        driverId: input.driverId,
        origin: input.origin,
        gpsLogin: input.gpsLogin,
        images: input.images,
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
    if (input.activeStatus !== undefined) {
      await this.market.publishTruck(updated as never, user).catch(() => {})
    }
    return { vehicle: updated }
  }

  /** Reassign which (verified) driver is currently driving this vehicle. */
  async assignDriver(vehicleId: string, driverId: string | null, user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) throw new BadRequestException('Transporter profile not found')
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, transporterId } })
    if (!vehicle) throw new NotFoundException('Vehicle not found')
    if (driverId) {
      const driver = await this.prisma.driver.findFirst({ where: { id: driverId, transporterId } })
      if (!driver) throw new NotFoundException('Driver not found')
      if (driver.verificationStatus !== 'approved') {
        throw new BadRequestException('Assign a verified driver (licence verification required)')
      }
    }
    const updated = await this.prisma.vehicle.update({ where: { id: vehicleId }, data: { driverId } })
    return { vehicle: updated, driverId }
  }

  /** Verify a vehicle's RC via the provider chain (Vahan→ULIP→mock) or an uploaded RC image. */
  async verifyVehicle(id: string, body: { rcNumber?: string; imageKey?: string }, user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) throw new BadRequestException('Transporter profile not found')
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id, transporterId } })
    if (!vehicle) throw new NotFoundException('Vehicle not found')
    const rcNumber = body.rcNumber ?? vehicle.rcNumber ?? vehicle.vehicleNo
    const result = await this.verification.verifyVehicle(rcNumber, { imageKey: body.imageKey })
    const updated = await this.prisma.vehicle.update({
      where: { id },
      data: {
        rcNumber,
        rcVerified: result.verified,
        verificationStatus: 'approved' as KycStatus,
        verificationSource: result.source,
        verifiedAt: result.verified ? new Date() : undefined,
        registeredOwner: result.registeredOwner ?? undefined,
        makerModel: result.makerModel ?? undefined,
        insuranceUpto: result.insuranceUpto ?? undefined,
        fitnessUpto: result.fitnessUpto ?? undefined,
        images: body.imageKey && !vehicle.images.includes(body.imageKey) ? [...vehicle.images, body.imageKey] : undefined,
      },
    })
    return { vehicle: updated, verification: result }
  }

  /** Request a presigned upload URL for a vehicle document / RC image. */
  async requestUpload(vehicleId: string, mimeType: string, size: number, user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) throw new BadRequestException('Transporter profile not found')
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, transporterId } })
    if (!vehicle) throw new NotFoundException('Vehicle not found')
    this.assertMime(mimeType)
    const presigned = await this.uploads.presignUpload({ folder: `vehicles/${vehicleId}`, mimeType, size, maxSizeMb: 10 })
    return { uploadUrl: presigned.uploadUrl, key: presigned.key }
  }

  async remove(id: string, user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) throw new BadRequestException('Transporter profile not found')
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id, transporterId } })
    if (!vehicle) throw new NotFoundException('Vehicle not found')
    const active = await this.prisma.trip.findFirst({
      where: {
        booking: { truckId: id },
        status: { in: ['accepted', 'in_transit'] },
      },
    })
    if (active) throw new BadRequestException('Cannot remove a vehicle that is on an active trip')
    const pending = await this.prisma.bid.findFirst({
      where: { truckId: id, status: { in: ['accepted', 'booking_pending', 'shortlisted'] } },
    })
    if (pending) throw new BadRequestException('Cannot remove a vehicle with a committed booking')
    await this.prisma.vehicle.delete({ where: { id } })
    await this.market.publishTruck({ ...vehicle, activeStatus: false } as never, user).catch(() => {})
    return { success: true }
  }

  private async requireVehicle(user: User, vehicleId: string) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) throw new BadRequestException('Transporter profile not found')
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, transporterId } })
    if (!vehicle) throw new NotFoundException('Vehicle not found')
    return vehicle
  }

  private async serviceDue(vehicle: { id: string; odometerKm: number | null; nextServiceKm: number | null }) {
    if (!vehicle.nextServiceKm) return null
    const current = vehicle.odometerKm ?? 0
    const diff = vehicle.nextServiceKm - current
    if (diff <= 0) return { due: true, kmOver: Math.abs(diff), nextServiceKm: vehicle.nextServiceKm }
    if (diff <= 1000) return { dueSoon: true, kmLeft: diff, nextServiceKm: vehicle.nextServiceKm }
    return null
  }

  async logMaintenance(input: {
    vehicleId: string
    kind: string
    title: string
    odometerKm?: number
    cost?: number
    performedAt?: string
    nextServiceKm?: number
    notes?: string
    documents?: string[]
  }, user: User) {
    await this.requireVehicle(user, input.vehicleId)
    if (!input.title?.trim()) throw new BadRequestException('Maintenance title is required')
    if (!['service', 'repair', 'inspection', 'tyre', 'battery'].includes(input.kind)) {
      throw new BadRequestException('Invalid maintenance kind')
    }
    if (input.cost != null && input.cost < 0) throw new BadRequestException('Cost cannot be negative')

    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.vehicleMaintenance.create({
        data: {
          vehicleId: input.vehicleId,
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
      const data: Record<string, unknown> = {}
      if (input.odometerKm != null) data.odometerKm = input.odometerKm
      if (input.kind === 'service' && input.nextServiceKm != null) data.nextServiceKm = input.nextServiceKm
      if (input.kind === 'service') data.lastServiceAt = new Date()
      if (Object.keys(data).length) await tx.vehicle.update({ where: { id: input.vehicleId }, data })
      return created
    })
    return { maintenance: record }
  }

  async maintenanceHistory(vehicleId: string, user: User) {
    await this.requireVehicle(user, vehicleId)
    const records = await this.prisma.vehicleMaintenance.findMany({
      where: { vehicleId },
      orderBy: { performedAt: 'desc' },
      take: 100,
    })
    return { maintenance: records }
  }

  async maintenanceDue(user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) return { due: [], dueSoon: [], totalMaintenanceCost: 0 }
    const vehicles = await this.prisma.vehicle.findMany({
      where: { transporterId },
      select: { id: true, vehicleNo: true, odometerKm: true, nextServiceKm: true },
    })
    const due: Array<Record<string, unknown>> = []
    const dueSoon: Array<Record<string, unknown>> = []
    for (const v of vehicles) {
      const status = await this.serviceDue(v)
      if (status?.due) due.push({ vehicleId: v.id, vehicleNo: v.vehicleNo, ...status })
      else if (status?.dueSoon) dueSoon.push({ vehicleId: v.id, vehicleNo: v.vehicleNo, ...status })
    }
    const costAgg = await this.prisma.vehicleMaintenance.aggregate({ where: { vehicle: { transporterId } }, _sum: { cost: true } })
    return { due, dueSoon, totalMaintenanceCost: costAgg._sum.cost ?? 0 }
  }
}

export interface CreateVehicleInput {
  vehicleNo: string
  rcNumber?: string
  type: string
  modelId: string
  capacityId?: string
  driverId?: string
  origin?: string
  lat?: number
  lng?: number
  gpsLogin?: string
  images?: string[]
  activeStatus?: boolean
  insuranceUpto?: string
  permitUpto?: string
  fitnessUpto?: string
  pollutionUpto?: string
  lastServiceAt?: string
  nextServiceKm?: number
  odometerKm?: number
}
