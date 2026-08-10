import { Module } from '@nestjs/common'
import { FcmController } from './fcm.controller'

@Module({
  controllers: [FcmController],
})
export class FcmModule {}
