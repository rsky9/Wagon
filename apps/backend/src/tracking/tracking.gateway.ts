import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Logger, Inject, forwardRef, UnauthorizedException } from '@nestjs/common'
import { TokenService } from '../auth/token.service'
import { TrackingService } from './tracking.service'

export const TRACKING_NS = '/tracking'

interface AuthedSocket extends Socket {
  authUser?: { id: string }
}

@WebSocketGateway({ namespace: TRACKING_NS, cors: { origin: '*' } })
export class TrackingGateway implements OnGatewayInit {
  private readonly logger = new Logger(TrackingGateway.name)

  @WebSocketServer()
  server!: Server

  constructor(
    @Inject(forwardRef(() => TrackingService)) private readonly tracking: TrackingService,
    private readonly token: TokenService,
  ) {}

  afterInit(server: Server) {
    // Authenticate during the handshake so `authUser` is set before the first message.
    server.use(async (socket: Socket, next) => {
      try {
        const raw = (socket.handshake.auth?.token ?? socket.handshake.query?.token) as string | undefined
        if (!raw) throw new UnauthorizedException('Missing token')
        const payload = await this.token.verifyAccess(raw)
        const user = await this.token.userFromPayload(payload)
        ;(socket as AuthedSocket).authUser = { id: user.id }
        this.logger.debug(`socket ${socket.id} authenticated as ${user.id}`)
        next()
      } catch (e) {
        this.logger.warn(`socket ${socket.id} rejected: ${e instanceof Error ? e.message : e}`)
        next(new Error('Unauthorized'))
      }
    })
  }

  @SubscribeMessage('join')
  async onJoin(@MessageBody() data: { tripId: string }, @ConnectedSocket() client: Socket) {
    const socket = client as AuthedSocket
    if (!data?.tripId || !socket.authUser) return
    const isParticipant = await this.tracking.isParticipantForSocket(data.tripId, socket.authUser.id)
    if (!isParticipant) {
      client.emit('auth_error', { message: 'Not a participant of this trip' })
      return
    }
    await client.join(`trip:${data.tripId}`)
    this.logger.log(`socket ${client.id} joined trip:${data.tripId}`)
    // Send current location snapshot on join.
    const latest = await this.tracking.latest(data.tripId)
    if (latest) {
      client.emit('location', {
        tripId: data.tripId,
        lat: latest.lat,
        lng: latest.lng,
        speedKmh: latest.speedKmh,
        recordedAt: latest.recordedAt,
      })
    }
  }

  @SubscribeMessage('leave')
  onLeave(@MessageBody() data: { tripId: string }, @ConnectedSocket() client: Socket) {
    if (!data?.tripId) return
    client.leave(`trip:${data.tripId}`)
  }

  broadcast(tripId: string, payload: { lat: number; lng: number; speedKmh?: number | null; recordedAt: Date; zone?: 'none' | 'pickup' | 'drop'; etaMinutes?: number | null }) {
    this.server.to(`trip:${tripId}`).emit('location', { tripId, ...payload })
  }
}
