import { Controller, Get, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { HomeService } from './home.service'
import type { User } from '@prisma/client'

@Controller('home')
@UseGuards(JwtAuthGuard)
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get('summary')
  summary(@CurrentUser() user: User) {
    return this.home.summary(user)
  }
}
