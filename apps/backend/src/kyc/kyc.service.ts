import { Injectable, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { UploadsService, ALLOWED_UPLOAD_MIMES } from '../uploads/uploads.service'
import type { DocumentKind, User } from '@prisma/client'

const VALID_KINDS: DocumentKind[] = ['pan', 'aadhar', 'rc', 'license', 'bank', 'selfie', 'company']

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  private assertMime(mimeType: string) {
    if (!ALLOWED_UPLOAD_MIMES.has(mimeType)) {
      throw new BadRequestException(`File type not allowed: ${mimeType}`)
    }
  }

  async requestUpload(kind: string, mimeType: string, size: number, user: User) {
    if (!VALID_KINDS.includes(kind as DocumentKind)) {
      throw new BadRequestException(`kind must be one of: ${VALID_KINDS.join(', ')}`)
    }
    this.assertMime(mimeType)

    const presigned = await this.uploads.presignUpload({
      folder: `kyc/${user.id}`,
      mimeType,
      size,
      maxSizeMb: 10,
    })

    const doc = await this.prisma.kycDocument.create({
      data: {
        userId: user.id,
        kind: kind as DocumentKind,
        storageKey: presigned.key,
        mimeType,
        size,
        status: 'pending',
      },
    })

    return { uploadUrl: presigned.uploadUrl, documentId: doc.id, key: presigned.key }
  }

  async requestPodUpload(tripId: string, mimeType: string, size: number, _user: User) {
    this.assertMime(mimeType)
    const presigned = await this.uploads.presignUpload({
      folder: `pod/${tripId}`,
      mimeType,
      size,
      maxSizeMb: 10,
    })
    return { uploadUrl: presigned.uploadUrl, key: presigned.key }
  }

  async listForUser(user: User) {
    const docs = await this.prisma.kycDocument.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    })
    return { docs }
  }
}
