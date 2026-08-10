import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Save transporter onboarding data. */
  async completeTransporter(input: TransporterOnboarding, user: User) {
    if (user.role !== 'transporter' && !(user.capabilities?.includes('transporter') as boolean)) {
      throw new BadRequestException('Transporter onboarding only')
    }
    const existing = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    const transporter = existing
      ? await this.prisma.transporter.update({
          where: { id: existing.id },
          data: {
            companyName: input.companyName,
            ownerName: input.ownerName,
            pan: input.pan,
            aadhar: input.aadhar,
            fleetSize: input.fleetSize,
            bankAccount: input.bankAccount,
            ifsc: input.ifsc,
            acctHolder: input.acctHolder,
            insuranceKey: input.insuranceKey,
            permitKey: input.permitKey,
            fitnessKey: input.fitnessKey,
            pollutionKey: input.pollutionKey,
            onboarded: true,
          },
        })
      : await this.prisma.transporter.create({
          data: {
            userId: user.id,
            companyName: input.companyName,
            ownerName: input.ownerName,
            pan: input.pan,
            aadhar: input.aadhar,
            fleetSize: input.fleetSize,
            bankAccount: input.bankAccount,
            ifsc: input.ifsc,
            acctHolder: input.acctHolder,
            insuranceKey: input.insuranceKey,
            permitKey: input.permitKey,
            fitnessKey: input.fitnessKey,
            pollutionKey: input.pollutionKey,
            onboarded: true,
          },
        })
    return { transporter, onboarded: true }
  }

  /** Save supplier onboarding data. */
  async completeSupplier(input: SupplierOnboarding, user: User) {
    if (user.role !== 'supplier' && !(user.capabilities?.includes('supplier') as boolean)) {
      throw new BadRequestException('Supplier onboarding only')
    }
    const existing = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
    const supplier = existing
      ? await this.prisma.supplier.update({
          where: { id: existing.id },
          data: {
            companyName: input.companyName,
            gst: input.gst,
            pan: input.pan,
            cin: input.cin,
            tan: input.tan,
            billingAddress: input.billingAddress,
            pickupLocations: input.pickupLocations ?? [],
            frequentDestinations: input.frequentDestinations ?? [],
            preferredPayment: input.preferredPayment,
            onboarded: true,
          },
        })
      : await this.prisma.supplier.create({
          data: {
            userId: user.id,
            companyName: input.companyName,
            gst: input.gst,
            pan: input.pan,
            cin: input.cin,
            tan: input.tan,
            billingAddress: input.billingAddress,
            pickupLocations: input.pickupLocations ?? [],
            frequentDestinations: input.frequentDestinations ?? [],
            preferredPayment: input.preferredPayment,
            onboarded: true,
          },
        })
    return { supplier, onboarded: true }
  }

  /** Status of onboarding for the current user. */
  async status(user: User) {
    if (user.role === 'transporter') {
      const t = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
      return { onboarded: t?.onboarded ?? false, step: t?.onboarded ? 'complete' : 'incomplete' }
    }
    if (user.role === 'supplier') {
      const s = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
      return { onboarded: s?.onboarded ?? false, step: s?.onboarded ? 'complete' : 'incomplete' }
    }
    return { onboarded: true, step: 'n/a' }
  }
}

export interface TransporterOnboarding {
  companyName?: string
  ownerName?: string
  pan?: string
  aadhar?: string
  fleetSize?: number
  bankAccount?: string
  ifsc?: string
  acctHolder?: string
  insuranceKey?: string
  permitKey?: string
  fitnessKey?: string
  pollutionKey?: string
}

export interface SupplierOnboarding {
  companyName?: string
  gst?: string
  pan?: string
  cin?: string
  tan?: string
  billingAddress?: string
  pickupLocations?: string[]
  frequentDestinations?: string[]
  preferredPayment?: string
}
