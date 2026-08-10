import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async saveLoad(loadId: string, user: User) {
    const load = await this.prisma.load.findUnique({ where: { id: loadId } })
    if (!load) throw new NotFoundException('Load not found')
    const existing = await this.prisma.favorite.findUnique({
      where: { userId_loadId: { userId: user.id, loadId } },
    })
    if (existing) return { favorite: existing, alreadySaved: true }
    const favorite = await this.prisma.favorite.create({ data: { userId: user.id, loadId } })
    return { favorite }
  }

  async unsaveLoad(loadId: string, user: User) {
    await this.prisma.favorite.deleteMany({ where: { userId: user.id, loadId } })
    return { removed: true }
  }

  async myFavorites(user: User) {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId: user.id },
      include: { load: { include: { material: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return { favorites }
  }

  async saveSearch(name: string, query: Record<string, unknown>, user: User) {
    if (!name?.trim()) throw new BadRequestException('Search name is required')
    const saved = await this.prisma.savedSearch.create({
      data: { userId: user.id, name: name.trim(), query: query as object },
    })
    return { savedSearch: saved }
  }

  async mySearches(user: User) {
    const searches = await this.prisma.savedSearch.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })
    return { searches }
  }

  async deleteSearch(id: string, user: User) {
    await this.prisma.savedSearch.deleteMany({ where: { id, userId: user.id } })
    return { removed: true }
  }
}
