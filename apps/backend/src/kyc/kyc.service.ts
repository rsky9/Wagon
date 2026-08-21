import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { UploadsService, ALLOWED_UPLOAD_MIMES } from '../uploads/uploads.service'
import { IdentityVerificationService } from './identity-verification.service'
import { requiredDocsFor, financialDocs } from './kyc-requirements'
import type { DocumentKind, KycStatus, User } from '@prisma/client'

const VALID_KINDS: DocumentKind[] = ['pan', 'aadhar', 'rc', 'license', 'bank', 'selfie', 'company']

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly identity: IdentityVerificationService,
  ) {}

  private assertMime(mimeType: string) {
    if (!ALLOWED_UPLOAD_MIMES.has(mimeType)) {
      throw new BadRequestException(`File type not allowed: ${mimeType}`)
    }
  }

  private capabilities(user: User): string[] {
    return (user.capabilities ?? []).length ? (user.capabilities as string[]) : [user.role]
  }

  /** The KYC document kinds this user must verify, derived from their role/capabilities. */
  requirements(user: User) {
    const kinds = requiredDocsFor(this.capabilities(user))
    return { requirements: kinds }
  }

  /** Whether a doc kind belongs to this user's role-based requirement set. */
  private isRequiredForUser(kind: DocumentKind, user: User) {
    const required = requiredDocsFor(this.capabilities(user))
    return required.includes(kind)
  }

  async requestUpload(kind: string, mimeType: string, size: number, user: User) {
    if (!VALID_KINDS.includes(kind as DocumentKind)) {
      throw new BadRequestException(`kind must be one of: ${VALID_KINDS.join(', ')}`)
    }
    // Role-based gate: reject docs the user's role doesn't require. e.g. a
    // supplier must not upload a Vehicle RC; a transporter must not skip pan/bank.
    if (!this.isRequiredForUser(kind as DocumentKind, user)) {
      throw new BadRequestException(`Document kind '${kind}' is not required for your account`)
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

  /**
   * Run provider verification for a document after it has been uploaded. This is
   * the transaction-time identity check: aadhar/pan/bank go to Setu, selfie to
   * the face API, rc/license to Vahan/DigiLocker. On success the document is
   * marked approved and the user's overall KYC status is recomputed.
   */
  async verify(kind: string, input: Record<string, string>, user: User) {
    if (!VALID_KINDS.includes(kind as DocumentKind)) {
      throw new BadRequestException(`kind must be one of: ${VALID_KINDS.join(', ')}`)
    }
    if (!this.isRequiredForUser(kind as DocumentKind, user)) {
      throw new BadRequestException(`Document kind '${kind}' is not required for your account`)
    }

    let result: Awaited<ReturnType<typeof this.identity.verifyPan>> | null = null
    let source = 'manual'

    switch (kind) {
      case 'aadhar':
      case 'pan':
        result = await this.identity.verifyPan({ pan: input.pan ?? input.number ?? '', name: input.name })
        source = result.source
        break
      case 'bank':
        result = await this.identity.verifyBank({ account: input.account, ifsc: input.ifsc, upi: input.upi, statementKey: input.statementKey })
        source = result.source
        break
      case 'selfie':
        result = await this.identity.verifyFace({ selfieKey: input.selfieKey, selfieUri: input.selfieUri })
        source = result.source
        break
      default:
        throw new BadRequestException(`Kind '${kind}' is verified via a different flow (rc/license use vehicle/driver verification)`)
    }

    const status: KycStatus = result.verified ? 'approved' : 'rejected'

    // Persist an approval document (or reuse the uploaded one) recording the source.
    const doc = await this.prisma.kycDocument.create({
      data: {
        userId: user.id,
        kind: kind as DocumentKind,
        storageKey: input.storageKey ?? input.selfieKey ?? `kyc/${user.id}/${kind}-verified`,
        mimeType: 'application/json',
        size: 0,
        status,
        verificationSource: source as never,
        verifiedAt: result.verified ? new Date() : null,
        adminNote: result.verified ? `Verified via ${source}` : 'Provider verification failed',
      },
    })

    await this.recompute(user.id)
    return { document: doc, verified: result.verified, source }
  }

  /** Recompute overall KYC status from the user's role requirements. */
  private async recompute(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) return
    const required = requiredDocsFor(this.capabilities(user))
    const docs = await this.prisma.kycDocument.findMany({ where: { userId } })
    const approved = (k: DocumentKind) => docs.some((d) => d.kind === k && d.status === 'approved')
    const allRequiredApproved = required.length > 0 && required.every(approved)
    const hasApprovedBank = approved('bank')
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(allRequiredApproved ? { kycStatus: 'approved', tier: 'kyc_full' } : {}),
        ...(hasApprovedBank ? { bankVerified: true } : {}),
      },
    })
  }

  /** Full identity + financial verification for a user (all required docs). */
  async requirementsMet(user: User): Promise<{ met: boolean; missing: DocumentKind[] }> {
    const required = requiredDocsFor(this.capabilities(user))
    const docs = await this.prisma.kycDocument.findMany({ where: { userId: user.id } })
    const missing = required.filter((k) => !docs.some((d) => d.kind === k && d.status === 'approved'))
    return { met: missing.length === 0, missing }
  }

  /** Financial (money-movement) gate: pan + bank must be approved. */
  async financialVerified(user: User): Promise<boolean> {
    const docs = await this.prisma.kycDocument.findMany({ where: { userId: user.id } })
    return financialDocs().every((k) => docs.some((d) => d.kind === k && d.status === 'approved'))
  }

  async requestPodUpload(tripId: string, mimeType: string, size: number, user: User) {
    this.assertMime(mimeType)
    // Only the assigned transporter may upload POD for a trip.
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } })
    if (!trip) throw new NotFoundException('Trip not found')
    const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    if (!transporter || transporter.id !== trip.transporterId) {
      throw new ForbiddenException('Only the assigned transporter can upload POD')
    }
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
