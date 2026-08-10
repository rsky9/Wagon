import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { initializeApp, cert, getApps } from 'firebase-admin'
import { getMessaging, type Messaging } from 'firebase-admin/messaging'
import { PrismaService } from '../prisma/prisma.service'

export interface PushInput {
  userId: string
  title: string
  body: string
  data?: Record<string, unknown>
}

/**
 * Push notification dispatcher. Uses Firebase Cloud Messaging when a service
 * account is configured; otherwise logs (mock) so the rest of the pipeline
 * works end-to-end in dev/demo without Firebase setup.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name)
  private fcm: Messaging | null = null

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const serviceAccountPath = this.config.get('FIREBASE_SERVICE_ACCOUNT_PATH')
    if (!serviceAccountPath) {
      this.logger.log('FCM not configured — push notifications run in mock mode')
      return
    }
    try {
      if (getApps().length === 0) {
        initializeApp({
          credential: cert(serviceAccountPath),
        })
      }
      this.fcm = getMessaging()
      this.logger.log('FCM initialized')
    } catch (e) {
      this.logger.warn(`Failed to init FCM: ${e instanceof Error ? e.message : e}`)
    }
  }

  async send(input: PushInput) {
    const tokens = await this.prisma.fcmToken.findMany({
      where: { userId: input.userId },
    })
    if (tokens.length === 0) {
      this.logger.debug(`no FCM tokens for user ${input.userId}`)
      return { sent: 0 }
    }

    if (!this.fcm) {
      this.logger.log(
        `[mock-push] ${input.title}: ${input.body} -> ${tokens.length} device(s)`,
      )
      return { sent: tokens.length, mock: true }
    }

    const result = await this.fcm.sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: { title: input.title, body: input.body },
      data: Object.fromEntries(
        Object.entries(input.data ?? {}).map(([k, v]) => [k, String(v)]),
      ),
    })
    return { sent: tokens.length, result }
  }
}
