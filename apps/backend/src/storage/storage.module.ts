import { Module } from '@nestjs/common'
import { StorageController } from './storage.controller'
import { StorageService } from './storage.service'
import { OutboxModule } from '../outbox/outbox.module'

@Module({
  imports: [OutboxModule],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
