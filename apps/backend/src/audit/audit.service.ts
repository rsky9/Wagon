import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    actorId: string
    action: string
    resource: string
    before?: unknown
    after?: unknown
    ip?: string
  }) {
    return this.prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        resource: input.resource,
        before: (input.before as object) ?? undefined,
        after: (input.after as object) ?? undefined,
        ip: input.ip,
      },
    })
  }

  async list(limit = 100) {
    const items = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return { items }
  }
}
