import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { ContainersService } from './containers.service'
import type { User } from '@prisma/client'

@Controller('containers')
@UseGuards(JwtAuthGuard)
export class ContainersController {
  constructor(private readonly containers: ContainersService) {}

  @Post()
  register(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.containers.register(body as never, user)
  }

  @Get()
  list(@Query('status') status: string | undefined, @Query('type') type: string | undefined, @CurrentUser() user: User) {
    return this.containers.list(user, { status, type })
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: User) {
    return this.containers.get(id, user)
  }

  @Patch(':id/status')
  transition(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    const { status, ...rest } = body as { status: string }
    return this.containers.transition(id, status, rest, user)
  }

  @Post(':id/inspect')
  inspect(@Param('id') id: string, @Body() body: { note?: string; photoKey?: string }, @CurrentUser() user: User) {
    return this.containers.inspect(id, body, user)
  }
}