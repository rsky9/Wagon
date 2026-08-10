import { Controller, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Roles } from '../auth/guards/roles.decorator'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { EwbService } from './ewb.service'
import type { User } from '@prisma/client'

@Controller('ewb')
@UseGuards(JwtAuthGuard)
export class EwbController {
  constructor(private readonly ewb: EwbService) {}

  @Post('loads/:loadId')
  @Roles('supplier')
  generate(@Param('loadId') loadId: string, @CurrentUser() user: User) {
    return this.ewb.generate(loadId, user)
  }
}
