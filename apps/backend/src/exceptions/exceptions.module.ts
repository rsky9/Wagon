import { Module } from '@nestjs/common'
import { ExceptionsController } from './exceptions.controller'
import { ExceptionsService } from './exceptions.service'
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
  imports: [NotificationsModule],
  controllers: [ExceptionsController],
  providers: [ExceptionsService],
})
export class ExceptionsModule {}
