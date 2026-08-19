import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import type { User } from '@prisma/client'

const CATEGORIES = ['general', 'payment', 'kyc', 'load', 'trip', 'technical']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private isAdmin(user: User) {
    return user.role === 'admin' || (user.capabilities as string[])?.includes('admin')
  }

  private async requireAccess(user: User, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } })
    if (!ticket) throw new NotFoundException('Ticket not found')
    if (this.isAdmin(user) || ticket.userId === user.id) return ticket
    throw new ForbiddenException('Not your ticket')
  }

  async create(input: { subject: string; category?: string; message: string; priority?: string }, user: User) {
    if (!input.subject?.trim() || !input.message?.trim()) {
      throw new BadRequestException('subject and message are required')
    }
    const priority = input.priority && PRIORITIES.includes(input.priority) ? input.priority : 'normal'
    const ticket = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportTicket.create({
        data: {
          userId: user.id,
          subject: input.subject.trim(),
          category: input.category && CATEGORIES.includes(input.category) ? input.category : 'general',
          message: input.message.trim(),
          priority,
        },
      })
      // Seed the thread with the opening message.
      await tx.supportMessage.create({
        data: { ticketId: created.id, authorId: user.id, authorType: 'user', body: input.message.trim() },
      })
      return created
    })
    await this.audit.log({ actorId: user.id, action: 'ticket.create', resource: ticket.id, after: { subject: ticket.subject } })
    return { ticket }
  }

  async mine(user: User) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
    })
    return { tickets }
  }

  /** Full ticket with its message thread. */
  async thread(id: string, user: User) {
    const ticket = await this.requireAccess(user, id)
    const messages = await this.prisma.supportMessage.findMany({
      where: { ticketId: id },
      orderBy: { createdAt: 'asc' },
    })
    return { ticket, messages }
  }

  /** Append a message to a ticket thread (user or admin). */
  async addMessage(id: string, body: string, user: User) {
    const ticket = await this.requireAccess(user, id)
    if (!body?.trim()) throw new BadRequestException('Message body is required')
    const authorType = this.isAdmin(user) ? 'admin' : 'user'
    const message = await this.prisma.supportMessage.create({
      data: { ticketId: id, authorId: user.id, authorType, body: body.trim() },
    })
    // Re-open a closed ticket when the user replies.
    if (ticket.status === 'closed') {
      await this.prisma.supportTicket.update({ where: { id }, data: { status: 'open' } })
    }
    await this.audit.log({ actorId: user.id, action: 'ticket.message', resource: id, after: { authorType } })
    return { message }
  }

  async close(id: string, user: User) {
    const ticket = await this.requireAccess(user, id)
    if (ticket.status === 'closed') throw new BadRequestException('Already closed')
    const updated = await this.prisma.supportTicket.update({ where: { id }, data: { status: 'closed' } })
    await this.audit.log({ actorId: user.id, action: 'ticket.close', resource: id })
    return { ticket: updated }
  }

  /** Re-open a closed ticket (user or admin). */
  async reopen(id: string, user: User) {
    const ticket = await this.requireAccess(user, id)
    if (ticket.status !== 'closed') throw new BadRequestException('Ticket is not closed')
    const updated = await this.prisma.supportTicket.update({ where: { id }, data: { status: 'open' } })
    return { ticket: updated }
  }

  /** Assign a ticket to an admin (or unassign with null). */
  async assign(id: string, assignedToId: string | null, user: User) {
    if (!this.isAdmin(user)) throw new ForbiddenException('Admin only')
    await this.requireAccess(user, id)
    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: { assignedToId: assignedToId ?? null, status: assignedToId ? 'assigned' : 'open' },
    })
    await this.audit.log({ actorId: user.id, action: 'ticket.assign', resource: id, after: { assignedToId } })
    return { ticket: updated }
  }

  /** Set ticket priority (admin). */
  async setPriority(id: string, priority: string, user: User) {
    if (!this.isAdmin(user)) throw new ForbiddenException('Admin only')
    if (!PRIORITIES.includes(priority)) throw new BadRequestException('Invalid priority')
    await this.requireAccess(user, id)
    const updated = await this.prisma.supportTicket.update({ where: { id }, data: { priority } })
    return { ticket: updated }
  }

  /** Admin: resolve a ticket with a resolution note, closing it. */
  async resolve(id: string, resolution: string, user: User) {
    if (!this.isAdmin(user)) throw new ForbiddenException('Admin only')
    if (!resolution?.trim()) throw new BadRequestException('Resolution note is required')
    await this.requireAccess(user, id)
    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: { status: 'closed', resolution: resolution.trim() },
    })
    await this.audit.log({ actorId: user.id, action: 'ticket.resolve', resource: id, after: { resolution } })
    return { ticket: updated }
  }

  /** Admin: list all tickets (optionally by status). */
  async listAll(status?: string, user?: User) {
    const isAdmin = user ? this.isAdmin(user) : true
    if (user && !isAdmin) throw new ForbiddenException('Admin only')
    const where = status ? { status } : {}
    const tickets = await this.prisma.supportTicket.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        user: { select: { id: true, mobile: true, name: true } },
        _count: { select: { messages: true } },
      },
    })
    return { tickets }
  }
}