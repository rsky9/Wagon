import { Controller, Get, Query } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CITY_COORDS, geocodePlace } from './geo'

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

  /** Geocode a city name to coordinates (deterministic table; extensible). */
  @Get('geocode')
  geocode(@Query('q') q?: string) {
    const coords = geocodePlace(q)
    if (!coords) return { found: false, city: q, coords: null }
    return { found: true, city: q, coords }
  }

  /** Straight-line distance (km) between two geocoded cities — feeds the wizard. */
  @Get('distance')
  distance(@Query('from') from?: string, @Query('to') to?: string) {
    const a = geocodePlace(from)
    const b = geocodePlace(to)
    if (!a || !b) return { found: false, distanceKm: null }
    const R = 6371
    const dLat = ((b[0] - a[0]) * Math.PI) / 180
    const dLng = ((b[1] - a[1]) * Math.PI) / 180
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
    const km = Math.round(2 * R * Math.asin(Math.sqrt(s)))
    return { found: true, from, to, distanceKm: km }
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
