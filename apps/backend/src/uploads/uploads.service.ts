import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

/** Strict server-side allowlist of upload MIME types. */
export const ALLOWED_UPLOAD_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
])

@Injectable()
export class UploadsService implements OnModuleInit {
  private readonly logger = new Logger(UploadsService.name)
  private client: S3Client | null = null

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const endpoint = this.config.get('MINIO_ENDPOINT')
    const region = this.config.get('S3_REGION') ?? 'us-east-1'
    const access = this.config.get('MINIO_ROOT_USER')
    const secret = this.config.get('MINIO_ROOT_PASSWORD')

    this.client = new S3Client({
      region,
      endpoint: endpoint ? `http://${endpoint}` : undefined,
      forcePathStyle: endpoint ? true : undefined,
      credentials: { accessKeyId: access ?? '', secretAccessKey: secret ?? '' },
    })
    await this.ensureBucket()
  }

  private async ensureBucket() {
    try {
      await this.client!.send(new HeadBucketCommand({ Bucket: this.bucket }))
    } catch {
      try {
        await this.client!.send(new CreateBucketCommand({ Bucket: this.bucket }))
        this.logger.log(`created bucket ${this.bucket}`)
      } catch (e) {
        this.logger.warn(`could not ensure bucket ${this.bucket}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  get bucket() {
    return this.config.get('MINIO_BUCKET') ?? 'wagon'
  }

  /** Generates a presigned PUT URL + final object key for an upload. */
  async presignUpload(input: {
    folder: string
    mimeType: string
    size: number
    maxSizeMb?: number
  }) {
    const maxSize = (input.maxSizeMb ?? 10) * 1024 * 1024
    if (input.size > maxSize) {
      throw new Error(`File exceeds ${input.maxSizeMb ?? 10}MB limit`)
    }
    if (!ALLOWED_UPLOAD_MIMES.has(input.mimeType)) {
      throw new Error(`File type not allowed: ${input.mimeType}`)
    }
    const key = `${input.folder}/${randomUUID()}`
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: input.mimeType,
      // Bind the presigned URL to the exact content type so the client cannot
      // rewrite it to something outside the allowlist during PUT.
      ContentLength: input.size,
    })
    const url = await getSignedUrl(this.client!, command, { expiresIn: 300 })
    return { uploadUrl: url, key }
  }

  async presignRead(key: string) {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key })
    return getSignedUrl(this.client!, command, { expiresIn: 3600 })
  }

  async delete(key: string) {
    await this.client!.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    )
    this.logger.log(`deleted ${key}`)
  }
}
