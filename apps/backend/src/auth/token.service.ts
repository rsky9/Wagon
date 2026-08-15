import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { createHash, randomBytes } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

export interface AccessTokenPayload {
  sub: string
  role: User['role']
}

export interface ActionTokenPayload extends AccessTokenPayload {
  action: string
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex')
  }

  private randomRefreshToken() {
    return randomBytes(48).toString('base64url')
  }

  /** Issue an access + refresh pair; persists the refresh token (rotation-ready). */
  async issue(user: User, deviceId?: string, userAgent?: string) {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role }
    const [accessToken, refreshToken, refreshHash] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_TTL') ?? '15m',
      }),
      Promise.resolve(this.randomRefreshToken()),
      Promise.resolve(),
    ])
    const refreshTtl = this.config.get('JWT_REFRESH_TTL') ?? '30d'
    const expiresAt = new Date(Date.now() + parseTtl(refreshTtl))
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        deviceId: deviceId ?? null,
        userAgent: userAgent ?? null,
        expiresAt,
      },
    })
    return { accessToken, refreshToken }
  }

  /**
   * Rotate a refresh token: verify it is a live, unrevoked session, revoke it,
   * and issue a new pair bound to the same device. Reuse of a rotated token is
   * rejected (revokes the whole family as a theft signal).
   */
  async refresh(refreshToken: string, deviceId?: string, userAgent?: string) {
    const hash = this.hashToken(refreshToken)
    const session = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } })
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token')
    }
    // Device binding: if the session is bound and the device differs, revoke.
    if (session.deviceId && deviceId && session.deviceId !== deviceId) {
      await this.revokeFamily(session.userId)
      throw new UnauthorizedException('Session used from a new device')
    }
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } })
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive')
    }
    // Rotate: issue the new pair first, then revoke this session.
    const next = await this.issue(user, session.deviceId ?? deviceId, session.userAgent ?? userAgent)
    await this.prisma.refreshToken.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), replacedById: (await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hashToken(next.refreshToken) } }))?.id ?? null },
    })
    return next
  }

  /** Revoke every live session for a user (logout-all / theft response). */
  async revokeAll(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  /** Revoke this device's session (logout). */
  async revokeDevice(refreshToken: string) {
    const session = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hashToken(refreshToken) } })
    if (session && !session.revokedAt) {
      await this.prisma.refreshToken.update({ where: { id: session.id }, data: { revokedAt: new Date() } })
    }
  }

  private async revokeFamily(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  async verifyAccess(token: string): Promise<AccessTokenPayload> {
    try {
      return await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
      })
    } catch {
      throw new UnauthorizedException('Invalid or expired access token')
    }
  }

  async userFromPayload(payload: AccessTokenPayload): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive')
    }
    return user
  }

  /** Short-lived, action-scoped token minted after step-up OTP verification. */
  async signActionToken(user: User, action: string) {
    const payload: ActionTokenPayload = { sub: user.id, role: user.role, action }
    return this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: '5m',
    })
  }

  async verifyActionToken(token: string, action: string): Promise<AccessTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<ActionTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
      })
      if (payload.action !== action) throw new UnauthorizedException('Token is for a different action')
      return payload
    } catch {
      throw new UnauthorizedException('Action verification expired or invalid')
    }
  }
}

function parseTtl(ttl: string): number {
  const m = ttl.match(/^(\d+)([smhd])$/)
  if (!m) return 30 * 24 * 60 * 60 * 1000
  const n = Number(m[1])
  const unit = m[2]
  const ms = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000
  return n * ms
}
