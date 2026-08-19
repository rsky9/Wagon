import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { OrgAccessService } from '../org-access/org-access.service'
import { TradeDocumentsService } from '../trade-documents/trade-documents.service'
import type { User } from '@prisma/client'

const ISO_CODE = /^[A-Za-z]{2}$/

/** Map a country-pack document requirement name to a TradeDocument docType. */
const REQ_TO_DOC: Record<string, string> = {
  commercial_invoice: 'commercial_invoice',
  packing_list: 'packing_list',
  bill_of_lading: 'bol',
  sea_waybill: 'sea_waybill',
  air_waybill: 'awb',
  certificate: 'certificate_of_origin',
  certificate_of_origin: 'certificate_of_origin',
  cmr: 'cmr',
  cim: 'cim',
}

@Injectable()
export class GlobalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgAccess: OrgAccessService,
    @Inject(TradeDocumentsService) private readonly tradeDocs: TradeDocumentsService,
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
    // Present docs come from both the forwarding docs AND the canonical trade documents.
    const fwdDocs = await this.prisma.forwardDocument.findMany({ where: { shipmentId }, select: { kind: true } })
    const tradeDocs = await this.prisma.tradeDocument.findMany({ where: { shipmentId }, select: { docType: true } })
    const have = new Set<string>()
    for (const d of fwdDocs) have.add(d.kind)
    for (const d of tradeDocs) have.add(REQ_TO_DOC[d.docType] ?? d.docType)
    const missing: string[] = []
    for (const req of required) {
      if (!have.has(req)) missing.push(req)
    }
    return {
      country: pack ? { code: pack.code, name: pack.name, currency: pack.currency, customsRegime: pack.customsRegime } : null,
      required,
      present: required.filter((k) => have.has(k)),
      missing,
      issuable: missing.filter((m) => REQ_TO_DOC[m]),
    }
  }

  /**
   * Auto-issue the missing required trade documents for a shipment based on the
   * destination country's document requirements. Only requirements that map to
   * a TradeDocument docType are issued; the rest (e.g. customs_declaration,
   * eway_bill) are separate workflows. Returns the issued documents.
   */
  async issueRequiredDocuments(shipmentId: string, user: User) {
    await this.orgAccess.assertShipmentAccess(user, shipmentId)
    const checklist = await this.checklist(shipmentId, user)
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { ownerOrg: true, destination: true, origin: true },
    })
    if (!shipment) throw new NotFoundException('Shipment not found')

    const issuerOrgId = shipment.ownerOrgId ?? (await this.orgAccess.primaryOrg(user)).id
    const issued: Array<Record<string, unknown>> = []
    for (const req of checklist.missing) {
      const docType = REQ_TO_DOC[req]
      if (!docType) continue
      const doc = await this.tradeDocs.create(
        {
          docType: docType as never,
          shipmentId,
          issuerOrgId,
          lines: [{ description: shipment.commodity ?? 'General cargo', qty: shipment.pieces ?? 1, weightKg: shipment.weightKg ?? undefined, volumeM3: shipment.volumeM3 ?? undefined, value: shipment.value ?? undefined }],
          totalValue: shipment.value ?? undefined,
          currency: checklist.country?.currency ?? 'INR',
          originRef: shipment.origin?.name,
          destinationRef: shipment.destination?.name,
        },
        user,
      )
      issued.push({ requirement: req, docType, id: doc.document.id, ref: doc.document.ref })
    }
    return { country: checklist.country, issued, stillMissing: checklist.missing.filter((m) => !REQ_TO_DOC[m]) }
  }

  /** Cross-border compliance overview across the caller's orgs' shipments. */
  async complianceOverview(user: User) {
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const shipments = await this.prisma.shipment.findMany({
      where: { ownerOrgId: { in: orgIds }, status: { notIn: ['delivered', 'closed', 'cancelled'] } },
      include: { destination: true, origin: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    const rows: Array<Record<string, unknown>> = []
    for (const s of shipments) {
      const destCode = (s.destination?.countryCode ?? s.origin?.countryCode ?? 'IN').toUpperCase()
      const pack = await this.prisma.countryPack.findUnique({ where: { code: destCode } })
      const required = (pack?.documentRequirements as string[] | null) ?? []
      const fwdDocs = await this.prisma.forwardDocument.findMany({ where: { shipmentId: s.id }, select: { kind: true } })
      const tradeDocs = await this.prisma.tradeDocument.findMany({ where: { shipmentId: s.id }, select: { docType: true } })
      const have = new Set<string>()
      for (const d of fwdDocs) have.add(d.kind)
      for (const d of tradeDocs) have.add(REQ_TO_DOC[d.docType] ?? d.docType)
      const missing = required.filter((r) => !have.has(r))
      rows.push({
        shipmentId: s.id,
        ref: s.ref,
        commodity: s.commodity,
        country: pack ? { code: pack.code, name: pack.name } : null,
        requiredCount: required.length,
        missing,
        complete: missing.length === 0,
      })
    }
    return { shipments: rows }
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
