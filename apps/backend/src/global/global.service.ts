import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

@Injectable()
export class GlobalService {
  constructor(private readonly prisma: PrismaService) {}

  /** List enabled country packs. */
  async countries() {
    const packs = await this.prisma.countryPack.findMany({ where: { enabled: true }, orderBy: { code: 'asc' } })
    return { countries: packs }
  }

  /** Pack detail by ISO code. */
  async country(code: string) {
    const pack = await this.prisma.countryPack.findUnique({ where: { code: code.toUpperCase() } })
    if (!pack) throw new NotFoundException('Country pack not found')
    return { country: pack }
  }

  /** Document requirements for a country (drives forwarding docs). */
  async documents(code: string) {
    const pack = await this.prisma.countryPack.findUnique({ where: { code: code.toUpperCase() } })
    if (!pack) throw new NotFoundException('Country pack not found')
    return { documents: pack.documentRequirements ?? [] }
  }

  /** Set the user's organization's home country. */
  async setHomeCountry(code: string, user: User) {
    const pack = await this.prisma.countryPack.findUnique({ where: { code: code.toUpperCase() } })
    if (!pack) throw new NotFoundException('Country pack not found')
    const member = await this.prisma.organizationMember.findFirst({ where: { userId: user.id } })
    if (!member) throw new BadRequestException('User belongs to no organization')
    const org = await this.prisma.organization.update({ where: { id: member.organizationId }, data: { countryCode: pack.code } })
    return { organization: org, country: pack }
  }

  /** Build a country-aware forwarding document checklist for a shipment. */
  async checklist(shipmentId: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { destination: true, origin: true },
    })
    if (!shipment) throw new NotFoundException('Shipment not found')
    const destCode = shipment.destination?.countryCode ?? shipment.origin?.countryCode ?? 'IN'
    const pack = await this.prisma.countryPack.findUnique({ where: { code: destCode } })
    const required = (pack?.documentRequirements as string[] | null) ?? ['commercial_invoice', 'packing_list']
    const existing = await this.prisma.forwardDocument.findMany({ where: { shipmentId }, select: { kind: true } })
    const have = new Set(existing.map((d) => d.kind))
    return {
      country: pack ? { code: pack.code, name: pack.name, currency: pack.currency } : null,
      required,
      present: required.filter((k) => have.has(k)),
      missing: required.filter((k) => !have.has(k)),
    }
  }
}
