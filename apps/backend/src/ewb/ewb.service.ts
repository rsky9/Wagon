import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { EWB_PROVIDER, EwbProvider } from './ewb-provider.service'
import type { User } from '@prisma/client'

@Injectable()
export class EwbService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(EWB_PROVIDER) private readonly provider: EwbProvider,
  ) {}

  /** Supplier generates an e-way bill for their load. */
  async generate(loadId: string, user: User) {
    const load = await this.prisma.load.findUnique({
      where: { id: loadId },
      include: { supplier: true },
    })
    if (!load) {
      throw new NotFoundException('Load not found')
    }
    if (load.supplier.userId !== user.id) {
      throw new BadRequestException('Only the load supplier can generate the e-way bill')
    }
    if (load.ewbNumber) {
      return { ewbNumber: load.ewbNumber, alreadyGenerated: true }
    }

    const result = await this.provider.generate({
      supplierGst: load.supplier.gst,
      value: load.fareEstimate,
    })

    const updated = await this.prisma.load.update({
      where: { id: loadId },
      data: { ewbNumber: result.ewbNumber },
    })

    await this.notifications.create({
      userId: user.id,
      type: 'ewb_generated',
      title: 'E-way bill generated',
      body: `EWB ${result.ewbNumber} for load #${loadId.slice(-6)}`,
      data: { loadId },
    })

    return { ewbNumber: updated.ewbNumber, alreadyGenerated: false }
  }
}
