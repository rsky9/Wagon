import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OrgAccessService } from '../org-access/org-access.service'
import type { User } from '@prisma/client'

const ISO_CODE = /^[A-Za-z]{2}$/

@Injectable()
export class GlobalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAccess: OrgAccessService,
  ) {}

  private requireCode(code: string) {
    if (!ISO_CODE.test(code)) throw new BadRequestException('Country code must be 2 letters (ISO 3166-1 alpha-2)')
    return code.toUpperCase()
  }

  /** List enabled country packs. */
  async countries() {
    const packs = await this.prisma.countryPack.findMany({ where: { enabled: true }, orderBy: { code: 'asc' } })
    return { countries: packs }
  }

  /** Pack detail by ISO code. */
  async country(code: string) {
    const c = this.requireCode(code)
    const pack = await this.prisma.countryPack.findUnique({ where: { code: c } })
    if (!pack) throw new NotFoundException('Country pack not found')
    return { country: pack }
  }

  /** Document requirements for a country (drives forwarding docs). */
  async documents(code: string) {
    const c = this.requireCode(code)
    const pack = await this.prisma.countryPack.findUnique({ where: { code: c } })
    if (!pack) throw new NotFoundException('Country pack not found')
    return { documents: pack.documentRequirements ?? [] }
  }

  /** Set the user's organization's home country. */
  async setHomeCountry(code: string, user: User) {
    const c = this.requireCode(code)
    const pack = await this.prisma.countryPack.findUnique({ where: { code: c } })
    if (!pack) throw new NotFoundException('Country pack not found')
    const org = await this.orgAccess.primaryOrg(user)
    const updated = await this.prisma.organization.update({ where: { id: org.id }, data: { countryCode: pack.code } })
    return { organization: updated, country: pack }
  }

  /** The user's organization's current country. */
  async homeCountry(user: User) {
    const org = await this.orgAccess.primaryOrg(user)
    const pack = await this.prisma.countryPack.findUnique({ where: { code: org.countryCode } })
    return { organization: org, country: pack }
  }

  /** FX: convert an amount from a country's currency to the base currency. */
  async convert(code: string, amount: number) {
    const c = this.requireCode(code)
    if (amount < 0) throw new BadRequestException('Amount cannot be negative')
    const pack = await this.prisma.countryPack.findUnique({ where: { code: c } })
    if (!pack) throw new NotFoundException('Country pack not found')
    const rate = pack.exchangeRateToBase ?? 1
    return { from: pack.currency, to: pack.baseCurrency, amount, rate, converted: amount * rate }
  }

  /** Build a country-aware forwarding document checklist for a shipment. */
  async checklist(shipmentId: string, user: User) {
    await this.orgAccess.assertShipmentAccess(user, shipmentId)
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { destination: true, origin: true },
    })
    if (!shipment) throw new NotFoundException('Shipment not found')
    const destCode = (shipment.destination?.countryCode ?? shipment.origin?.countryCode ?? 'IN').toUpperCase()
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

  // ---------- Admin ----------

  /** List all packs (admin). */
  async adminList() {
    const packs = await this.prisma.countryPack.findMany({ orderBy: { code: 'asc' } })
    return { countries: packs }
  }

  /** Create or update a country pack (admin). */
  async upsertCountry(input: {
    code: string
    name?: string
    currency?: string
    baseCurrency?: string
    exchangeRateToBase?: number
    language?: string
    unitSystem?: string
    customsRegime?: string
    documentRequirements?: string[]
    incotermsSupported?: string[]
    enabled?: boolean
  }) {
    const code = this.requireCode(input.code)
    const pack = await this.prisma.countryPack.upsert({
      where: { code },
      update: {
        name: input.name,
        currency: input.currency,
        baseCurrency: input.baseCurrency,
        exchangeRateToBase: input.exchangeRateToBase,
        language: input.language,
        unitSystem: input.unitSystem,
        customsRegime: input.customsRegime,
        documentRequirements: input.documentRequirements as never,
        incotermsSupported: input.incotermsSupported as never,
        enabled: input.enabled,
      },
      create: {
        code,
        name: input.name ?? code,
        currency: input.currency ?? 'INR',
        baseCurrency: input.baseCurrency ?? 'INR',
        exchangeRateToBase: input.exchangeRateToBase ?? 1,
        language: input.language ?? 'en',
        unitSystem: input.unitSystem ?? 'metric',
        customsRegime: input.customsRegime ?? 'general',
        documentRequirements: input.documentRequirements as never,
        incotermsSupported: input.incotermsSupported as never,
        enabled: input.enabled ?? true,
      },
    })
    return { country: pack }
  }
}
