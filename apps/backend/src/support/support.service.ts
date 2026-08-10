import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

const CATEGORIES = ['general', 'payment', 'kyc', 'load', 'trip', 'technical']

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: { subject: string; category?: string; message: string }, user: User) {
    if (!input.subject?.trim() || !input.message?.trim()) {
      throw new BadRequestException('subject and message are required')
    }
    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId: user.id,
        subject: input.subject.trim(),
        category: input.category && CATEGORIES.includes(input.category) ? input.category : 'general',
        message: input.message.trim(),
      },
    })
    return { ticket }
  }

  async mine(user: User) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })
    return { tickets }
  }

  async close(id: string, user: User) {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id, userId: user.id } })
    if (!ticket) throw new NotFoundException('Ticket not found')
    if (ticket.status === 'closed') throw new BadRequestException('Already closed')
    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: { status: 'closed' },
    })
    return { ticket: updated }
  }
}
