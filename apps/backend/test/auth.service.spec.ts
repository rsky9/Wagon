import { BadRequestException } from '@nestjs/common'
import { AuthService } from '../src/auth/auth.service'

describe('AuthService', () => {
  let service: AuthService
  let prisma: any
  let provider: any
  let config: any
  let tokens: any
  let redis: any

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), create: jest.fn() } }
    provider = { send: jest.fn() }
    config = { get: jest.fn().mockReturnValue('development') }
    tokens = { issue: jest.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' }) }
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
    }
    service = new AuthService(prisma, provider, config, tokens, redis)
  })

  describe('requestOtp', () => {
    it('stores a hashed code in redis with TTL and returns a dev code', async () => {
      const res = await service.requestOtp({ mobile: '9999911111' })
      expect(redis.set).toHaveBeenCalledWith(
        'otp:9999911111',
        expect.stringContaining('"attempts":0'),
        'EX',
        300,
      )
      expect(provider.send).toHaveBeenCalledWith({ mobile: '9999911111', channel: 'sms' }, expect.any(String))
      expect(res.devCode).toMatch(/^\d{4}$/)
      expect(res.expiresIn).toBe(300000)
    })

    it('does not return a dev code in production', async () => {
      config.get.mockReturnValue('production')
      const res = await service.requestOtp({ mobile: '9999911111' })
      expect(res.devCode).toBeUndefined()
    })
  })

  describe('verifyOtp', () => {
    const raw = JSON.stringify({ codeHash: 'hash', attempts: 0 })

    it('throws if no OTP requested', async () => {
      redis.get.mockResolvedValue(null)
      await expect(service.verifyOtp({ mobile: '9999911111', code: '1234', requestId: 'x' })).rejects.toThrow(
        BadRequestException,
      )
    })

    it('deletes OTP after too many attempts', async () => {
      redis.get.mockResolvedValue(JSON.stringify({ codeHash: 'h', attempts: 5 }))
      await expect(service.verifyOtp({ mobile: '9999911111', code: '1234', requestId: 'x' })).rejects.toThrow(
        'Too many attempts',
      )
      expect(redis.del).toHaveBeenCalled()
    })

    it('consumes OTP and issues tokens on success', async () => {
      // We need compare() to pass; inject a real bcrypt hash via requestOtp flow is heavy,
      // so stub the imported compare through the module — simplest is to test via the 
      // request->verify round trip with a real hash using the internal generateCode.
      // Instead, simulate success by mocking redis and prisma, and monkey-patch.
      redis.get.mockResolvedValue(raw)
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', mobile: '9999911111', role: 'transporter' })

      // Bypass bcrypt compare by stubbing via jest on the module dependency is not easy here;
      // assert that wrong path is covered and success path returns structure via tokens.issue.
      // We'll patch the service instance's dependency indirectly by mocking `compare`.
      const bcrypt = require('bcryptjs')
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never)

      const res = await service.verifyOtp({ mobile: '9999911111', code: '1234', requestId: 'x' })
      expect(redis.del).toHaveBeenCalledWith('otp:9999911111')
      expect(res.accessToken).toBe('at')
      expect(res.isNewUser).toBe(false)
    })

    it('bumps attempts and throws on invalid code', async () => {
      redis.get.mockResolvedValue(raw)
      const bcrypt = require('bcryptjs')
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never)
      await expect(service.verifyOtp({ mobile: '9999911111', code: '0000', requestId: 'x' })).rejects.toThrow(
        'Invalid OTP',
      )
      expect(redis.set).toHaveBeenCalled()
    })
  })
})
