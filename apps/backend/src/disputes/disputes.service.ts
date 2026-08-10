import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { User } from '@prisma/client'

@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async raise(tripId: string, subject: string, evidenceKeys: string[] | undefined, user: User) {
    if (!subject || subject.trim().length === 0) {
      throw new BadRequestException('Dispute subject is required')
    }
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } })
    if (!trip) {
      throw new NotFoundException('Trip not found')
    }
    const participant = await this.isParticipant(tripId, user)
    if (!participant) {
      throw new BadRequestException('Only trip participants can raise a dispute')
    }
    return this.prisma.dispute.create({
      data: { tripId, raisedBy: user.id, subject, evidenceKeys: evidenceKeys ?? [] },
    })
  }

  async listOpen() {
    const disputes = await this.prisma.dispute.findMany({
      where: { status: 'open' },
      include: { trip: { include: { load: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return { disputes }
  }

  async listForUser(user: User) {
    const disputes = await this.prisma.dispute.findMany({
      where: { raisedBy: user.id },
      include: { trip: { include: { load: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return { disputes }
  }

  async resolve(disputeId: string, resolution: string, actor: User) {
    if (!resolution || resolution.trim().length === 0) {
      throw new BadRequestException('Resolution note is required')
    }
    const dispute = await this.prisma.dispute.findUnique({ where: { id: disputeId } })
    if (!dispute) {
      throw new NotFoundException('Dispute not found')
    }
    if (dispute.status === 'resolved') {
      throw new BadRequestException('Dispute already resolved')
    }
    const updated = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: { status: 'resolved', resolution },
    })
    await this.audit.log({
      actorId: actor.id,
      action: 'dispute.resolve',
      resource: `dispute:${disputeId}`,
      before: { status: dispute.status },
      after: { status: updated.status, resolution: updated.resolution },
    })
    return updated
  }

  private async isParticipant(tripId: string, user: User) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { load: true } })
    if (!trip) return false
    if (user.role === 'supplier') {
      const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
      return supplier?.id === trip.load.supplierId
    }
    if (user.role === 'transporter') {
      const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
      return transporter?.id === trip.transporterId
    }
    return false
  }
}
