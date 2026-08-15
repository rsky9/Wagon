import { Controller, Get, Query } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/** Static city → lat/lng for geocoding the Post-Load wizard (deterministic, offline). */
const CITY_COORDS: Record<string, [number, number]> = {
  mumbai: [19.076, 72.8777],
  delhi: [28.6139, 77.209],
  newdelhi: [28.6139, 77.209],
  bangalore: [12.9716, 77.5946],
  bengaluru: [12.9716, 77.5946],
  hyderabad: [17.385, 78.4867],
  chennai: [13.0827, 80.2707],
  kolkata: [22.5726, 88.3639],
  pune: [18.5204, 73.8567],
  ahmedabad: [23.0225, 72.5714],
  jaipur: [26.9124, 75.7873],
  lucknow: [26.8467, 80.9462],
  kanpur: [26.4499, 80.3319],
  nagpur: [21.1458, 79.0882],
  indore: [22.7196, 75.8577],
  bhopal: [23.2599, 77.4126],
  ludhiana: [30.901, 75.8573],
  agra: [27.1767, 78.0081],
  vadodara: [22.3072, 73.1812],
  surat: [21.1702, 72.8311],
  coimbatore: [11.0168, 76.9558],
  madurai: [9.9252, 78.1198],
  vijayawada: [16.5062, 80.648],
  visakhapatnam: [17.6868, 83.2185],
  guwahati: [26.1445, 91.7362],
  patna: [25.5941, 85.1376],
  ranchi: [23.3441, 85.3096],
  bhubaneswar: [20.2961, 85.8245],
  amritsar: [31.634, 74.8723],
  chandigarh: [30.7333, 76.7794],
  mundra: [22.8393, 69.7344],
  kandla: [23.0317, 70.2167],
  jnpt: [18.9512, 72.9523],
  nhava: [18.9512, 72.9523],
  singapore: [1.3521, 103.8198],
}

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
    const key = (q ?? '').trim().toLowerCase().replace(/\s+/g, '')
    const coords = CITY_COORDS[key]
    if (!coords) return { found: false, city: q, coords: null }
    return { found: true, city: q, coords }
  }

  /** Straight-line distance (km) between two geocoded cities — feeds the wizard. */
  @Get('distance')
  distance(@Query('from') from?: string, @Query('to') to?: string) {
    const a = CITY_COORDS[(from ?? '').trim().toLowerCase().replace(/\s+/g, '')]
    const b = CITY_COORDS[(to ?? '').trim().toLowerCase().replace(/\s+/g, '')]
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
