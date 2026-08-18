import { Module } from '@nestjs/common'
import { LoadMatchingService } from './matching.service'

@Module({
  providers: [LoadMatchingService],
  exports: [LoadMatchingService],
})
export class MatchingModule {}
