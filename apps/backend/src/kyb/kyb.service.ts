import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { OrgAccessService } from '../org-access/org-access.service'
import type { User } from '@prisma/client'

const DOC_KINDS = ['registration', 'tax', 'address', 'bank', 'trade_license']

interface OrgDocInput {
  orgId: string
  kind: string
  storageKey: string
  mimeType?: string
  size?: number
}

@Injectable()
export class KybService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orgAccess: OrgAccessService,
  ) {}

  private async requireOrgAdmin(user: User, orgId: string) {
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    if (isAdmin) return
    const member = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
    })
    if (!member) throw new ForbiddenException('Not a member of this organization')
    if (!['owner', 'admin'].includes(member.role)) throw new ForbiddenException('Organization admin required')
  }

  /** Upload a KYB/business document for an organization you administer. */
  async uploadOrgDocument(input: OrgDocInput, user: User) {
    await this.requireOrgAdmin(user, input.orgId)
    if (!DOC_KINDS.includes(input.kind)) throw new BadRequestException(`Invalid document kind (${DOC_KINDS.join(' | ')})`)
    if (!input.storageKey?.trim()) throw new BadRequestException('storageKey is required')
    const doc = await this.prisma.organizationDocument.create({
      data: {
        orgId: input.orgId,
        kind: input.kind,
        storageKey: input.storageKey,
        mimeType: input.mimeType,
        size: input.size,
        status: 'pending',
      },
    })
    await this.prisma.organization.update({ where: { id: input.orgId }, data: { kybcStatus: 'pending' } })
    await this.audit.log({ actorId: user.id, action: 'kyb.document.upload', resource: doc.id, after: { orgId: input.orgId, kind: input.kind } })
    return { document: doc }
  }

  async listOrgDocuments(orgId: string, user: User) {
    await this.requireOrgAdmin(user, orgId)
    const documents = await this.prisma.organizationDocument.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    })
    return { documents }
  }

  /** Admin decision on a KYB document; recomputes the org's kybcStatus. */
  async decideDocument(docId: string, decision: { status: 'verified' | 'rejected'; note?: string }, user: User) {
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    if (!isAdmin) throw new ForbiddenException('Admin only')
    if (!['verified', 'rejected'].includes(decision.status)) throw new BadRequestException('Decision must be verified|rejected')
    const doc = await this.prisma.organizationDocument.findUnique({ where: { id: docId } })
    if (!doc) throw new NotFoundException('Document not found')
    const updated = await this.prisma.organizationDocument.update({
      where: { id: docId },
      data: {
        status: decision.status,
        adminNote: decision.note,
        verifiedAt: decision.status === 'verified' ? new Date() : null,
        verifiedBy: user.id,
      },
    })
    // Recompute org KYB: verified when at least one doc is verified.
    const anyVerified = await this.prisma.organizationDocument.findFirst({
      where: { orgId: doc.orgId, status: 'verified' },
    })
    const anyPending = await this.prisma.organizationDocument.findFirst({
      where: { orgId: doc.orgId, status: 'pending' },
    })
    await this.prisma.organization.update({
      where: { id: doc.orgId },
      data: {
        kybcStatus: anyVerified ? 'verified' : anyPending ? 'pending' : 'not_started',
        kybcVerifiedAt: anyVerified ? new Date() : null,
        kybcVerifiedBy: anyVerified ? user.id : null,
        kybcNote: decision.note,
        verified: anyVerified ? true : undefined,
      },
    })
    await this.audit.log({ actorId: user.id, action: 'kyb.document.decide', resource: docId, after: { orgId: doc.orgId, status: decision.status } })
    return { document: updated }
  }

  /** Submit the full KYB profile (registration + address) and enter review. */
  async submitProfile(orgId: string, input: { registrationNumber?: string; registeredAddress?: string }, user: User) {
    await this.requireOrgAdmin(user, orgId)
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } })
    if (!org) throw new NotFoundException('Organization not found')
    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        registrationNumber: input.registrationNumber ?? org.registrationNumber,
        registeredAddress: input.registeredAddress ?? org.registeredAddress,
        kybcStatus: 'pending',
      },
    })
    await this.audit.log({ actorId: user.id, action: 'kyb.profile.submit', resource: orgId, after: { registrationNumber: input.registrationNumber } })
    return { organization: updated }
  }

  /** Set the parent of an org (group/tenant hierarchy). Prevents cycles. */
  async setParent(orgId: string, parentOrgId: string | null, user: User) {
    await this.requireOrgAdmin(user, orgId)
    if (parentOrgId) {
      if (parentOrgId === orgId) throw new BadRequestException('An organization cannot be its own parent')
      const parent = await this.prisma.organization.findUnique({ where: { id: parentOrgId } })
      if (!parent) throw new NotFoundException('Parent organization not found')
      // Cycle guard: the proposed parent must not be a descendant of orgId.
      let cursor: string | null = parentOrgId
      let hops = 0
      while (cursor && hops < 20) {
        if (cursor === orgId) throw new BadRequestException('Parent assignment would create a cycle')
        const row: { parentOrgId: string | null } | null = await this.prisma.organization.findUnique({ where: { id: cursor }, select: { parentOrgId: true } })
        cursor = row?.parentOrgId ?? null
        hops++
      }
    }
    const updated = await this.prisma.organization.update({ where: { id: orgId }, data: { parentOrgId: parentOrgId ?? null } })
    await this.audit.log({ actorId: user.id, action: 'kyb.parent.set', resource: orgId, after: { parentOrgId } })
    return { organization: updated }
  }

  /** The org tree under the caller (or a given root). */
  async tree(user: User, rootId?: string) {
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    const root = rootId ?? (await this.orgAccess.primaryOrg(user)).id
    const nodes = await this.prisma.organization.findMany({ select: { id: true, name: true, kind: true, parentOrgId: true, kybcStatus: true, verified: true } })
    const childrenOf = new Map<string | null, typeof nodes>()
    for (const n of nodes) {
      const key = n.parentOrgId
      if (!childrenOf.has(key)) childrenOf.set(key, [])
      childrenOf.get(key)!.push(n)
    }
    const walk = (id: string): Record<string, unknown> | null => {
      const node = nodes.find((n) => n.id === id)
      if (!node) return null
      return { ...node, children: (childrenOf.get(id) ?? []).map((c) => walk(c.id)) }
    }
    if (!isAdmin) {
      const mine = await this.orgAccess.memberOrgIds(user)
      if (!mine.includes(root)) throw new ForbiddenException('Not a member of this organization')
    }
    return { tree: walk(root) }
  }
}