import { Controller, Get } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Controller('reference')
export class ReferenceController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async reference() {
    const [models, materials] = await Promise.all([
      this.prisma.truckModel.findMany({ where: { status: true }, orderBy: { createdAt: 'asc' } }),
      this.prisma.material.findMany({ where: { status: true }, orderBy: { createdAt: 'asc' } }),
    ])
    return { models, materials }
  }

  @Get('rate-cards')
  async rateCards() {
    const models = await this.prisma.truckModel.findMany({
      where: { status: true },
      include: { rateCards: { where: { status: true } } },
      orderBy: { createdAt: 'asc' },
    })
    const cards = models.map((m) => ({
      modelId: m.id,
      type: m.type,
      model: m.model,
      capacities: m.capacities,
      pricePerKm: m.rateCards[0]?.pricePerKm ?? 0,
    }))
    return { rateCards: cards }
  }
}
