import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { AuditService } from '../audit/audit.service'
import { EWB_PROVIDER, EwbProvider } from './ewb-provider.service'
import type { User } from '@prisma/client'

@Injectable()
export class EwbService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    @Inject(EWB_PROVIDER) private readonly provider: EwbProvider,
  ) {}

  private async requireLoadOwner(loadId: string, user: User) {
    const load = await this.prisma.load.findUnique({
      where: { id: loadId },
      include: { supplier: true },
    })
    if (!load) throw new NotFoundException('Load not found')
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    if (load.supplier.userId !== user.id && !isAdmin) {
      throw new BadRequestException('Only the load supplier (or an admin) can manage the e-way bill')
    }
    return load
  }

  private pincodeOf(addr?: string | null): string | undefined {
    if (!addr) return undefined
    const match = addr.match(/\b\d{6}\b/)
    return match?.[0] ?? undefined
  }

  /** Supplier generates an e-way bill for their load (full lifecycle start). */
  async generate(loadId: string, user: User) {
    const load = await this.requireLoadOwner(loadId, user)
    if (load.ewbNumber && load.ewbStatus !== 'cancelled') {
      return { ewbNumber: load.ewbNumber, status: load.ewbStatus, alreadyGenerated: true }
    }

    const result = await this.provider.generate({
      supplierGst: load.supplier.gst,
      value: load.fareEstimate,
      fromPincode: this.pincodeOf(load.pickupAddr),
      toPincode: this.pincodeOf(load.dropAddr),
    })

    const updated = await this.prisma.load.update({
      where: { id: loadId },
      data: {
        ewbNumber: result.ewbNumber,
        ewbStatus: 'generated',
        ewbValidUntil: result.validUntil,
        ewbGeneratedAt: new Date(),
        ewbCancelledAt: null,
        ewbDocKey: result.docKey,
      },
    })

    await this.notifications.create({
      userId: user.id,
      type: 'ewb_generated',
      title: 'E-way bill generated',
      body: `EWB ${result.ewbNumber} for load #${loadId.slice(-6)} valid until ${result.validUntil.toLocaleDateString()}`,
      data: { loadId },
      category: 'system',
    })
    await this.audit.log({ actorId: user.id, action: 'ewb.generate', resource: loadId, after: { ewbNumber: result.ewbNumber } })

    return { ewbNumber: updated.ewbNumber, status: updated.ewbStatus, validUntil: updated.ewbValidUntil, alreadyGenerated: false }
  }

  /** Cancel an e-way bill (e.g. on load/trip cancellation). */
  async cancel(loadId: string, reason: string | undefined, user: User) {
    const load = await this.requireLoadOwner(loadId, user)
    if (!load.ewbNumber || load.ewbStatus === 'cancelled') {
      throw new BadRequestException('No active e-way bill to cancel')
    }
    await this.provider.cancel({ ewbNumber: load.ewbNumber, reason })
    const updated = await this.prisma.load.update({
      where: { id: loadId },
      data: { ewbStatus: 'cancelled', ewbCancelledAt: new Date() },
    })
    await this.audit.log({ actorId: user.id, action: 'ewb.cancel', resource: loadId, after: { ewbNumber: load.ewbNumber, reason } })
    return { ewbNumber: updated.ewbNumber, status: updated.ewbStatus, cancelledAt: updated.ewbCancelledAt }
  }

  /** Extend a nearly-expired e-way bill (per distance slab rules). */
  async extend(loadId: string, user: User) {
    const load = await this.requireLoadOwner(loadId, user)
    if (!load.ewbNumber || load.ewbStatus === 'cancelled') {
      throw new BadRequestException('No active e-way bill to extend')
    }
    if (load.ewbValidUntil && load.ewbValidUntil < new Date()) {
      // Expired bills can't be extended; regenerate instead.
      throw new BadRequestException('E-way bill expired — generate a fresh one')
    }
    const result = await this.provider.extend(load.ewbNumber)
    const updated = await this.prisma.load.update({
      where: { id: loadId },
      data: { ewbStatus: 'extended', ewbValidUntil: result.validUntil },
    })
    await this.audit.log({ actorId: user.id, action: 'ewb.extend', resource: loadId, after: { ewbNumber: load.ewbNumber } })
    return { ewbNumber: updated.ewbNumber, status: updated.ewbStatus, validUntil: updated.ewbValidUntil }
  }

  /** Status/detail for a load's e-way bill. */
  async status(loadId: string, user: User) {
    const load = await this.requireLoadOwner(loadId, user)
    return {
      ewb: {
        loadId,
        ewbNumber: load.ewbNumber,
        status: load.ewbStatus,
        generatedAt: load.ewbGeneratedAt,
        validUntil: load.ewbValidUntil,
        cancelledAt: load.ewbCancelledAt,
        docKey: load.ewbDocKey,
      },
    }
  }

  /** Mark expired (sweep): lazily flip expired generated bills. */
  async sweepExpired() {
    const result = await this.prisma.load.updateMany({
      where: { ewbStatus: { in: ['generated', 'extended'] }, ewbValidUntil: { lt: new Date() } },
      data: { ewbStatus: 'expired' },
    })
    return { expired: result.count }
  }
}