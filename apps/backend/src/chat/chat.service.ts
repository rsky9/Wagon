import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  private async participantTrip(tripId: string, user: User) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { load: true } })
    if (!trip) throw new NotFoundException('Trip not found')
    const isTransporter = trip.transporterId === (await this.prisma.transporter.findUnique({ where: { userId: user.id } }))?.id
    const isSupplier = trip.load.supplierId === (await this.prisma.supplier.findUnique({ where: { userId: user.id } }))?.id
    const isDriver = !!trip.driverId && trip.driverId === (await this.prisma.driver.findFirst({ where: { mobile: user.mobile } }))?.id
    if (!isTransporter && !isSupplier && !isDriver) throw new BadRequestException('Only trip participants can message')
    return trip
  }

  async send(tripId: string, body: string, user: User) {
    if (!body?.trim()) throw new BadRequestException('Message cannot be empty')
    await this.participantTrip(tripId, user)
    const message = await this.prisma.message.create({
      data: { tripId, senderId: user.id, body: body.trim() },
      include: { sender: { select: { name: true } } },
    })
    return { message }
  }

  async list(tripId: string, user: User) {
    await this.participantTrip(tripId, user)
    const messages = await this.prisma.message.findMany({
      where: { tripId },
      include: { sender: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    })
    return { messages }
  }

  /** Conversation threads for the user: their trips + last message + counterparty. */
  async threads(user: User) {
    const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })

    let trips: Array<{ id: string; transporterId: string; load: { pickupAddr: string; dropAddr: string; supplier?: { user?: { name?: string | null; id?: string | null } | null } | null } }> = []
    if (transporter) {
      trips = (await this.prisma.trip.findMany({
        where: { transporterId: transporter.id },
        include: { load: { include: { supplier: { include: { user: { select: { name: true, id: true } } } } } } },
        orderBy: { updatedAt: 'desc' },
      })) as never
    } else if (supplier) {
      trips = (await this.prisma.trip.findMany({
        where: { load: { supplierId: supplier.id } },
        include: { load: { include: { supplier: { include: { user: { select: { name: true, id: true } } } } } } },
        orderBy: { updatedAt: 'desc' },
      })) as never
    } else {
      const driver = await this.prisma.driver.findFirst({ where: { mobile: user.mobile } })
      trips = (await this.prisma.trip.findMany({
        where: { driverId: driver?.id },
        include: { load: true },
        orderBy: { updatedAt: 'desc' },
      })) as never
    }

    const threads = await Promise.all(
      trips.map(async (t) => {
        const last = await this.prisma.message.findFirst({ where: { tripId: t.id }, orderBy: { createdAt: 'desc' } })
        const count = await this.prisma.message.count({ where: { tripId: t.id } })
        let otherName = 'Transporter'
        let otherUserId: string | null = null
        if (transporter) {
          otherName = t.load?.supplier?.user?.name ?? 'Supplier'
          otherUserId = t.load?.supplier?.user?.id ?? null
        } else if (supplier) {
          const tr = await this.prisma.transporter.findUnique({ where: { id: t.transporterId }, include: { user: { select: { name: true, id: true } } } })
          otherName = tr?.user?.name ?? 'Transporter'
          otherUserId = tr?.user?.id ?? null
        }
        return {
          tripId: t.id,
          route: `${t.load?.pickupAddr ?? ''} → ${t.load?.dropAddr ?? ''}`,
          otherName,
          otherUserId,
          lastMessage: last?.body ?? null,
          lastAt: last?.createdAt ?? null,
          messageCount: count,
        }
      }),
    )
    return { threads }
  }
}
