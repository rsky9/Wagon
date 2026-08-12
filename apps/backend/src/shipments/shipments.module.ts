import { Module } from '@nestjs/common'
import { ShipmentProjector } from './shipment-projector.service'
import { OutboxModule } from '../outbox/outbox.module'

@Module({
  imports: [OutboxModule],
  providers: [ShipmentProjector],
  exports: [ShipmentProjector],
})
export class ShipmentsModule {}
