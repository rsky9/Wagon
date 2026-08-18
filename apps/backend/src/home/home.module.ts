import { Module } from '@nestjs/common'
import { HomeController } from './home.controller'
import { HomeService } from './home.service'
import { MatchingModule } from '../matching/matching.module'

@Module({
  imports: [MatchingModule],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
