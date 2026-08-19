import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { OrgAccessService } from '../org-access/org-access.service'
import type { User } from '@prisma/client'

const DOC_TYPES = ['bol', 'packing_list', 'commercial_invoice', 'cmr', 'cim', 'awb', 'sea_waybill', 'certificate_of_origin']
const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['issued', 'void'],
  issued: ['signed', 'void'],
  signed: ['released', 'void'],
  released: [],
  void: [],
}

interface TradeDocumentInput {
  docType: string
  shipmentId?: string
  issuerOrgId?: string
  recipientOrgId?: string
  carrierOrgId?: string
  lines?: Array<{ description: string; hsCode?: string; qty?: number; weightKg?: number; volumeM3?: number; value?: number; currency?: string }>
  totalValue?: number
  currency?: string
  incoterms?: string
  originRef?: string
  destinationRef?: string
  fileKey?: string
}

@Injectable()
export class TradeDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orgAccess: OrgAccessService,
  ) {}

  private async requireDocAccess(user: User, docId: string) {
    const doc = await this.prisma.tradeDocument.findUnique({ where: { id: docId } })
    if (!doc) throw new NotFoundException('Document not found')
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    if (isAdmin) return doc
    const orgIds = await this.orgAccess.memberOrgIds(user)
    const mine =
      (doc.issuerOrgId && orgIds.includes(doc.issuerOrgId)) ||
      (doc.recipientOrgId && orgIds.includes(doc.recipientOrgId)) ||
      (doc.carrierOrgId && orgIds.includes(doc.carrierOrgId))
    if (!mine) throw new ForbiddenException('Not a party to this document')
    return doc
  }

  async create(input: TradeDocumentInput, user: User) {
    if (!DOC_TYPES.includes(input.docType)) throw new BadRequestException(`Invalid docType (${DOC_TYPES.join(' | ')})`)
    if (!input.issuerOrgId && !input.recipientOrgId && !input.shipmentId) {
      throw new BadRequestException('Bind the document to an issuer, recipient or shipment')
    }
    const myOrgs = await this.orgAccess.userOrgs(user)
    const issuerOrgId = input.issuerOrgId ?? myOrgs[0]?.id ?? null
    const docType = input.docType
    const doc = await this.prisma.tradeDocument.create({
      data: {
        ref: `${docType === 'bol' ? 'BOL' : docType === 'commercial_invoice' ? 'CINV' : docType === 'packing_list' ? 'PKL' : docType === 'cmr' ? 'CMR' : docType === 'cim' ? 'CIM' : docType === 'awb' ? 'AWB' : docType === 'sea_waybill' ? 'SWB' : 'COO'}-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 9 + 1)}`,
        docType,
        shipmentId: input.shipmentId,
        issuerOrgId,
        recipientOrgId: input.recipientOrgId,
        carrierOrgId: input.carrierOrgId,
        lines: (input.lines ?? []) as never,
        totalValue: input.totalValue,
        currency: input.currency ?? 'INR',
        incoterms: input.incoterms,
        originRef: input.originRef,
        destinationRef: input.destinationRef,
        fileKey: input.fileKey,
        status: 'issued',
      },
      include: {
        issuerOrg: { select: { id: true, name: true } },
        recipientOrg: { select: { id: true, name: true } },
        carrierOrg: { select: { id: true, name: true } },
      },
    })
    await this.audit.log({ actorId: user.id, action: 'trade_document.create', resource: doc.id, after: { ref: doc.ref, docType } })
    return { document: doc }
  }

  async list(user: User, query?: { docType?: string; shipmentId?: string; status?: string }) {
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    const where: Record<string, unknown> = {}
    if (query?.docType) where.docType = query.docType
    if (query?.shipmentId) where.shipmentId = query.shipmentId
    if (query?.status) where.status = query.status
    if (!isAdmin) {
      const orgIds = await this.orgAccess.memberOrgIds(user)
      where.OR = [
        { issuerOrgId: { in: orgIds } },
        { recipientOrgId: { in: orgIds } },
        { carrierOrgId: { in: orgIds } },
      ]
    }
    const documents = await this.prisma.tradeDocument.findMany({
      where: where as never,
      include: {
        issuerOrg: { select: { id: true, name: true } },
        recipientOrg: { select: { id: true, name: true } },
        carrierOrg: { select: { id: true, name: true } },
        shipment: { select: { id: true, ref: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { documents }
  }

  async get(docId: string, user: User) {
    await this.requireDocAccess(user, docId)
    const doc = await this.prisma.tradeDocument.findUnique({
      where: { id: docId },
      include: {
        issuerOrg: { select: { id: true, name: true } },
        recipientOrg: { select: { id: true, name: true } },
        carrierOrg: { select: { id: true, name: true } },
        shipment: { select: { id: true, ref: true, commodity: true } },
      },
    })
    return { document: doc }
  }

  async transition(docId: string, status: string, user: User) {
    await this.requireDocAccess(user, docId)
    const doc = await this.prisma.tradeDocument.findUnique({ where: { id: docId } })
    if (!doc) throw new NotFoundException('Document not found')
    if (!STATUS_TRANSITIONS[doc.status]?.includes(status)) {
      throw new BadRequestException(`Cannot move document ${doc.status} → ${status}`)
    }
    const data: Record<string, unknown> = { status }
    if (status === 'signed') {
      data.signedBy = user.id
      data.signedAt = new Date()
    }
    if (status === 'released') {
      data.released = true
      data.releasedAt = new Date()
    }
    const updated = await this.prisma.tradeDocument.update({ where: { id: docId }, data })
    await this.audit.log({ actorId: user.id, action: 'trade_document.transition', resource: docId, after: { status } })
    return { document: updated }
  }
}