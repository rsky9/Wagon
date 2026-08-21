import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { OrgAccessService } from '../org-access/org-access.service'
import type { User } from '@prisma/client'

const CONTRACT_TYPES = ['customer', 'carrier', 'warehouse', 'service']
const TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'terminated'],
  active: ['expired', 'terminated'],
  expired: [],
  terminated: [],
}

interface ContractInput {
  type: string
  partyAOrgId?: string
  partyBOrgId?: string
  title?: string
  rateCardId?: string
  sla?: { pickupSlaHours?: number; transitSlaHours?: number; deliverySlaHours?: number; responseSlaHours?: number; claimsSlaHours?: number }
  territory?: Array<{ originRef?: string; destinationRef?: string; modes?: string[] }>
  liability?: { limit?: number; basis?: string; insuranceRequired?: boolean }
  incoterms?: string
  paymentTerms?: string
  currency?: string
  effectiveAt?: string
  expiresAt?: string
  notes?: string
}

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orgAccess: OrgAccessService,
  ) {}

  /** Contracts where the user's org is a party, or the user is a platform admin. */
  private async requireContractAccess(user: User, contractId: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } })
    if (!contract) throw new NotFoundException('Contract not found')
    const isParty = (await this.orgAccess.isMember(user, contract.partyAOrgId)) || (await this.orgAccess.isMember(user, contract.partyBOrgId))
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    if (!isParty && !isAdmin) throw new ForbiddenException('Not a party to this contract')
    return contract
  }

  async create(input: ContractInput, user: User) {
    if (!CONTRACT_TYPES.includes(input.type)) throw new BadRequestException(`Invalid contract type`)
    // A party must be supplied; resolve the counterparty to one of the user's orgs
    // unless the caller provides an explicit org pair (admin/foundation flow).
    const myOrgs = await this.orgAccess.userOrgs(user)
    const partyAOrgId = input.partyAOrgId ?? myOrgs[0]?.id
    const partyBOrgId = input.partyBOrgId
    if (!partyAOrgId || !partyBOrgId) {
      throw new BadRequestException('Both parties are required')
    }
    if (partyAOrgId === partyBOrgId) throw new BadRequestException('Parties must differ')

    const contract = await this.prisma.contract.create({
      data: {
        ref: `CT-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 9 + 1)}`,
        type: input.type,
        partyAOrgId,
        partyBOrgId,
        title: input.title ?? `${input.type} contract`,
        rateCardId: input.rateCardId,
        slaJson: (input.sla as object) ?? undefined,
        territoryJson: (input.territory as object) ?? undefined,
        liabilityJson: (input.liability as object) ?? undefined,
        incoterms: input.incoterms,
        paymentTerms: input.paymentTerms,
        currency: input.currency ?? 'INR',
        effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : new Date(),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        notes: input.notes,
      },
      include: {
        partyAOrg: { select: { id: true, name: true, kind: true } },
        partyBOrg: { select: { id: true, name: true, kind: true } },
        rateCard: { select: { id: true, pricePerKm: true, weight: true } },
      },
    })
    await this.audit.log({ actorId: user.id, action: 'contract.create', resource: contract.id })
    return { contract }
  }

  /** Admin/platform can review any contract; org parties see only theirs. */
  async list(user: User, query?: { status?: string; type?: string }) {
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    const where: Record<string, unknown> = {}
    if (query?.status) where.status = query.status
    if (query?.type) where.type = query.type
    if (!isAdmin) {
      const orgIds = await this.orgAccess.memberOrgIds(user)
      where.OR = [{ partyAOrgId: { in: orgIds } }, { partyBOrgId: { in: orgIds } }]
    }
    const contracts = await this.prisma.contract.findMany({
      where: where as never,
      include: {
        partyAOrg: { select: { id: true, name: true, kind: true } },
        partyBOrg: { select: { id: true, name: true, kind: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return { contracts }
  }

  async get(contractId: string, _user: User) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        partyAOrg: { select: { id: true, name: true, kind: true } },
        partyBOrg: { select: { id: true, name: true, kind: true } },
        rateCard: true,
      },
    })
    if (!contract) throw new NotFoundException('Contract not found')
    return { contract }
  }

  /** Move a contract through its lifecycle; only parties (or admins) may do so. */
  async transition(contractId: string, status: string, user: User) {
    await this.requireContractAccess(user, contractId)
    const next = TRANSITIONS[status]
    if (!next) throw new BadRequestException(`Invalid status ${status}`)
    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } })
    if (!contract) throw new NotFoundException('Contract not found')
    if (!TRANSITIONS[contract.status]?.includes(status)) {
      throw new BadRequestException(`Cannot move ${contract.status} → ${status}`)
    }
    const updated = await this.prisma.contract.update({
      where: { id: contractId },
      data: { status },
      include: {
        partyAOrg: { select: { id: true, name: true, kind: true } },
        partyBOrg: { select: { id: true, name: true, kind: true } },
      },
    })
    await this.audit.log({ actorId: user.id, action: 'contract.transition', resource: contractId, after: { status } })
    return { contract: updated }
  }

  /** Bind a contract to a rate card (pricing source of truth for billing). */
  async attachRateCard(contractId: string, rateCardId: string, user: User) {
    await this.requireContractAccess(user, contractId)
    const rateCard = await this.prisma.rateCard.findUnique({ where: { id: rateCardId } })
    if (!rateCard) throw new NotFoundException('Rate card not found')
    const updated = await this.prisma.contract.update({ where: { id: contractId }, data: { rateCardId } })
    await this.audit.log({ actorId: user.id, action: 'contract.rate_card', resource: contractId, after: { rateCardId } })
    return { contract: updated }
  }
}