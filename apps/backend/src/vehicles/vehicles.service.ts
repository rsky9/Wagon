import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { User } from '@prisma/client'

interface CreateVehicleInput {
  rcNumber: string
  insuranceUpto?: string
  permit?: string
}

interface UpdateVehicleInput {
  rcNumber?: string
  insuranceUpto?: string
  permit?: string
}

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async transporterId(user: User) {
    const t = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    return t?.id
  }

  async list(user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) return { vehicles: [] }
    const vehicles = await this.prisma.vehicle.findMany({
      where: { transporterId },
      orderBy: { createdAt: 'desc' },
    })
    return { vehicles }
  }

  async create(input: CreateVehicleInput, user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) throw new BadRequestException('Transporter profile not found')
    if (!input.rcNumber?.trim()) throw new BadRequestException('rcNumber is required')
    const rcNumber = input.rcNumber.trim().toUpperCase()
    const duplicate = await this.prisma.vehicle.findFirst({ where: { transporterId, rcNumber } })
    if (duplicate) throw new BadRequestException('A vehicle with this RC number is already registered')
    const vehicle = await this.prisma.vehicle.create({
      data: {
        transporterId,
        rcNumber,
        insuranceUpto: input.insuranceUpto ? new Date(input.insuranceUpto) : undefined,
        permit: input.permit,
      },
    })
    await this.audit.log({ actorId: user.id, action: 'vehicle.create', resource: vehicle.id, after: { rcNumber: vehicle.rcNumber } })
    return { vehicle }
  }

  async update(id: string, input: UpdateVehicleInput, user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) throw new BadRequestException('Transporter profile not found')
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id, transporterId } })
    if (!vehicle) throw new NotFoundException('Vehicle not found')
    const data: Record<string, unknown> = {}
    if (input.rcNumber !== undefined) {
      if (!input.rcNumber.trim()) throw new BadRequestException('rcNumber cannot be empty')
      const rcNumber = input.rcNumber.trim().toUpperCase()
      const duplicate = await this.prisma.vehicle.findFirst({ where: { transporterId, rcNumber, id: { not: id } } })
      if (duplicate) throw new BadRequestException('A vehicle with this RC number is already registered')
      data.rcNumber = rcNumber
    }
    if (input.insuranceUpto !== undefined) data.insuranceUpto = new Date(input.insuranceUpto)
    if (input.permit !== undefined) data.permit = input.permit
    const updated = await this.prisma.vehicle.update({ where: { id }, data })
    await this.audit.log({ actorId: user.id, action: 'vehicle.update', resource: id, after: { rcNumber: updated.rcNumber } })
    return { vehicle: updated }
  }

  async remove(id: string, user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) throw new BadRequestException('Transporter profile not found')
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id, transporterId } })
    if (!vehicle) throw new NotFoundException('Vehicle not found')
    await this.prisma.vehicle.delete({ where: { id } })
    await this.audit.log({ actorId: user.id, action: 'vehicle.delete', resource: id, after: { rcNumber: vehicle.rcNumber } })
    return { ok: true }
  }

  async verify(id: string, user: User) {
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    if (!isAdmin) throw new ForbiddenException('Only an administrator can verify vehicles')
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } })
    if (!vehicle) throw new NotFoundException('Vehicle not found')
    const updated = await this.prisma.vehicle.update({
      where: { id },
      data: { rcVerified: true, status: 'approved' },
    })
    await this.audit.log({ actorId: user.id, action: 'vehicle.verify', resource: id, after: { rcNumber: updated.rcNumber, status: updated.status } })
    return { vehicle: updated }
  }
}
