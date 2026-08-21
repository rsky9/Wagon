import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { OrgAccessService } from '../org-access/org-access.service'
import type { User } from '@prisma/client'

const ENTITY_TYPES = ['cargo_unit', 'container', 'vehicle', 'shipment']
const STATUS_TRANSITIONS: Record<string, string[]> = {
  scheduled: ['completed', 'disputed'],
  completed: [],
  disputed: ['completed'],
}

interface HandoverInput {
  entityType: string
  entityId?: string
  shipmentId?: string
  fromOrgId?: string
  toOrgId?: string
  facilityId?: string
  locationRef?: string
  condition?: string
  quantity?: number
  unit?: string
  evidenceKey?: string
  nextResponsibility?: string
  performedBy?: string
  notes?: string
}

@Injectable()
export class HandoversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orgAccess: OrgAccessService,
  ) {}

  private async requireHandoverAccess(user: User, handoverId: string) {
    const handover = await this.prisma.handover.findUnique({ where: { id: handoverId } })
    if (!handover) throw new NotFoundException('Handover not found')
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    if (isAdmin) return handover
    const mine =
      (handover.fromOrgId && (await this.orgAccess.isMember(user, handover.fromOrgId))) ||
      (handover.toOrgId && (await this.orgAccess.isMember(user, handover.toOrgId)))
    if (!mine) throw new ForbiddenException('Not a party to this handover')
    return handover
  }

  async create(input: HandoverInput, user: User) {
    if (!ENTITY_TYPES.includes(input.entityType)) throw new BadRequestException('Invalid entity type')
    if (!input.toOrgId) throw new BadRequestException('Receiving organization is required')
    const fromOrgId = input.fromOrgId ?? (await this.orgAccess.userOrgs(user))[0]?.id ?? null
    if (fromOrgId === input.toOrgId) throw new BadRequestException('Handover parties must differ')
    const handover = await this.prisma.handover.create({
      data: {
        ref: `HO-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 9 + 1)}`,
        entityType: input.entityType,
        entityId: input.entityId,
        shipmentId: input.shipmentId,
        fromOrgId,
        toOrgId: input.toOrgId,
        facilityId: input.facilityId,
        locationRef: input.locationRef,
        condition: input.condition,
        quantity: input.quantity,
        unit: input.unit,
        evidenceKey: input.evidenceKey,
        nextResponsibility: input.nextResponsibility,
        performedBy: input.performedBy ?? user.id,
        notes: input.notes,
      },
      include: { fromOrg: { select: { id: true, name: true } }, toOrg: { select: { id: true, name: true } }, facility: { select: { id: true, name: true } } },
    })
    await this.audit.log({ actorId: user.id, action: 'handover.create', resource: handover.id, after: { fromOrgId, toOrgId: input.toOrgId } })
    return { handover }
  }

  async list(user: User, query?: { entityType?: string; status?: string }) {
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    const where: Record<string, unknown> = {}
    if (query?.entityType) where.entityType = query.entityType
    if (query?.status) where.status = query.status
    if (!isAdmin) {
      const orgIds = await this.orgAccess.memberOrgIds(user)
      where.OR = [{ fromOrgId: { in: orgIds } }, { toOrgId: { in: orgIds } }]
    }
    const handovers = await this.prisma.handover.findMany({
      where: where as never,
      include: { fromOrg: { select: { id: true, name: true } }, toOrg: { select: { id: true, name: true } }, facility: { select: { id: true, name: true } } },
      orderBy: { performedAt: 'desc' },
      take: 100,
    })
    return { handovers }
  }

  async get(handoverId: string, _user: User) {
    const handover = await this.prisma.handover.findUnique({
      where: { id: handoverId },
      include: { fromOrg: { select: { id: true, name: true } }, toOrg: { select: { id: true, name: true } }, facility: true },
    })
    if (!handover) throw new NotFoundException('Handover not found')
    return { handover }
  }

  /** Mark a scheduled handover complete (with evidence) or dispute a custody break. */
  async transition(handoverId: string, status: string, input: Record<string, unknown>, user: User) {
    await this.requireHandoverAccess(user, handoverId)
    const handover = await this.prisma.handover.findUnique({ where: { id: handoverId } })
    if (!handover) throw new NotFoundException('Handover not found')
    if (!STATUS_TRANSITIONS[handover.status]?.includes(status)) {
      throw new BadRequestException(`Cannot move handover ${handover.status} → ${status}`)
    }
    const data: Record<string, unknown> = { status }
    if (input.evidenceKey !== undefined) data.evidenceKey = input.evidenceKey
    if (input.condition !== undefined) data.condition = input.condition
    if (input.notes !== undefined) data.notes = input.notes
    const updated = await this.prisma.handover.update({ where: { id: handoverId }, data })
    await this.audit.log({ actorId: user.id, action: 'handover.transition', resource: handoverId, after: { status } })
    return { handover: updated }
  }
}