import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { OrgAccessService } from '../org-access/org-access.service'
import type { User } from '@prisma/client'

const DIRECTIONS = ['export', 'import', 'transit']
const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['filed', 'rejected'],
  filed: ['under_examination', 'held', 'cleared', 'rejected'],
  under_examination: ['held', 'cleared', 'rejected'],
  held: ['under_examination', 'cleared'],
  cleared: ['released'],
  released: [],
  rejected: [],
}

interface CustomsInput {
  shipmentId?: string
  direction: string
  regime?: string
  brokerOrgId?: string
  importerOrgId?: string
  exporterOrgId?: string
  hsCode?: string
  commodity?: string
  value?: number
  currency?: string
  documentKeys?: string[]
  notes?: string
}

@Injectable()
export class CustomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orgAccess: OrgAccessService,
  ) {}

  private async requireCustomsAccess(user: User, declarationId: string) {
    const declaration = await this.prisma.customsDeclaration.findUnique({ where: { id: declarationId } })
    if (!declaration) throw new NotFoundException('Declaration not found')
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    if (isAdmin) return declaration
    const mine =
      (declaration.brokerOrgId && (await this.orgAccess.isMember(user, declaration.brokerOrgId))) ||
      (declaration.importerOrgId && (await this.orgAccess.isMember(user, declaration.importerOrgId))) ||
      (declaration.exporterOrgId && (await this.orgAccess.isMember(user, declaration.exporterOrgId)))
    if (!mine) throw new ForbiddenException('Not a party to this declaration')
    return declaration
  }

  async create(input: CustomsInput, user: User) {
    if (!DIRECTIONS.includes(input.direction)) throw new BadRequestException('Invalid direction (export|import|transit)')
    const myOrgs = await this.orgAccess.userOrgs(user)
    const brokerOrgId = input.brokerOrgId ?? (input.direction === 'export' || input.direction === 'import' ? myOrgs[0]?.id ?? null : null)
    // Default the regime from the destination country's pack when not supplied.
    let regime = input.regime
    if (!regime && input.shipmentId) {
      const shipment = await this.prisma.shipment.findUnique({
        where: { id: input.shipmentId },
        include: { destination: true, origin: true },
      })
      const code = (shipment?.destination?.countryCode ?? shipment?.origin?.countryCode ?? 'IN').toUpperCase()
      const pack = await this.prisma.countryPack.findUnique({ where: { code } })
      regime = pack?.customsRegime
    }
    const declaration = await this.prisma.customsDeclaration.create({
      data: {
        ref: `CD-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 9 + 1)}`,
        shipmentId: input.shipmentId,
        direction: input.direction,
        regime: regime ?? 'general',
        brokerOrgId,
        importerOrgId: input.importerOrgId,
        exporterOrgId: input.exporterOrgId,
        hsCode: input.hsCode,
        commodity: input.commodity,
        value: input.value,
        currency: input.currency ?? 'INR',
        documentKeys: input.documentKeys ?? [],
        notes: input.notes,
      },
      include: { shipment: { select: { ref: true, commodity: true } }, brokerOrg: { select: { id: true, name: true } } },
    })
    await this.audit.log({ actorId: user.id, action: 'customs.create', resource: declaration.id, after: { direction: input.direction } })
    return { declaration }
  }

  async list(user: User, query?: { direction?: string; status?: string }) {
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    const where: Record<string, unknown> = {}
    if (query?.direction) where.direction = query.direction
    if (query?.status) where.status = query.status
    if (!isAdmin) {
      const orgIds = await this.orgAccess.memberOrgIds(user)
      where.OR = [{ brokerOrgId: { in: orgIds } }, { importerOrgId: { in: orgIds } }, { exporterOrgId: { in: orgIds } }]
    }
    const declarations = await this.prisma.customsDeclaration.findMany({
      where: where as never,
      include: { shipment: { select: { ref: true, commodity: true } }, brokerOrg: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { declarations }
  }

  async get(declarationId: string, user: User) {
    const declaration = await this.prisma.customsDeclaration.findUnique({ where: { id: declarationId } })
    if (!declaration) throw new NotFoundException('Declaration not found')
    return { declaration }
  }

  /** Move a declaration through the customs timeline; brokers/admins perform the moves. */
  async transition(declarationId: string, status: string, input: Record<string, unknown>, user: User) {
    await this.requireCustomsAccess(user, declarationId)
    const declaration = await this.prisma.customsDeclaration.findUnique({ where: { id: declarationId } })
    if (!declaration) throw new NotFoundException('Declaration not found')
    if (!STATUS_TRANSITIONS[declaration.status]?.includes(status)) {
      throw new BadRequestException(`Cannot move declaration ${declaration.status} → ${status}`)
    }
    const data: Record<string, unknown> = { status }
    if (status === 'filed') data.filedAt = new Date()
    if (status === 'under_examination') data.examinedAt = new Date()
    if (status === 'cleared') data.clearedAt = new Date()
    if (status === 'released') data.releasedAt = new Date()
    if (status === 'held') data.holdReason = input.holdReason
    if (input.dutyAmount !== undefined) data.dutyAmount = input.dutyAmount
    if (input.taxAmount !== undefined) data.taxAmount = input.taxAmount
    if (input.documentKeys !== undefined) data.documentKeys = input.documentKeys
    if (input.notes !== undefined) data.notes = input.notes
    const updated = await this.prisma.customsDeclaration.update({ where: { id: declarationId }, data })
    await this.audit.log({ actorId: user.id, action: 'customs.transition', resource: declarationId, after: { status } })
    return { declaration: updated }
  }
}