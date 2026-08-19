import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { KybService } from './kyb.service'
import type { User } from '@prisma/client'

@Controller('kyb')
@UseGuards(JwtAuthGuard)
export class KybController {
  constructor(private readonly kyb: KybService) {}

  @Post('documents')
  uploadDoc(@Body() body: Record<string, unknown>, @CurrentUser() user: User) {
    return this.kyb.uploadOrgDocument(body as never, user)
  }

  @Get('documents')
  listDocs(@Query('orgId') orgId: string, @CurrentUser() user: User) {
    return this.kyb.listOrgDocuments(orgId, user)
  }

  @Patch('documents/:id/decide')
  decideDoc(@Param('id') id: string, @Body() body: { status: 'verified' | 'rejected'; note?: string }, @CurrentUser() user: User) {
    return this.kyb.decideDocument(id, body, user)
  }

  @Post('organizations/:id/profile')
  submitProfile(@Param('id') id: string, @Body() body: { registrationNumber?: string; registeredAddress?: string }, @CurrentUser() user: User) {
    return this.kyb.submitProfile(id, body, user)
  }

  @Patch('organizations/:id/parent')
  setParent(@Param('id') id: string, @Body() body: { parentOrgId?: string | null }, @CurrentUser() user: User) {
    return this.kyb.setParent(id, body.parentOrgId ?? null, user)
  }

  @Get('tree')
  tree(@Query('rootId') rootId: string | undefined, @CurrentUser() user: User) {
    return this.kyb.tree(user, rootId)
  }
}