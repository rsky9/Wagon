import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

@Injectable()
export class TrustService {
  constructor(private readonly prisma: PrismaService) {}

  async report(input: { reportedId: string; tripId?: string; reason: string }, user: User) {
    if (!input.reason?.trim()) throw new BadRequestException('Report reason is required')
    if (input.reportedId === user.id) throw new BadRequestException('Cannot report yourself')
    const reported = await this.prisma.user.findUnique({ where: { id: input.reportedId } })
    if (!reported) throw new NotFoundException('User not found')
    const report = await this.prisma.report.create({
      data: {
        reporterId: user.id,
        reportedId: input.reportedId,
        tripId: input.tripId,
        reason: input.reason.trim(),
      },
    })
    return { report }
  }

  async block(input: { blockedId: string }, user: User) {
    if (input.blockedId === user.id) throw new BadRequestException('Cannot block yourself')
    const blocked = await this.prisma.user.findUnique({ where: { id: input.blockedId } })
    if (!blocked) throw new NotFoundException('User not found')
    const block = await this.prisma.blockedUser.upsert({
      where: { blockerId_blockedId: { blockerId: user.id, blockedId: input.blockedId } },
      update: {},
      create: { blockerId: user.id, blockedId: input.blockedId },
    })
    return { block }
  }

  async myBlocks(user: User) {
    const blocks = await this.prisma.blockedUser.findMany({ where: { blockerId: user.id } })
    return { blocks }
  }

  async isBlocked(a: string, b: string) {
    const block = await this.prisma.blockedUser.findUnique({
      where: { blockerId_blockedId: { blockerId: a, blockedId: b } },
    })
    return !!block
  }

  /** Masked calling: return a masked relay number for a target user. */
  async maskedNumber(targetUserId: string, user: User) {
    if (targetUserId === user.id) throw new BadRequestException('Cannot call yourself')
    if (await this.isBlocked(targetUserId, user.id) || await this.isBlocked(user.id, targetUserId)) {
      throw new BadRequestException('Call blocked — user is blocked')
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } })
    if (!target) throw new NotFoundException('User not found')
    // Opaque relay number derived from the target's id — NEVER reveals digits of
    // the real mobile. In production this routes via a telephony relay; the mock
    // maps back to the user server-side.
    const digest = createHash('sha256').update(`relay:${targetUserId}`).digest('hex')
    const digits = (parseInt(digest.slice(0, 8), 16) % 1000000).toString().padStart(6, '0')
    return { maskedNumber: `9170${digits}`, expiresIn: 300 }
  }
}
