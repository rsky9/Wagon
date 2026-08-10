import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { Roles } from '../auth/guards/roles.decorator'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { RatingsService } from './ratings.service'
import type { User } from '@prisma/client'

@Controller('ratings')
@UseGuards(JwtAuthGuard)
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Post('trip/:tripId')
  @Roles('supplier')
  rate(
    @Param('tripId') tripId: string,
    @Body() body: { score: number; review?: string },
    @CurrentUser() user: User,
  ) {
    return this.ratings.rateTransporter(tripId, body.score, body.review, user)
  }

  @Get('transporter/:userId')
  transporter(@Param('userId') userId: string) {
    return this.ratings.transporterRating(userId)
  }

  @Get('transporter/:userId/reviews')
  reviews(@Param('userId') userId: string) {
    return this.ratings.reviewsForTransporter(userId)
  }
}
