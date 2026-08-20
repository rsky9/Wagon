import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../auth/guards/current-user.decorator'
import { AddressBookService } from './addressbook.service'
import type { User } from '@prisma/client'

@Controller('addressbook')
@UseGuards(JwtAuthGuard)
export class AddressBookController {
  constructor(private readonly addressbook: AddressBookService) {}

  @Get('locations')
  locations(@CurrentUser() user: User) {
    return this.addressbook.listLocations(user)
  }

  @Post('locations')
  saveLocation(@Body() body: { label: string; address: string; city?: string; lat?: number; lng?: number; kind?: 'pickup' | 'drop' | 'both' }, @CurrentUser() user: User) {
    return this.addressbook.saveLocation(body, user)
  }

  @Delete('locations/:id')
  deleteLocation(@Param('id') id: string, @CurrentUser() user: User) {
    return this.addressbook.deleteLocation(id, user)
  }

  @Get('contacts')
  contacts(@CurrentUser() user: User) {
    return this.addressbook.listContacts(user)
  }

  @Post('contacts')
  saveContact(@Body() body: { name: string; mobile: string; label?: string }, @CurrentUser() user: User) {
    return this.addressbook.saveContact(body, user)
  }

  @Delete('contacts/:id')
  deleteContact(@Param('id') id: string, @CurrentUser() user: User) {
    return this.addressbook.deleteContact(id, user)
  }
}
