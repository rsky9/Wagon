import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { User, TruckType } from '@prisma/client'

const VALID_TYPES: TruckType[] = ['open', 'container', 'trailer']

@Injectable()
export class TrucksService {
  constructor(private readonly prisma: PrismaService) {}

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
    return { truck }
  }

  async update(id: string, input: Partial<CreateTruckInput>, user: User) {
    const transporterId = await this.transporterId(user)
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
    return { truck: updated }
  }

  async remove(id: string, user: User) {
    const transporterId = await this.transporterId(user)
    const truck = await this.prisma.truck.findFirst({ where: { id, transporterId } })
    if (!truck) throw new NotFoundException('Truck not found')
    await this.prisma.truck.delete({ where: { id } })
    return { success: true }
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
