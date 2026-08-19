import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { OrgAccessService } from '../org-access/org-access.service'
import type { User } from '@prisma/client'

const REASONS = ['customer_return', 'damage', 'repair', 'replacement', 'refurbishment', 'recycling', 'disposal', 'warranty']
const STATUS_TRANSITIONS: Record<string, string[]> = {
  requested: ['scheduled', 'cancelled'],
  scheduled: ['picked_up', 'cancelled'],
  picked_up: ['in_transit', 'received'],
  in_transit: ['received'],
  received: ['closed'],
  closed: [],
  cancelled: [],
}

interface ReturnInput {
  shipmentId?: string
  cargoUnitId?: string
  reason: string
  condition?: string
  fromOrgId?: string
  handlerOrgId?: string
  notes?: string
}

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orgAccess: OrgAccessService,
  ) {}

  private async requireReturnAccess(user: User, returnId: string) {
    const record = await this.prisma.returnOrder.findUnique({ where: { id: returnId } })
    if (!record) throw new NotFoundException('Return not found')
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    if (isAdmin) return record
    const mine =
      (record.fromOrgId && (await this.orgAccess.isMember(user, record.fromOrgId))) ||
      (record.handlerOrgId && (await this.orgAccess.isMember(user, record.handlerOrgId)))
    if (!mine) throw new ForbiddenException('Not a party to this return')
    return record
  }

  async create(input: ReturnInput, user: User) {
    if (!REASONS.includes(input.reason)) throw new BadRequestException('Invalid return reason')
    if (!input.shipmentId && !input.cargoUnitId) throw new BadRequestException('Reference a shipment or cargo unit')
    const myOrgs = await this.orgAccess.userOrgs(user)
    const fromOrgId = input.fromOrgId ?? myOrgs[0]?.id ?? null
    const record = await this.prisma.returnOrder.create({
      data: {
        ref: `RT-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 9 + 1)}`,
        shipmentId: input.shipmentId,
        cargoUnitId: input.cargoUnitId,
        fromOrgId,
        handlerOrgId: input.handlerOrgId,
        reason: input.reason,
        condition: input.condition,
        notes: input.notes,
      },
      include: { shipment: { select: { ref: true, commodity: true } }, cargoUnit: { select: { ref: true, kind: true } } },
    })
    await this.audit.log({ actorId: user.id, action: 'return.create', resource: record.id, after: { reason: input.reason } })
    return { return: record }
  }

  async list(user: User, query?: { status?: string; reason?: string }) {
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    const where: Record<string, unknown> = {}
    if (query?.status) where.status = query.status
    if (query?.reason) where.reason = query.reason
    if (!isAdmin) {
      const orgIds = await this.orgAccess.memberOrgIds(user)
      where.OR = [{ fromOrgId: { in: orgIds } }, { handlerOrgId: { in: orgIds } }]
    }
    const records = await this.prisma.returnOrder.findMany({
      where: where as never,
      include: { shipment: { select: { ref: true, commodity: true } }, cargoUnit: { select: { ref: true, kind: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { returns: records }
  }

  async get(returnId: string, user: User) {
    const record = await this.prisma.returnOrder.findUnique({ where: { id: returnId } })
    if (!record) throw new NotFoundException('Return not found')
    return { return: record }
  }

  async transition(returnId: string, status: string, input: Record<string, unknown>, user: User) {
    await this.requireReturnAccess(user, returnId)
    const record = await this.prisma.returnOrder.findUnique({ where: { id: returnId } })
    if (!record) throw new NotFoundException('Return not found')
    if (!STATUS_TRANSITIONS[record.status]?.includes(status)) {
      throw new BadRequestException(`Cannot move return ${record.status} → ${status}`)
    }
    const data: Record<string, unknown> = { status }
    if (status === 'scheduled' && input.pickupAt) data.pickupAt = new Date(input.pickupAt as string)
    if (status === 'received') data.receivedAt = new Date()
    if (status === 'closed') data.closedAt = new Date()
    if (input.condition !== undefined) data.condition = input.condition
    if (input.disposition !== undefined) data.disposition = input.disposition
    const updated = await this.prisma.returnOrder.update({ where: { id: returnId }, data })
    await this.audit.log({ actorId: user.id, action: 'return.transition', resource: returnId, after: { status } })
    return { return: updated }
  }
}