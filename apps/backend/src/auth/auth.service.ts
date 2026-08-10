import { Injectable, BadRequestException, Inject } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomBytes } from 'crypto'
import { hash, compare } from 'bcryptjs'
import type Redis from 'ioredis'
import { PrismaService } from '../prisma/prisma.service'
import { TokenService } from './token.service'
import { OtpProvider, OTP_PROVIDER } from './otp-provider.service'
import { REDIS } from '../redis/redis.module'
import type { SendOtpRequest, VerifyOtpRequest } from '@wagon/contracts'
import type { User } from '@prisma/client'

const OTP_TTL_SEC = 5 * 60 // 5 minutes
const OTP_KEY = (mobile: string) => `otp:${mobile}`

interface OtpRecord {
  codeHash: string
  attempts: number
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OTP_PROVIDER) private readonly provider: OtpProvider,
    private readonly config: ConfigService,
    private readonly tokens: TokenService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async requestOtp(input: SendOtpRequest) {
    const code = this.generateCode()
    const codeHash = await hash(code, 10)
    const record: OtpRecord = { codeHash, attempts: 0 }
    // Atomic set with TTL — survives restarts and works across instances.
    await this.redis.set(OTP_KEY(input.mobile), JSON.stringify(record), 'EX', OTP_TTL_SEC)

    await this.provider.send({ mobile: input.mobile, channel: input.channel ?? 'sms' }, code)

    return {
      requestId: this.requestId(input.mobile),
      expiresIn: OTP_TTL_SEC * 1000,
      // Mock-only: in production the code is never returned to the client.
      devCode: this.config.get('NODE_ENV') === 'production' ? undefined : code,
    }
  }

  async verifyOtp(input: VerifyOtpRequest) {
    const key = OTP_KEY(input.mobile)
    const raw = await this.redis.get(key)
    if (!raw) {
      throw new BadRequestException('No OTP requested for this number')
    }

    const record = JSON.parse(raw) as OtpRecord

    // Bump attempts atomically; delete after 5 failures (and never reuse).
    const nextAttempts = record.attempts + 1
    if (nextAttempts > 5) {
      await this.redis.del(key)
      throw new BadRequestException('Too many attempts')
    }

    const valid = await compare(input.code, record.codeHash)
    if (!valid) {
      record.attempts = nextAttempts
      await this.redis.set(key, JSON.stringify(record), 'EX', OTP_TTL_SEC)
      throw new BadRequestException('Invalid OTP')
    }

    // Consume the OTP — single-use.
    await this.redis.del(key)
    const { user, isNewUser } = await this.upsertUserByMobile(input.mobile)
    const { accessToken, refreshToken } = await this.tokens.issue(user)
    return { accessToken, refreshToken, profile: user, isNewUser }
  }

  async setRole(user: User, role: string) {
    // Users can never self-promote to admin.
    if (role === 'admin') {
      throw new BadRequestException('Cannot self-assign the admin role')
    }
    if (!['transporter', 'supplier', 'driver'].includes(role)) {
      throw new BadRequestException('Invalid role')
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { role: role as User['role'] },
    })
    return { profile: updated }
  }

  /** Unified capabilities: a single account can be supplier, transporter or both. */
  async setCapabilities(user: User, capabilities: string[]) {
    const valid = ['supplier', 'transporter', 'driver']
    const clean = [...new Set(capabilities.map((c) => c.toLowerCase()))]
    if (clean.length === 0 || clean.some((c) => !valid.includes(c))) {
      throw new BadRequestException('Invalid capabilities')
    }
    // Keep the primary role in sync for backward-compat with guards.
    const primary = clean[0] === 'supplier' || clean[0] === 'transporter' || clean[0] === 'driver' ? (clean[0] as User['role']) : user.role
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        capabilities: clean as User['capabilities'],
        role: primary,
      },
    })
    return { profile: updated }
  }

  /** Bank payout details for the active capability. */
  async updateBank(user: User, account: string, ifsc: string, holder: string) {
    if (!account?.trim() || !ifsc?.trim()) throw new BadRequestException('Account and IFSC are required')
    const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    if (transporter) {
      const updated = await this.prisma.transporter.update({
        where: { id: transporter.id },
        data: { bankAccount: account.trim(), ifsc: ifsc.trim(), acctHolder: holder?.trim() || null },
      })
      return { bank: { account: updated.bankAccount, ifsc: updated.ifsc, holder: updated.acctHolder } }
    }
    const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
    if (supplier) {
      const updated = await this.prisma.supplier.update({
        where: { id: supplier.id },
        data: { bankAccount: account.trim(), ifsc: ifsc.trim(), acctHolder: holder?.trim() || null },
      })
      return { bank: { account: updated.bankAccount, ifsc: updated.ifsc, holder: updated.acctHolder } }
    }
    throw new BadRequestException('Complete onboarding first to save bank details')
  }

  async myBank(user: User) {
    const transporter = await this.prisma.transporter.findUnique({ where: { userId: user.id } })
    if (transporter?.bankAccount) {
      return { bank: { account: transporter.bankAccount, ifsc: transporter.ifsc, holder: transporter.acctHolder } }
    }
    const supplier = await this.prisma.supplier.findUnique({ where: { userId: user.id } })
    if (supplier?.bankAccount) {
      return { bank: { account: supplier.bankAccount, ifsc: supplier.ifsc, holder: supplier.acctHolder } }
    }
    return { bank: null }
  }

  /** Delete the account permanently. */
  async deleteAccount(user: User) {
    await this.prisma.user.delete({ where: { id: user.id } }).catch(async () => {
      // Fallback: deactivate if hard delete fails (e.g. FK constraints).
      await this.prisma.user.update({ where: { id: user.id }, data: { isActive: false } })
    })
    return { deleted: true }
  }

  private async upsertUserByMobile(mobile: string) {
    const existing = await this.prisma.user.findUnique({ where: { mobile } })
    if (existing) {
      return { user: existing, isNewUser: false }
    }
    const created = await this.prisma.user.create({
      data: { mobile, role: 'transporter' },
    })
    return { user: created, isNewUser: true }
  }

  private generateCode() {
    return String(randomBytes(2).readUInt16BE(0) % 10000).padStart(4, '0')
  }

  private requestId(mobile: string) {
    // Deterministic id for the mock; a real provider returns its own request id.
    return Buffer.from(mobile).toString('base64url')
  }
}
