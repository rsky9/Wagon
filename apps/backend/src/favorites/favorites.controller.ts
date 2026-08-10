import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { FavoritesService } from './favorites.service'
import type { User } from '@prisma/client'

@Controller('favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Post('load/:loadId')
  saveLoad(@Param('loadId') loadId: string, @CurrentUser() user: User) {
    return this.favorites.saveLoad(loadId, user)
  }

  @Delete('load/:loadId')
  unsaveLoad(@Param('loadId') loadId: string, @CurrentUser() user: User) {
    return this.favorites.unsaveLoad(loadId, user)
  }

  @Get()
  myFavorites(@CurrentUser() user: User) {
    return this.favorites.myFavorites(user)
  }

  @Post('search')
  saveSearch(@Body() body: { name: string; query: Record<string, unknown> }, @CurrentUser() user: User) {
    return this.favorites.saveSearch(body.name, body.query, user)
  }

  @Get('searches')
  mySearches(@CurrentUser() user: User) {
    return this.favorites.mySearches(user)
  }

  @Delete('search/:id')
  deleteSearch(@Param('id') id: string, @CurrentUser() user: User) {
    return this.favorites.deleteSearch(id, user)
  }
}
