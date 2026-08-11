import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { GamificationService } from './gamification.service'
import type { User } from '@prisma/client'

@Controller('gamification')
@UseGuards(JwtAuthGuard)
export class GamificationController {
  constructor(private readonly gamification: GamificationService) {}

  @Get()
  state(@CurrentUser() user: User) {
    return this.gamification.state(user)
  }

  @Post('quests/:questId/complete')
  complete(@Param('questId') questId: string, @CurrentUser() user: User) {
    return this.gamification.completeQuest(questId, user)
  }

  @Post('xp')
  award(@Body() body: { amount: number; badge?: string }, @CurrentUser() user: User) {
    return this.gamification.awardXp(body.amount ?? 0, body.badge, user)
  }
}
