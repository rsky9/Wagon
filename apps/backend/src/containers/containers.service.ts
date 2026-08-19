import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { OrgAccessService } from '../org-access/org-access.service'
import type { User } from '@prisma/client'

const CONTAINER_TYPES = ['20GP', '40GP', '40HC', 'reefer', 'open_top', 'flat_rack', 'tank', 'special']
const STATUS_TRANSITIONS: Record<string, string[]> = {
  available: ['reserved', 'on_hold', 'repair', 'scrap'],
  reserved: ['stuffed', 'available'],
  stuffed: ['gate_in', 'loaded'],
  gate_in: ['loaded', 'stuffed'],
  loaded: ['discharged'],
  discharged: ['released', 'empty_return'],
  released: ['available', 'empty_return', 'on_hold'],
  empty_return: ['available', 'repair'],
  repair: ['available', 'scrap'],
  on_hold: ['available', 'scrap'],
  scrap: [],
}

interface ContainerInput {
  number: string
  type?: string
  ownerOrgId?: string
  operatorOrgId?: string
  status?: string
  currentFacilityId?: string
  locationRef?: string
}

@Injectable()
export class ContainersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orgAccess: OrgAccessService,
  ) {}

  private async requireContainerAccess(user: User, containerId: string) {
    const container = await this.prisma.container.findUnique({ where: { id: containerId } })
    if (!container) throw new NotFoundException('Container not found')
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    if (isAdmin) return container
    const mine =
      (container.ownerOrgId && (await this.orgAccess.isMember(user, container.ownerOrgId))) ||
      (container.operatorOrgId && (await this.orgAccess.isMember(user, container.operatorOrgId)))
    if (!mine) throw new ForbiddenException('Not the owner/operator of this container')
    return container
  }

  async register(input: ContainerInput, user: User) {
    if (!CONTAINER_TYPES.includes(input.type ?? '20GP')) throw new BadRequestException('Invalid container type')
    const myOrgs = await this.orgAccess.userOrgs(user)
    const ownerOrgId = input.ownerOrgId ?? myOrgs[0]?.id ?? null
    const operatorOrgId = input.operatorOrgId ?? ownerOrgId
    const existing = await this.prisma.container.findUnique({ where: { number: input.number } })
    if (existing) throw new BadRequestException('Container number already registered')
    const container = await this.prisma.container.create({
      data: {
        number: input.number,
        type: input.type ?? '20GP',
        ownerOrgId,
        operatorOrgId,
        status: input.status ?? 'available',
        currentFacilityId: input.currentFacilityId,
        locationRef: input.locationRef,
      },
      include: { ownerOrg: { select: { id: true, name: true } }, operatorOrg: { select: { id: true, name: true } } },
    })
    await this.audit.log({ actorId: user.id, action: 'container.register', resource: container.id })
    return { container }
  }

  async list(user: User, query?: { status?: string; type?: string }) {
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    const where: Record<string, unknown> = {}
    if (query?.status) where.status = query.status
    if (query?.type) where.type = query.type
    if (!isAdmin) {
      const orgIds = await this.orgAccess.memberOrgIds(user)
      where.OR = [{ ownerOrgId: { in: orgIds } }, { operatorOrgId: { in: orgIds } }]
    }
    const containers = await this.prisma.container.findMany({
      where: where as never,
      include: { ownerOrg: { select: { id: true, name: true } }, operatorOrg: { select: { id: true, name: true } }, currentFacility: { select: { id: true, name: true, city: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { containers }
  }

  async get(containerId: string, user: User) {
    const container = await this.prisma.container.findUnique({
      where: { id: containerId },
      include: { ownerOrg: { select: { id: true, name: true } }, operatorOrg: { select: { id: true, name: true } }, currentFacility: true },
    })
    if (!container) throw new NotFoundException('Container not found')
    return { container }
  }

  /** Move a container through its status machine (available→reserved→stuffed→gate_in→loaded→discharged→released→empty_return). */
  async transition(containerId: string, status: string, input: Record<string, unknown>, user: User) {
    await this.requireContainerAccess(user, containerId)
    const container = await this.prisma.container.findUnique({ where: { id: containerId } })
    if (!container) throw new NotFoundException('Container not found')
    if (!STATUS_TRANSITIONS[container.status]?.includes(status)) {
      throw new BadRequestException(`Cannot move container ${container.status} → ${status}`)
    }
    const data: Record<string, unknown> = { status }
    if (input.sealNo !== undefined) data.sealNo = input.sealNo
    if (input.currentFacilityId !== undefined) data.currentFacilityId = input.currentFacilityId
    if (input.locationRef !== undefined) data.locationRef = input.locationRef
    if (input.vessel !== undefined) data.vessel = input.vessel
    if (input.voyage !== undefined) data.voyage = input.voyage
    if (input.emptyReturnRequired !== undefined) data.emptyReturnRequired = input.emptyReturnRequired
    const updated = await this.prisma.container.update({ where: { id: containerId }, data })
    await this.audit.log({ actorId: user.id, action: 'container.transition', resource: container.id, after: { status } })
    return { container: updated }
  }

  /** Record an equipment inspection (condition + photo key + note). */
  async inspect(containerId: string, input: { note?: string; photoKey?: string }, user: User) {
    await this.requireContainerAccess(user, containerId)
    const updated = await this.prisma.container.update({
      where: { id: containerId },
      data: { lastInspectionAt: new Date(), lastInspectionNote: input.note ?? input.photoKey ?? null },
    })
    await this.audit.log({ actorId: user.id, action: 'container.inspect', resource: containerId, after: { note: input.note } })
    return { container: updated }
  }
}