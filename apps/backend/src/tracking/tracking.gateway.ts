import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { Logger, Inject, forwardRef } from '@nestjs/common'
import { TrackingService } from './tracking.service'

export const TRACKING_NS = '/tracking'

@WebSocketGateway({ namespace: TRACKING_NS, cors: { origin: '*' } })
export class TrackingGateway {
  private readonly logger = new Logger(TrackingGateway.name)

  @WebSocketServer()
  server!: Server

  constructor(
    @Inject(forwardRef(() => TrackingService)) private readonly tracking: TrackingService,
  ) {}

  @SubscribeMessage('join')
  async onJoin(@MessageBody() data: { tripId: string }, @ConnectedSocket() client: Socket) {
    if (!data?.tripId) return
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

  broadcast(tripId: string, payload: { lat: number; lng: number; speedKmh?: number | null; recordedAt: Date; zone?: 'none' | 'pickup' | 'drop' }) {
    this.server.to(`trip:${tripId}`).emit('location', { tripId, ...payload })
  }
}
