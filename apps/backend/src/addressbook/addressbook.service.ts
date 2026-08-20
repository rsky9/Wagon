import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

interface SaveLocationInput {
  label: string
  address: string
  city?: string
  lat?: number
  lng?: number
  kind?: 'pickup' | 'drop' | 'both'
}

interface SaveContactInput {
  name: string
  mobile: string
  label?: string
}

@Injectable()
export class AddressBookService {
  constructor(private readonly prisma: PrismaService) {}

  async listLocations(user: User) {
    const items = await this.prisma.savedLocation.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } })
    return { locations: items }
  }

  async saveLocation(input: SaveLocationInput, user: User) {
    if (!input.label?.trim() || !input.address?.trim()) {
      throw new BadRequestException('label and address are required')
    }
    const location = await this.prisma.savedLocation.create({
      data: {
        userId: user.id,
        label: input.label.trim(),
        address: input.address.trim(),
        city: input.city ?? undefined,
        lat: input.lat ?? undefined,
        lng: input.lng ?? undefined,
        kind: input.kind ?? 'both',
      },
    })
    return { location }
  }

  async deleteLocation(id: string, user: User) {
    const location = await this.prisma.savedLocation.findFirst({ where: { id, userId: user.id } })
    if (!location) throw new NotFoundException('Location not found')
    await this.prisma.savedLocation.delete({ where: { id } })
    return { ok: true }
  }

  async listContacts(user: User) {
    const items = await this.prisma.savedContact.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } })
    return { contacts: items }
  }

  async saveContact(input: SaveContactInput, user: User) {
    if (!input.name?.trim() || !input.mobile?.trim()) {
      throw new BadRequestException('name and mobile are required')
    }
    const contact = await this.prisma.savedContact.create({
      data: {
        userId: user.id,
        name: input.name.trim(),
        mobile: input.mobile.trim(),
        label: input.label ?? undefined,
      },
    })
    return { contact }
  }

  async deleteContact(id: string, user: User) {
    const contact = await this.prisma.savedContact.findFirst({ where: { id, userId: user.id } })
    if (!contact) throw new NotFoundException('Contact not found')
    await this.prisma.savedContact.delete({ where: { id } })
    return { ok: true }
  }
}
