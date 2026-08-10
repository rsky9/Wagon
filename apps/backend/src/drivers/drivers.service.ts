import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  private async transporterId(user: User) {
    const t = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    return t?.id
  }

  async list(user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) return { drivers: [] }
    const drivers = await this.prisma.driver.findMany({
      where: { transporterId },
      orderBy: { createdAt: 'desc' },
    })
    return { drivers }
  }

  async create(input: CreateDriverInput, user: User) {
    const transporterId = await this.transporterId(user)
    if (!transporterId) throw new BadRequestException('Transporter profile not found')
    if (!input.name?.trim() || !input.mobile?.trim()) {
      throw new BadRequestException('name and mobile are required')
    }
    const driver = await this.prisma.driver.create({
      data: {
        transporterId,
        name: input.name.trim(),
        mobile: input.mobile.trim(),
        licenseKey: input.licenseKey,
      },
    })
    return { driver }
  }

  async update(id: string, input: Partial<CreateDriverInput>, user: User) {
    const transporterId = await this.transporterId(user)
    const driver = await this.prisma.driver.findFirst({ where: { id, transporterId } })
    if (!driver) throw new NotFoundException('Driver not found')
    const updated = await this.prisma.driver.update({
      where: { id },
      data: {
        name: input.name,
        mobile: input.mobile,
        licenseKey: input.licenseKey,
        status: input.status,
      },
    })
    return { driver: updated }
  }

  async remove(id: string, user: User) {
    const transporterId = await this.transporterId(user)
    const driver = await this.prisma.driver.findFirst({ where: { id, transporterId } })
    if (!driver) throw new NotFoundException('Driver not found')
    await this.prisma.driver.delete({ where: { id } })
    return { success: true }
  }
}

export interface CreateDriverInput {
  name: string
  mobile: string
  licenseKey?: string
  status?: boolean
}
