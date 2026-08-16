import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

/**
 * Shared org-membership + ownership helpers for the enablement modules.
 * A user acts on behalf of an organization they belong to; every cross-tenant
 * read/write must pass through these helpers.
 */
@Injectable()
export class OrgAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** All organizations the user is a member of (deterministic: oldest first). */
  async userOrgs(user: User) {
    const members = await this.prisma.organizationMember.findMany({
      where: { userId: user.id },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    })
    return members.map((m) => m.organization)
  }

  /** The user's first organization (legacy convenience — prefer memberOrgs).
   *  Deterministic: prefers the org matching the user's role kind, else the
   *  earliest membership, so money/org-binding writes never land on a DB-arbitrary org. */
  async primaryOrg(user: User) {
    const orgs = await this.userOrgs(user)
    if (orgs.length === 0) throw new ForbiddenException('User belongs to no organization')
    const ROLE_TO_KIND: Record<string, string> = {
      supplier: 'shipper',
      transporter: 'transporter',
      forwarder: 'forwarder',
      warehouse: 'warehouse',
      carrier: 'carrier',
    }
    const kind = ROLE_TO_KIND[user.role]
    const matching = kind ? orgs.find((o) => o.kind === kind) : undefined
    return matching ?? orgs[0]!
  }

  /** Orgs of the user filtered by kind. */
  async orgsOfKind(user: User, kinds: string[]) {
    const orgs = await this.userOrgs(user)
    return orgs.filter((o) => kinds.includes(o.kind))
  }

  /** True if the user is a member of the given org (optionally with role). */
  async isMember(user: User, orgId: string, role?: string): Promise<boolean> {
    const where: Record<string, unknown> = { userId: user.id, organizationId: orgId }
    if (role) where.role = role
    const count = await this.prisma.organizationMember.count({ where: where as never })
    return count > 0
  }

  /** Assert the user belongs to orgId; throw 403 otherwise. */
  async assertMember(user: User, orgId: string) {
    if (!(await this.isMember(user, orgId))) {
      throw new ForbiddenException('Not a member of this organization')
    }
  }

  /** Assert the user belongs to an org of one of the given kinds. Returns that org. */
  async requireOrgOfKind(user: User, kinds: string[]) {
    const orgs = await this.orgsOfKind(user, kinds)
    if (orgs.length === 0) throw new ForbiddenException(`Requires membership of an organization of kind: ${kinds.join('|')}`)
    return orgs[0]!
  }

  /** Assert the shipment is owned by an org the user belongs to; return the shipment. */
  async assertShipmentAccess(user: User, shipmentId: string) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } })
    if (!shipment) throw new NotFoundException('Shipment not found')
    if (shipment.ownerOrgId) {
      await this.assertMember(user, shipment.ownerOrgId)
    } else {
      // Backfill legacy rows: infer ownership via origin/destination org membership.
      const orgs = await this.userOrgs(user)
      const orgIds = orgs.map((o) => o.id)
      if (!shipment.originId || !orgIds.includes(shipment.originId)) {
        throw new ForbiddenException('No access to this shipment')
      }
    }
    return shipment
  }

  /** Org ids the user belongs to (for `orgId in` filters). */
  async memberOrgIds(user: User) {
    const orgs = await this.userOrgs(user)
    return orgs.map((o) => o.id)
  }
}
