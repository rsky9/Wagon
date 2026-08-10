import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import type { User } from '@prisma/client'

export interface AccessTokenPayload {
  sub: string
  role: User['role']
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async issue(user: User) {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role }
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_TTL') ?? '15m',
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_TTL') ?? '30d',
      }),
    ])
    return { accessToken, refreshToken }
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

  async refresh(refreshToken: string) {
    let payload: AccessTokenPayload
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      })
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token')
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive')
    }
    return this.issue(user)
  }

  async userFromPayload(payload: AccessTokenPayload): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive')
    }
    return user
  }
}
