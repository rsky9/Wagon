import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import type { User } from '@prisma/client'

const KINDS = ['breakdown', 'accident', 'traffic', 'delay', 'destination_problem', 'goods_damage', 'other']

@Injectable()
export class ExceptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Report a real-world logistics exception with photos + notes. */
  async report(tripId: string, kind: string, title: string, notes: string | undefined, photos: string[] | undefined, user: User) {
    if (!KINDS.includes(kind)) throw new BadRequestException('Invalid exception kind')
    if (!title?.trim()) throw new BadRequestException('Title is required')
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: { load: true },
    })
    if (!trip) throw new NotFoundException('Trip not found')

    // Participants only: assigned transporter or the load's supplier.
    const isTransporter = trip.transporterId === (await this.prisma.transporter.findUnique({ where: { userId: user.id } }))?.id
    const isSupplier = trip.load.supplierId === (await this.prisma.supplier.findUnique({ where: { userId: user.id } }))?.id
    if (!isTransporter && !isSupplier) throw new BadRequestException('Only trip participants can report exceptions')

    const exception = await this.prisma.tripException.create({
      data: {
        tripId,
        reporterId: user.id,
        kind,
        title: title.trim(),
        notes: notes?.trim() || null,
        photos: photos ?? [],
      },
    })

    // Notify the other party.
    if (isTransporter) {
      const supplier = await this.prisma.supplier.findUnique({ where: { id: trip.load.supplierId }, include: { user: true } })
      if (supplier) {
        await this.notifications.create({
          userId: supplier.userId,
          type: 'trip_exception',
          title: `Trip exception: ${kind.replace('_', ' ')}`,
          body: title.trim(),
          data: { tripId, loadId: trip.loadId },
          category: 'trips',
        })
      }
    } else {
      const transporter = await this.prisma.transporter.findUnique({ where: { id: trip.transporterId }, include: { user: true } })
      if (transporter) {
        await this.notifications.create({
          userId: transporter.userId,
          type: 'trip_exception',
          title: `Trip exception: ${kind.replace('_', ' ')}`,
          body: title.trim(),
          data: { tripId, loadId: trip.loadId },
          category: 'trips',
        })
      }
    }
    return { exception }
  }

  /** List exceptions for a trip (participants). */
  async listForTrip(tripId: string, user: User) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId }, include: { load: true } })
    if (!trip) throw new NotFoundException('Trip not found')
    const isTransporter = trip.transporterId === (await this.prisma.transporter.findUnique({ where: { userId: user.id } }))?.id
    const isSupplier = trip.load.supplierId === (await this.prisma.supplier.findUnique({ where: { userId: user.id } }))?.id
    if (!isTransporter && !isSupplier) throw new BadRequestException('Only participants can view exceptions')
    const exceptions = await this.prisma.tripException.findMany({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
    })
    return { exceptions }
  }

  /** Resolve an exception (reporter or the other party). */
  async resolve(id: string, user: User) {
    const exception = await this.prisma.tripException.findUnique({ where: { id } })
    if (!exception) throw new NotFoundException('Exception not found')
    if (exception.reporterId === user.id) {
      const resolved = await this.prisma.tripException.update({
        where: { id },
        data: { status: 'resolved', resolvedAt: new Date() },
      })
      return { exception: resolved }
    }
    const trip = await this.prisma.trip.findUnique({ where: { id: exception.tripId }, include: { load: true } })
    if (!trip) throw new NotFoundException('Trip not found')
    const isTransporter = trip.transporterId === (await this.prisma.transporter.findUnique({ where: { userId: user.id } }))?.id
    const isSupplier = trip.load.supplierId === (await this.prisma.supplier.findUnique({ where: { userId: user.id } }))?.id
    if (!isTransporter && !isSupplier) throw new BadRequestException('Not a participant')
    const resolved = await this.prisma.tripException.update({
      where: { id },
      data: { status: 'resolved', resolvedAt: new Date() },
    })
    return { exception: resolved }
  }
}
