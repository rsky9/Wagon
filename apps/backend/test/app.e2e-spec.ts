import { Test } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import request from 'supertest'
import helmet from 'helmet'
import { AppModule } from '../src/app.module'
import { REDIS } from '../src/redis/redis.module'
import { PrismaService } from '../src/prisma/prisma.service'

// Runs against the local dev Postgres (see .env). Requires: docker compose up.
describe('Wagon API (e2e)', () => {
  let app: INestApplication
  let supToken: string
  let trToken: string
  let admToken: string
  let trRefresh: string
  let loadId: string
  let tripId: string

  const SUP = '9963712337'
  const TR = '9491996633'
  const ADM = '9999988888'

  const requestOtp = async (mobile: string) => {
    // Clear per-mobile send throttle so seeded numbers can be reused across suites.
    const redis = app.get(REDIS)
    if (redis?.del) {
      await redis.del(`otp_send_cooldown:${mobile}`).catch(() => {})
      await redis.del(`otp_send_count:${mobile}`).catch(() => {})
    }
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/otp')
      .send({ mobile })
      .expect(201)
    return res.body.devCode as string
  }

  const verify = async (mobile: string, code: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/verify')
      .send({ mobile, code })
      .expect(201)
    return res.body.accessToken as string
  }

  /** Step up a sensitive action: request + verify a re-OTP, return the action token. */
  const stepUpAction = async (action: string, token: string) => {
    const step = await request(app.getHttpServer())
      .post(`/api/v1/auth/actions/${action}/request`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201)
    const verified = await request(app.getHttpServer())
      .post(`/api/v1/auth/actions/${action}/verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: step.body.devCode })
      .expect(201)
    return verified.body.actionToken as string
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    app.use(helmet())
    app.setGlobalPrefix('api/v1')
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    )
    await app.init()
    await app.listen(0)

    // Reset transactional test data between runs (keeps reference + users seeded).
    const prisma = app.get(PrismaService)
    await prisma.$transaction([
      prisma.message.deleteMany(),
      prisma.bookingSnapshot.deleteMany(),
      prisma.tripException.deleteMany(),
      prisma.negotiationOffer.deleteMany(),
      prisma.bid.deleteMany(),
      prisma.quote.deleteMany(),
      prisma.favorite.deleteMany(),
      prisma.savedSearch.deleteMany(),
      prisma.payment.deleteMany(),
      prisma.tripLocation.deleteMany(),
      prisma.trip.deleteMany(),
      prisma.load.deleteMany(),
      prisma.dispute.deleteMany(),
      prisma.notification.deleteMany(),
    ])
  })

  afterAll(async () => {
    await app.close()
    // Close global Redis so jest can exit cleanly.
    const redis = app.get(REDIS)
    if (redis && typeof redis.quit === 'function') {
      await redis.quit()
    }
  })

  it('serves health', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200).expect({ status: 'ok', db: 'up' })
  })

  describe('auth', () => {
    it('authenticates supplier, transporter and admin via OTP', async () => {
      supToken = await verify(SUP, await requestOtp(SUP))
      const tr = await request(app.getHttpServer())
        .post('/api/v1/auth/verify')
        .send({ mobile: TR, code: await requestOtp(TR), deviceId: 'dev-e2e-transporter' })
        .expect(201)
      trToken = tr.body.accessToken
      trRefresh = tr.body.refreshToken
      admToken = await verify(ADM, await requestOtp(ADM))
      expect(supToken).toBeTruthy()
      expect(trToken).toBeTruthy()
      expect(admToken).toBeTruthy()
      // Ensure the demo transporter passes the KYC-verified bid/accept gates.
      await request(app.getHttpServer())
        .post('/api/v1/admin/verify/' + (await request(app.getHttpServer()).get('/api/v1/admin/users?q=' + TR).set('Authorization', `Bearer ${admToken}`).expect(200)).body.users.find((u: { mobile: string }) => u.mobile === TR).id)
        .set('Authorization', `Bearer ${admToken}`)
        .send({ capability: 'transporter' })
        .expect(201)
      // Ensure the demo supplier passes the supplierVerified load-posting gate.
      await request(app.getHttpServer())
        .post('/api/v1/admin/verify/' + (await request(app.getHttpServer()).get('/api/v1/admin/users?q=' + SUP).set('Authorization', `Bearer ${admToken}`).expect(200)).body.users.find((u: { mobile: string }) => u.mobile === SUP).id)
        .set('Authorization', `Bearer ${admToken}`)
        .send({ capability: 'supplier' })
        .expect(201)
    })

    it('rejects an invalid OTP', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify')
        .send({ mobile: SUP, code: '0000' })
        .expect(400)
    })

    it('rotates refresh tokens and binds sessions to a device', async () => {
      const rt = trRefresh

      // First refresh rotates (returns a new token) and succeeds.
      const r1 = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: rt, deviceId: 'dev-e2e-transporter' })
        .expect(201)
      expect(r1.body.refreshToken).not.toBe(rt)

      // Reusing the rotated token is rejected (theft signal).
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: rt, deviceId: 'dev-e2e-transporter' })
        .expect(401)

      // Refreshing from a different device is rejected and revokes the family.
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: r1.body.refreshToken, deviceId: 'dev-e2e-2' })
        .expect(401)
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: r1.body.refreshToken, deviceId: 'dev-e2e-transporter' })
        .expect(401)
    })

    it('exposes home summary with money + alerts for the role', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/home/summary')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(res.body.capabilities).toContain('transporter')
      expect(res.body.transporter).toBeTruthy()
      expect(typeof res.body.transporter.money?.payoutPending).toBe('number')
      expect(res.body.alerts).toBeTruthy()
      expect(typeof res.body.alerts.unreadNotifications).toBe('number')
    })

    it('rejects requests without a token', async () => {
      await request(app.getHttpServer()).get('/api/v1/loads').expect(403)
    })

    it('returns the current user profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(res.body.profile.mobile).toBe(TR)
      expect(['transporter', 'supplier']).toContain(res.body.profile.role)
    })

    it('updates the user role via PATCH /auth/role', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/auth/role')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ role: 'supplier' })
        .expect(200)
      expect(res.body.profile.role).toBe('supplier')
      // revert
      await request(app.getHttpServer())
        .patch('/api/v1/auth/role')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ role: 'transporter' })
        .expect(200)
    })
  })

  describe('loads', () => {
    it('supplier posts a load', async () => {
      const ref = await request(app.getHttpServer()).get('/api/v1/reference').expect(200)
      const model = ref.body.models.find((m: { type: string }) => m.type === 'container')
      const material = ref.body.materials[0]

      const res = await request(app.getHttpServer())
        .post('/api/v1/loads')
        .set('Authorization', `Bearer ${supToken}`)
        .send({
          pickupAddr: 'Hyderabad, Telangana',
          dropAddr: 'Vijayawada, AP',
          pickupLat: 17.385,
          pickupLng: 78.487,
          dropLat: 16.506,
          dropLng: 80.648,
          date: '2026-09-01T08:00:00Z',
          truckType: 'container',
          modelId: model.id,
          weight: 35,
          distanceKm: 250,
          materialId: material.id,
        })
        .expect(201)
      loadId = res.body.load.id
      expect(res.body.load.status).toBe('posted')
      expect(res.body.load.fareEstimate).toBeGreaterThan(0)
    })

    it('rejects invalid load payload (non-whitelisted field)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/loads')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ pickupAddr: 'X', rogueField: true })
        .expect(400)
    })

    it('creates a load with full wizard fields', async () => {
      const ref = await request(app.getHttpServer()).get('/api/v1/reference').expect(200)
      const model = ref.body.models.find((m: { type: string }) => m.type === 'container')
      const material = ref.body.materials[0]
      const res = await request(app.getHttpServer())
        .post('/api/v1/loads')
        .set('Authorization', `Bearer ${supToken}`)
        .send({
          pickupAddr: 'Wizard City', dropAddr: 'Drop City',
          pickupLat: 17.4, pickupLng: 78.5, dropLat: 13.1, dropLng: 80.3,
          date: '2026-09-20T08:00:00Z',
          truckType: 'container', modelId: model.id, weight: 30, distanceKm: 200,
          materialId: material.id, bodyType: 'Container', loadingReq: 'Forklift',
          advanceAmount: 3000, contactName: 'Wizard', contactPhone: '9963712337',
        })
        .expect(201)
      expect(res.body.load.bodyType).toBe('Container')
      expect(res.body.load.loadingReq).toBe('Forklift')
      expect(res.body.load.advanceAmount).toBe(3000)
      expect(res.body.load.contactName).toBe('Wizard')
    })

    it('transporter sees the load in the feed', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/loads?truckType=container')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(res.body.items.some((l: { id: string }) => l.id === loadId)).toBe(true)
    })
  })

  describe('trips → payments → tracking (sequential lifecycle)', () => {
    beforeAll(async () => {
      // Accepting a load now requires an active truck in the fleet.
      const ref = await request(app.getHttpServer()).get('/api/v1/reference').expect(200)
      const model = ref.body.models.find((m: { type: string }) => m.type === 'container')
      await request(app.getHttpServer())
        .post('/api/v1/trucks')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ vehicleNo: 'AP11LIFE', type: 'container', modelId: model.id, origin: 'Hyderabad' })
        .expect(201)
    })

    it('transporter accepts the load and a trip is created', async () => {
      // Accept requires a step-up OTP (identity confirmation before committing).
      const actionToken = await stepUpAction('accept_load', trToken)
      const res = await request(app.getHttpServer())
        .post('/api/v1/trips/accept')
        .set('Authorization', `Bearer ${trToken}`)
        .set('x-action-token', actionToken)
        .send({ loadId })
        .expect(201)
      tripId = res.body.trip.id
      expect(res.body.trip.status).toBe('accepted')
    })

    it('rejects double-acceptance (load already assigned)', async () => {
      const actionToken = await stepUpAction('accept_load', trToken)
      await request(app.getHttpServer())
        .post('/api/v1/trips/accept')
        .set('Authorization', `Bearer ${trToken}`)
        .set('x-action-token', actionToken)
        .send({ loadId })
        .expect(400)
    })

    it('supplier captures escrow idempotently (while accepted)', async () => {
      // The escrow must equal the load's agreed fare, and requires step-up.
      const loadRes = await request(app.getHttpServer())
        .get(`/api/v1/loads/${loadId}`)
        .set('Authorization', `Bearer ${supToken}`)
        .expect(200)
      const agreed = loadRes.body.load.fareEstimate
      const token = await stepUpAction('capture_escrow', supToken)
      const first = await request(app.getHttpServer())
        .post('/api/v1/payments/escrow')
        .set('Authorization', `Bearer ${supToken}`)
        .set('x-action-token', token)
        .send({ tripId, amount: agreed })
        .expect(201)
      expect(first.body.alreadyCaptured).toBe(false)

      const second = await request(app.getHttpServer())
        .post('/api/v1/payments/escrow')
        .set('Authorization', `Bearer ${supToken}`)
        .set('x-action-token', token)
        .send({ tripId, amount: agreed })
        .expect(201)
      expect(second.body.alreadyCaptured).toBe(true)
      expect(second.body.payment.id).toBe(first.body.payment.id)
      // Over/under-paying the agreed rate is rejected.
      await request(app.getHttpServer())
        .post('/api/v1/payments/escrow')
        .set('Authorization', `Bearer ${supToken}`)
        .set('x-action-token', token)
        .send({ tripId, amount: agreed - 1 })
        .expect(400)
    })

    it('moves trip to in-transit and records tracking points', async () => {
      // Pickup OTP must be verified before going in-transit (no bypass).
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', `Bearer ${trToken}`)
        .send({ status: 'in_transit' })
        .expect(400)

      const gen = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/otp/pickup`)
        .set('Authorization', `Bearer ${trToken}`)
        .expect(201)
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/otp/pickup/verify`)
        .set('Authorization', `Bearer ${supToken}`)
        .send({ code: gen.body.devCode })
        .expect(201)

      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', `Bearer ${trToken}`)
        .send({ status: 'in_transit' })
        .expect(200)

      await request(app.getHttpServer())
        .post(`/api/v1/tracking/${tripId}/location`)
        .set('Authorization', `Bearer ${trToken}`)
        .send({ lat: 16.9, lng: 79.4, speedKmh: 55 })
        .expect(201)

      const res = await request(app.getHttpServer())
        .get(`/api/v1/tracking/${tripId}`)
        .set('Authorization', `Bearer ${supToken}`)
        .expect(200)
      expect(res.body.locations.length).toBeGreaterThanOrEqual(1)
    })

    it('requires delivery OTP before marking delivered', async () => {
      // Without OTP the delivery transition is rejected.
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', `Bearer ${trToken}`)
        .send({ status: 'delivered' })
        .expect(400)
    })

    it('generates and verifies delivery OTP, then delivers', async () => {
      const gen = await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/otp/delivery`)
        .set('Authorization', `Bearer ${trToken}`)
        .expect(201)
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${tripId}/otp/delivery/verify`)
        .set('Authorization', `Bearer ${supToken}`)
        .send({ code: gen.body.devCode })
        .expect(201)

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', `Bearer ${trToken}`)
        .send({ status: 'delivered' })
        .expect(200)
      expect(res.body.trip.status).toBe('delivered')
    })

    it('rejects an illegal transition after delivery', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/trips/${tripId}/status`)
        .set('Authorization', `Bearer ${trToken}`)
        .send({ status: 'in_transit' })
        .expect(400)
    })

    it('transporter uploads POD, consignee confirms, receives payout after step-up', async () => {
      // Transporter uploads delivery evidence (photo + geotag).
      await request(app.getHttpServer())
        .post(`/api/v1/payments/pod/${tripId}`)
        .set('Authorization', `Bearer ${trToken}`)
        .send({ photoKey: 'pod/e2e/123.png', consigneeName: 'E2E Consignee', lat: 13.1, lng: 80.3 })
        .expect(201)

      // Payout is blocked until the consignee/supplier confirms receipt.
      const stepEarly = await stepUpAction('release_payout', trToken)
      await request(app.getHttpServer())
        .post('/api/v1/payments/release')
        .set('Authorization', `Bearer ${trToken}`)
        .set('x-action-token', stepEarly)
        .send({ tripId })
        .expect(400)

      // Consignee (supplier) confirms the delivery evidence.
      await request(app.getHttpServer())
        .post(`/api/v1/payments/pod/${tripId}/confirm`)
        .set('Authorization', `Bearer ${supToken}`)
        .expect(201)

      // Money release requires a step-up OTP (action token) — without it, 401.
      await request(app.getHttpServer())
        .post('/api/v1/payments/release')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ tripId })
        .expect(401)

      // Step up: request + verify a re-OTP for release_payout, then release.
      const step = await request(app.getHttpServer())
        .post('/api/v1/auth/actions/release_payout/request')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(201)
      const verified = await request(app.getHttpServer())
        .post('/api/v1/auth/actions/release_payout/verify')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ code: step.body.devCode })
        .expect(201)
      expect(verified.body.actionToken).toBeTruthy()

      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/release')
        .set('Authorization', `Bearer ${trToken}`)
        .set('x-action-token', verified.body.actionToken)
        .send({ tripId })
        .expect(201)
      expect(res.body.payment.type).toBe('payout')
      expect(res.body.payment.status).toBe('succeeded')

      // An action token minted for a different action is rejected.
      const other = await request(app.getHttpServer())
        .post('/api/v1/auth/actions/confirm_booking/request')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(201)
      const otherVerified = await request(app.getHttpServer())
        .post('/api/v1/auth/actions/confirm_booking/verify')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ code: other.body.devCode })
        .expect(201)
      await request(app.getHttpServer())
        .post('/api/v1/payments/release')
        .set('Authorization', `Bearer ${trToken}`)
        .set('x-action-token', otherVerified.body.actionToken)
        .send({ tripId })
        .expect(401)
    })

    it('transporter passbook nets to −TDS after payout', async () => {
      const adm = await request(app.getHttpServer())
        .get('/api/v1/admin/payments')
        .set('Authorization', `Bearer ${admToken}`)
        .expect(200)
      const payout = adm.body.payments.find((p: { type: string; tripId: string }) => p.type === 'payout' && p.tripId === tripId)
      const tr = await request(app.getHttpServer())
        .get('/api/v1/payments/passbook')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      // Escrow (−amount) is netted against the payout (net of 2% TDS), so the
      // balance settles at the negative of the TDS withheld on the payout.
      expect(tr.body.balance).toBe(-(payout?.tdsAmount ?? 0))
    })

    it('exposes the reward wallet with balance and ledger', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/payments/wallet')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(typeof res.body.balance).toBe('number')
      expect(Array.isArray(res.body.transactions)).toBe(true)
    })

    it('gamification state includes the cash-conversion balance', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/gamification')
        .set('Authorization', `Bearer ${supToken}`)
        .expect(200)
      expect(typeof res.body.cashbackBalance).toBe('number')
    })

    it('supplier rates the transporter', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/ratings/trip/${tripId}`)
        .set('Authorization', `Bearer ${supToken}`)
        .send({ score: 5 })
        .expect(201)
      expect(res.body.trip.rating).toBe(5)
    })

    it('rejects out-of-range rating', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/ratings/trip/${tripId}`)
        .set('Authorization', `Bearer ${supToken}`)
        .send({ score: 9 })
        .expect(400)
    })

    it('exposes ratings through the Review model', async () => {
      const transporter = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      const res = await request(app.getHttpServer())
        .get(`/api/v1/ratings/transporter/${transporter.body.profile.id}`)
        .set('Authorization', `Bearer ${supToken}`)
        .expect(200)
      expect(res.body.rating).toBe(5)
      expect(res.body.count).toBeGreaterThanOrEqual(1)
    })

    it('returns gamification state and awards XP on quest completion', async () => {
      const state = await request(app.getHttpServer())
        .get('/api/v1/gamification')
        .set('Authorization', `Bearer ${supToken}`)
        .expect(200)
      expect(typeof state.body.xp).toBe('number')
      expect(Array.isArray(state.body.quests)).toBe(true)

      const complete = await request(app.getHttpServer())
        .post('/api/v1/gamification/quests/kyc/complete')
        .set('Authorization', `Bearer ${supToken}`)
        .expect(201)
      expect(complete.body.xp).toBeGreaterThanOrEqual(state.body.xp)
      expect(complete.body.quests.find((q: { id: string }) => q.id === 'kyc').done).toBe(true)
    })

    it('blocks non-participants from tracking history', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/tracking/${tripId}`)
        .set('Authorization', `Bearer ${admToken}`)
        .expect(400)
    })
  })

  describe('tracking websocket (auth-gated)', () => {
    const { io } = require('socket.io-client') as typeof import('socket.io-client')
    let wsPort: number

    beforeAll(async () => {
      const server = app.getHttpServer()
      wsPort = server.address().port
    })

    it('rejects a connection without a token', async () => {
      const base = `http://localhost:${wsPort}`
      const s = io(`${base}/tracking`, { transports: ['websocket'], forceNew: true })
      await new Promise<void>((resolve) => {
        s.on('auth_error', () => {
          s.close()
          resolve()
        })
        s.on('disconnect', (reason: string) => {
          if (reason === 'io server disconnect') {
            s.close()
            resolve()
          }
        })
        s.on('connect_error', () => {
          s.close()
          resolve()
        })
      })
      expect(true).toBe(true)
    })

    it('rejects joining a room the user is not a participant of', async () => {
      const base = `http://localhost:${wsPort}`
      const s = io(`${base}/tracking`, {
        transports: ['websocket'],
        forceNew: true,
        auth: { token: admToken },
      })
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout waiting for auth')), 3000)
        s.on('connect', () => {
          s.emit('join', { tripId })
          s.on('auth_error', () => {
            clearTimeout(timer)
            s.close()
            resolve()
          })
        })
        s.on('auth_error', () => {
          clearTimeout(timer)
          s.close()
          resolve()
        })
      })
      expect(true).toBe(true)
    })

    it('allows a participant to join a trip room', async () => {
      const base = `http://localhost:${wsPort}`
      const s = io(`${base}/tracking`, {
        transports: ['websocket'],
        forceNew: true,
        auth: { token: supToken },
      })
      let joined = false
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 2500)
        s.on('connect', () => {
          s.emit('join', { tripId })
          s.on('location', () => {})
        })
        // Joining a room is silent on success; treat an absence of auth_error
        // after connect as success.
        s.on('auth_error', () => {
          clearTimeout(timer)
          s.close()
          resolve()
        })
        s.on('disconnect', () => {})
        // The join succeeded if no error within the window.
        setTimeout(() => {
          joined = true
          clearTimeout(timer)
          s.close()
          resolve()
        }, 1200)
      })
      expect(joined).toBe(true)
    })
  })

  describe('kyc, ewb & uploads', () => {
    it('returns a presigned KYC upload URL', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/kyc/upload')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ kind: 'pan', mimeType: 'image/jpeg', size: 50000 })
        .expect(201)
      expect(res.body.uploadUrl).toContain('http')
      expect(res.body.documentId).toBeTruthy()
    })

    it('rejects invalid KYC kind', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/kyc/upload')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ kind: 'nope', mimeType: 'image/jpeg', size: 100 })
        .expect(400)
    })

    it('rejects disallowed upload MIME types (server-side hardening)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/kyc/upload')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ kind: 'pan', mimeType: 'text/html', size: 100 })
        .expect(400)
      await request(app.getHttpServer())
        .post('/api/v1/kyc/upload')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ kind: 'pan', mimeType: 'application/x-executable', size: 100 })
        .expect(400)
    })

    it('rejects oversized uploads', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/kyc/upload')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ kind: 'pan', mimeType: 'image/png', size: 11 * 1024 * 1024 })
        .expect(500)
    })

    it('generates an idempotent e-way bill', async () => {
      const first = await request(app.getHttpServer())
        .post(`/api/v1/ewb/loads/${loadId}`)
        .set('Authorization', `Bearer ${supToken}`)
        .expect(201)
      expect(first.body.ewbNumber).toMatch(/^EWB/)
      expect(first.body.alreadyGenerated).toBe(false)

      const second = await request(app.getHttpServer())
        .post(`/api/v1/ewb/loads/${loadId}`)
        .set('Authorization', `Bearer ${supToken}`)
        .expect(201)
      expect(second.body.alreadyGenerated).toBe(true)
      expect(second.body.ewbNumber).toBe(first.body.ewbNumber)
    })
  })

  describe('trucks, drivers & rate cards', () => {
    it('returns rate cards for all models', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/reference/rate-cards')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(res.body.rateCards.length).toBeGreaterThan(0)
      expect(res.body.rateCards[0].pricePerKm).toBeGreaterThan(0)
    })

    it('completes transporter onboarding and marks onboarded', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/onboarding/transporter')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ companyName: 'E2E Haulage', ownerName: 'Tester', pan: 'E2EPAN12', fleetSize: 2 })
        .expect(201)
      expect(res.body.onboarded).toBe(true)

      const status = await request(app.getHttpServer())
        .get('/api/v1/onboarding/status')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(status.body.onboarded).toBe(true)
    })

    it('transporter creates a truck', async () => {
      const ref = await request(app.getHttpServer())
        .get('/api/v1/reference')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      const model = ref.body.models.find((m: { type: string }) => m.type === 'container')
      const res = await request(app.getHttpServer())
        .post('/api/v1/trucks')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ vehicleNo: 'AP99TEST', type: 'container', modelId: model.id, origin: 'Hyderabad' })
        .expect(201)
      expect(res.body.vehicle.vehicleNo).toBe('AP99TEST')

      const list = await request(app.getHttpServer())
        .get('/api/v1/trucks')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(list.body.vehicles.length).toBeGreaterThan(0)
    })

    it('transporter creates a driver', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/drivers')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ name: 'E2E Driver', mobile: '9000099999' })
        .expect(201)
      expect(res.body.driver.name).toBe('E2E Driver')

      const list = await request(app.getHttpServer())
        .get('/api/v1/drivers')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(list.body.drivers.length).toBeGreaterThan(0)
    })

    it('blocks a supplier-only user from trucks endpoint (transporter only)', async () => {
      // Ensure the supplier has no transporter capability for this check.
      await request(app.getHttpServer())
        .patch('/api/v1/auth/capabilities')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ capabilities: ['supplier'] })
        .expect(200)
      await request(app.getHttpServer())
        .get('/api/v1/trucks')
        .set('Authorization', `Bearer ${supToken}`)
        .expect(403)
    })

    it('returns fleet dashboard with doc-expiry alerts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/trucks/fleet/dashboard')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(typeof res.body.summary).toBe('object')
      expect(Array.isArray(res.body.alerts)).toBe(true)
    })

    it('updates notification preferences', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/notification-preferences')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ promo: true, payment: false })
        .expect(200)
      const res = await request(app.getHttpServer())
        .get('/api/v1/notification-preferences')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(res.body.prefs.promo).toBe(true)
      expect(res.body.prefs.payment).toBe(false)
    })
  })

  describe('search, reviews & support', () => {
    it('searches loads by location', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/loads?q=Hyderabad')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(Array.isArray(res.body.items)).toBe(true)
    })

    it('enriches transporter feed with matchScore', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/loads')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      if (res.body.items.length > 0) {
        expect(typeof res.body.items[0].matchScore).toBe('number')
      }
    })

    it('creates and lists a support ticket', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/support/tickets')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ subject: 'E2E help', category: 'payment', message: 'Need payout help' })
        .expect(201)
      expect(created.body.ticket.status).toBe('open')

      const list = await request(app.getHttpServer())
        .get('/api/v1/support/tickets')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(list.body.tickets.length).toBeGreaterThan(0)
    })

    it('threads a support ticket: user reply, admin assign/priority/resolve', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/support/tickets')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ subject: 'Threaded help', category: 'trip', message: 'Trip got stuck' })
        .expect(201)
      const ticketId = created.body.ticket.id as string

      // Opening message seeds the thread.
      const thread1 = await request(app.getHttpServer())
        .get(`/api/v1/support/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(thread1.body.messages.length).toBe(1)
      expect(thread1.body.messages[0].authorType).toBe('user')

      // User replies.
      await request(app.getHttpServer())
        .post(`/api/v1/support/tickets/${ticketId}/messages`)
        .set('Authorization', `Bearer ${trToken}`)
        .send({ body: 'Here is the trip id' })
        .expect(201)

      // A different (non-owner, non-admin) user cannot read the thread.
      await request(app.getHttpServer())
        .get(`/api/v1/support/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${supToken}`)
        .expect(403)

      // Admin sees the ticket in the ops list (with user + message count).
      const adminList = await request(app.getHttpServer())
        .get('/api/v1/support/admin/tickets')
        .set('Authorization', `Bearer ${admToken}`)
        .expect(200)
      const adminTicket = adminList.body.tickets.find((t: { id: string }) => t.id === ticketId)
      expect(adminTicket).toBeTruthy()
      expect(adminTicket.user.mobile).toBeTruthy()
      expect(adminTicket._count.messages).toBeGreaterThanOrEqual(2)

      // Admin replies, assigns, sets priority and resolves.
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${admToken}`)
        .expect(200)
      const adminId = me.body.profile.id as string

      await request(app.getHttpServer())
        .post(`/api/v1/support/tickets/${ticketId}/messages`)
        .set('Authorization', `Bearer ${admToken}`)
        .send({ body: 'Looking into it' })
        .expect(201)

      const assigned = await request(app.getHttpServer())
        .patch(`/api/v1/support/tickets/${ticketId}/assign`)
        .set('Authorization', `Bearer ${admToken}`)
        .send({ assignedToId: adminId })
        .expect(200)
      expect(assigned.body.ticket.status).toBe('assigned')
      expect(assigned.body.ticket.assignedToId).toBe(adminId)
      expect(assigned.body.ticket.assignedTo.id).toBe(adminId)

      const prioritised = await request(app.getHttpServer())
        .patch(`/api/v1/support/tickets/${ticketId}/priority`)
        .set('Authorization', `Bearer ${admToken}`)
        .send({ priority: 'urgent' })
        .expect(200)
      expect(prioritised.body.ticket.priority).toBe('urgent')

      const resolved = await request(app.getHttpServer())
        .post(`/api/v1/support/tickets/${ticketId}/resolve`)
        .set('Authorization', `Bearer ${admToken}`)
        .send({ resolution: 'Settled via refund' })
        .expect(201)
      expect(resolved.body.ticket.status).toBe('closed')
      expect(resolved.body.ticket.resolution).toBe('Settled via refund')

      // Owner was notified of the admin reply and the resolution.
      const ownerNotifs = await request(app.getHttpServer())
        .get('/api/v1/notifications?limit=50')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      const ownerTicketTypes = ownerNotifs.body.items
        .filter((n: { data?: { ticketId?: string } }) => n.data?.ticketId === ticketId)
        .map((n: { type: string }) => n.type)
      expect(ownerTicketTypes).toContain('ticket_reply')
      expect(ownerTicketTypes).toContain('ticket_resolved')

      // Full thread preserved (2 user + 1 admin).
      const finalThread = await request(app.getHttpServer())
        .get(`/api/v1/support/tickets/${ticketId}`)
        .set('Authorization', `Bearer ${admToken}`)
        .expect(200)
      expect(finalThread.body.messages).toHaveLength(3)
      expect(finalThread.body.messages.map((m: { authorType: string }) => m.authorType)).toEqual(
        expect.arrayContaining(['user', 'user', 'admin']),
      )
    })

    it('rejects re-rating an already-rated trip (idempotent)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/ratings/trip/${tripId}`)
        .set('Authorization', `Bearer ${supToken}`)
        .send({ score: 4, review: 'On time' })
        .expect(400)
    })

    it('returns transporter reviews', async () => {
      const me = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      const userId = me.body.profile.id
      const res = await request(app.getHttpServer())
        .get(`/api/v1/ratings/transporter/${userId}/reviews`)
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(Array.isArray(res.body.reviews)).toBe(true)
    })
  })

  describe('trip execution state machine', () => {
    let execTripId: string

    beforeAll(async () => {
      // Supplier posts a fresh load; transporter accepts.
      const ref = await request(app.getHttpServer()).get('/api/v1/reference').expect(200)
      const model = ref.body.models.find((m: { type: string }) => m.type === 'container')
      const material = ref.body.materials[0]
      const loadRes = await request(app.getHttpServer())
        .post('/api/v1/loads')
        .set('Authorization', `Bearer ${supToken}`)
        .send({
          pickupAddr: 'E2E City, India', dropAddr: 'Return City, India',
          pickupLat: 17.4, pickupLng: 78.5, dropLat: 13.1, dropLng: 80.3,
          date: '2026-09-12T08:00:00Z', truckType: 'container',
          modelId: model.id, weight: 30, distanceKm: 100, materialId: material.id,
        })
        .expect(201)
      const actionToken = await stepUpAction('accept_load', trToken)
      const acceptRes = await request(app.getHttpServer())
        .post('/api/v1/trips/accept')
        .set('Authorization', `Bearer ${trToken}`)
        .set('x-action-token', actionToken)
        .send({ loadId: loadRes.body.load.id })
        .expect(201)
      execTripId = acceptRes.body.trip.id
    })

    it('advances accepted → enroute_pickup → arrived_pickup', async () => {
      await request(app.getHttpServer()).post(`/api/v1/trips/${execTripId}/advance`).set('Authorization', `Bearer ${trToken}`).expect(201)
      const res = await request(app.getHttpServer()).post(`/api/v1/trips/${execTripId}/advance`).set('Authorization', `Bearer ${trToken}`).expect(201)
      expect(res.body.trip.stage).toBe('arrived_pickup')
    })

    it('blocks loading until pickup OTP verified', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${execTripId}/advance`)
        .set('Authorization', `Bearer ${trToken}`)
        .expect(400)
    })

    it('generates + verifies pickup OTP then proceeds to loaded/in_transit', async () => {
      const otpRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${execTripId}/otp/pickup`)
        .set('Authorization', `Bearer ${trToken}`)
        .expect(201)
      const code = otpRes.body.devCode
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${execTripId}/otp/pickup/verify`)
        .set('Authorization', `Bearer ${supToken}`)
        .send({ code })
        .expect(201)
      await request(app.getHttpServer()).post(`/api/v1/trips/${execTripId}/advance`).set('Authorization', `Bearer ${trToken}`).expect(201)
      await request(app.getHttpServer()).post(`/api/v1/trips/${execTripId}/advance`).set('Authorization', `Bearer ${trToken}`).expect(201)
      const res = await request(app.getHttpServer()).post(`/api/v1/trips/${execTripId}/advance`).set('Authorization', `Bearer ${trToken}`).expect(201)
      expect(res.body.trip.status).toBe('in_transit')
    })

    it('captures advance + balance split payments idempotently (in transit)', async () => {
      // Advance and balance are separate captures with their own idempotency,
      // each requiring step-up. Use the trip's actual fare for valid split terms.
      const tripRes = await request(app.getHttpServer())
        .get('/api/v1/trips/mine')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      const execTrip = tripRes.body.trips.find((t: { id: string }) => t.id === execTripId)
      const fare = execTrip?.load?.fareEstimate ?? 3000
      const advanceAmt = Math.round(fare * 0.3)
      const balanceAmt = fare - advanceAmt
      const t1 = await stepUpAction('capture_escrow', supToken)
      await request(app.getHttpServer())
        .post('/api/v1/payments/escrow')
        .set('Authorization', `Bearer ${supToken}`)
        .set('x-action-token', t1)
        .send({ tripId: execTripId, amount: advanceAmt, stage: 'advance' })
        .expect(201)
      const t2 = await stepUpAction('capture_escrow', supToken)
      await request(app.getHttpServer())
        .post('/api/v1/payments/escrow')
        .set('Authorization', `Bearer ${supToken}`)
        .set('x-action-token', t2)
        .send({ tripId: execTripId, amount: balanceAmt, stage: 'balance' })
        .expect(201)
      const again = await request(app.getHttpServer())
        .post('/api/v1/payments/escrow')
        .set('Authorization', `Bearer ${supToken}`)
        .set('x-action-token', t1)
        .send({ tripId: execTripId, amount: 9999, stage: 'advance' })
        .expect(201)
      expect(again.body.alreadyCaptured).toBe(true)
      expect(again.body.payment.amount).toBe(advanceAmt)
    })

    it('blocks delivery until delivery OTP verified, then delivers', async () => {
      await request(app.getHttpServer()).post(`/api/v1/trips/${execTripId}/advance`).set('Authorization', `Bearer ${trToken}`).expect(201)
      await request(app.getHttpServer()).post(`/api/v1/trips/${execTripId}/advance`).set('Authorization', `Bearer ${trToken}`).expect(201)
      await request(app.getHttpServer()).post(`/api/v1/trips/${execTripId}/advance`).set('Authorization', `Bearer ${trToken}`).expect(400)

      const otpRes = await request(app.getHttpServer())
        .post(`/api/v1/trips/${execTripId}/otp/delivery`)
        .set('Authorization', `Bearer ${trToken}`)
        .expect(201)
      await request(app.getHttpServer())
        .post(`/api/v1/trips/${execTripId}/otp/delivery/verify`)
        .set('Authorization', `Bearer ${supToken}`)
        .send({ code: otpRes.body.devCode })
        .expect(201)
      const res = await request(app.getHttpServer()).post(`/api/v1/trips/${execTripId}/advance`).set('Authorization', `Bearer ${trToken}`).expect(201)
      expect(res.body.trip.stage).toBe('delivered')
      expect(res.body.trip.status).toBe('delivered')
    })

    it('returns return-load discovery', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/loads/return/${execTripId}`)
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(typeof res.body.fromCity).toBe('string')
      expect(Array.isArray(res.body.returnLoads)).toBe(true)
    })
  })

  describe('load management, trust & disputes', () => {
    let mgmtLoadId: string

    beforeAll(async () => {
      const ref = await request(app.getHttpServer()).get('/api/v1/reference').expect(200)
      const model = ref.body.models[0]
      const material = ref.body.materials[0]
      const res = await request(app.getHttpServer())
        .post('/api/v1/loads')
        .set('Authorization', `Bearer ${supToken}`)
        .send({
          pickupAddr: 'Mgmt City', dropAddr: 'Mgmt Drop',
          pickupLat: 17.4, pickupLng: 78.5, dropLat: 13.1, dropLng: 80.3,
          date: '2026-09-25T08:00:00Z', truckType: model.type, modelId: model.id,
          weight: 20, distanceKm: 100, materialId: material.id,
        })
        .expect(201)
      mgmtLoadId = res.body.load.id
    })

    it('pauses and reopens a load', async () => {
      const paused = await request(app.getHttpServer())
        .patch(`/api/v1/loads/${mgmtLoadId}/pause`)
        .set('Authorization', `Bearer ${supToken}`)
        .expect(200)
      expect(paused.body.load.status).toBe('paused')

      const reopened = await request(app.getHttpServer())
        .patch(`/api/v1/loads/${mgmtLoadId}/reopen`)
        .set('Authorization', `Bearer ${supToken}`)
        .expect(200)
      expect(reopened.body.load.status).toBe('posted')
    })

    it('cancels a load with a reason', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/loads/${mgmtLoadId}/cancel`)
        .set('Authorization', `Bearer ${supToken}`)
        .send({ reason: 'Test cancellation' })
        .expect(200)
      expect(res.body.load.status).toBe('cancelled')
      expect(res.body.load.cancelReason).toBe('Test cancellation')
    })

    it('reports and blocks a user', async () => {
      const supProfile = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${supToken}`)
        .expect(200)
      const supId = supProfile.body.profile.id

      const report = await request(app.getHttpServer())
        .post('/api/v1/trust/report')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ reportedId: supId, reason: 'Test report' })
        .expect(201)
      expect(report.body.report.status).toBe('open')

      const block = await request(app.getHttpServer())
        .post('/api/v1/trust/block')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ blockedId: supId })
        .expect(201)
      expect(block.body.block).toBeTruthy()
    })

    it('raises a dispute with evidence', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/disputes')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ tripId, subject: 'Evidence dispute', evidenceKeys: ['evidence-1.jpg', 'evidence-2.jpg'] })
        .expect(201)
      expect(res.body.evidenceKeys).toContain('evidence-1.jpg')
    })
  })

  describe('admin & rbac', () => {
    it('admin dashboard returns metrics', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${admToken}`)
        .expect(200)
      expect(typeof res.body.loadsThisWeek).toBe('number')
      expect(Array.isArray(res.body.weeklyTrend)).toBe(true)
      expect(Array.isArray(res.body.statusBreakdown)).toBe(true)
    })

    it('admin returns user KYC documents with signed URLs', async () => {
      // The seeded supplier has a PAN doc uploaded in earlier tests.
      const users = await request(app.getHttpServer())
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${admToken}`)
        .expect(200)
      const someUser = users.body.users[0]
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/users/${someUser.id}/kyc`)
        .set('Authorization', `Bearer ${admToken}`)
        .expect(200)
      expect(Array.isArray(res.body.docs)).toBe(true)
    })

    it('denies non-admin access to admin endpoints', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(403)
    })

    it('admin resolves a dispute and logs an audit entry', async () => {
      const raised = await request(app.getHttpServer())
        .post('/api/v1/disputes')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ tripId, subject: 'E2E dispute' })
        .expect(201)

      await request(app.getHttpServer())
        .patch(`/api/v1/disputes/${raised.body.id}/resolve`)
        .set('Authorization', `Bearer ${admToken}`)
        .send({ resolution: 'Resolved in e2e' })
        .expect(200)

      const audit = await request(app.getHttpServer())
        .get('/api/v1/admin/audit')
        .set('Authorization', `Bearer ${admToken}`)
        .expect(200)
      expect(audit.body.items.some((a: { action: string }) => a.action === 'dispute.resolve')).toBe(true)
    })
  })

  describe('driver experience', () => {
    let drvToken: string
    let drvUserId: string
    const DRV = '9000099999'

    it('authenticates the driver created by the transporter and sets role', async () => {
      const code = await requestOtp(DRV)
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/verify')
        .send({ mobile: DRV, code })
        .expect(201)
      drvToken = res.body.accessToken
      drvUserId = res.body.profile.id

      await request(app.getHttpServer())
        .patch('/api/v1/auth/role')
        .set('Authorization', `Bearer ${drvToken}`)
        .send({ role: 'driver' })
        .expect(200)
    })

    it('returns driver home with availability and today trips', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/driver/home')
        .set('Authorization', `Bearer ${drvToken}`)
        .expect(200)
      expect(typeof res.body.available).toBe('boolean')
      expect(Array.isArray(res.body.todayTrips)).toBe(true)
    })

    it('toggles driver availability', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/driver/availability')
        .set('Authorization', `Bearer ${drvToken}`)
        .send({ available: false })
        .expect(200)
      expect(res.body.available).toBe(false)
    })

    it('returns driver trips and earnings', async () => {
      const trips = await request(app.getHttpServer())
        .get('/api/v1/driver/trips')
        .set('Authorization', `Bearer ${drvToken}`)
        .expect(200)
      expect(Array.isArray(trips.body.trips)).toBe(true)

      const earnings = await request(app.getHttpServer())
        .get('/api/v1/driver/earnings')
        .set('Authorization', `Bearer ${drvToken}`)
        .expect(200)
      expect(typeof earnings.body.earned).toBe('number')
    })

    it('captures driver bank and returns payout status', async () => {
      const bank = await request(app.getHttpServer())
        .patch('/api/v1/driver/bank')
        .set('Authorization', `Bearer ${drvToken}`)
        .send({ bankAccount: '123456789012', ifsc: 'HDFC0001234' })
        .expect(200)
      expect(bank.body.bankAdded).toBe(true)

      const status = await request(app.getHttpServer())
        .get('/api/v1/driver/payouts')
        .set('Authorization', `Bearer ${drvToken}`)
        .expect(200)
      expect(status.body.bankAdded).toBe(true)
      expect(typeof status.body.due).toBe('number')
      expect(typeof status.body.paid).toBe('number')
      expect(Array.isArray(status.body.trips)).toBe(true)
    })

    it('rejects an invalid driver bank account', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/driver/bank')
        .set('Authorization', `Bearer ${drvToken}`)
        .send({ bankAccount: 'abc', ifsc: 'bad' })
        .expect(400)
    })

    it('guards driver payout before delivery', async () => {
      // Driver has no delivered trips, so releasing a payout on a non-delivered
      // (or unknown) trip is rejected rather than silently paying.
      const trips = await request(app.getHttpServer())
        .get('/api/v1/driver/trips')
        .set('Authorization', `Bearer ${drvToken}`)
        .expect(200)
      const anyTrip = trips.body.trips[0]
      if (anyTrip) {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/driver/trips/${anyTrip.id}/payout`)
          .set('Authorization', `Bearer ${drvToken}`)
          .expect(400)
        expect(res.body.message).toMatch(/delivered/i)
      }
    })

    it('returns a masked number for the driver', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/trust/masked-number')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ targetUserId: drvUserId })
        .expect(201)
      expect(res.body.maskedNumber).toMatch(/^91\d{8}$/)
    })

    it('rejects masked number for self', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/trust/masked-number')
        .set('Authorization', `Bearer ${drvToken}`)
        .send({ targetUserId: drvUserId })
        .expect(400)
    })
  })

  describe('invoices & load history', () => {
    it('returns a GST/TDS invoice for the delivered trip', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/payments/invoice/${tripId}`)
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      const inv = res.body.invoice
      expect(inv.invoiceNo).toMatch(/^INV-/)
      expect(inv.gstAmount).toBeGreaterThan(0)
      expect(inv.tdsAmount).toBeGreaterThan(0)
      expect(inv.netAmount).toBe(inv.baseAmount + inv.gstAmount - inv.tdsAmount)
    })

    it('returns supplier load history (completed/cancelled)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/loads/history/mine')
        .set('Authorization', `Bearer ${supToken}`)
        .expect(200)
      expect(Array.isArray(res.body.loads)).toBe(true)
      expect(res.body.loads.length).toBeGreaterThan(0)
    })

    it('broadcasts a notification to a role', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/broadcast')
        .set('Authorization', `Bearer ${admToken}`)
        .send({ role: 'supplier', title: 'Maintenance', body: 'Scheduled 23:00–23:30' })
        .expect(201)
      expect(res.body.sent).toBeGreaterThan(0)
    })
  })

  describe('bidding, negotiation & booking', () => {
    let bidId: string
    let offerId: string

    it('supplier posts an open-bidding load', async () => {
      const ref = await request(app.getHttpServer())
        .get('/api/v1/reference')
        .set('Authorization', `Bearer ${supToken}`)
        .expect(200)
      const model = ref.body.models.find((m: { type: string }) => m.type === 'open')
      const mat = ref.body.materials[0]
      const res = await request(app.getHttpServer())
        .post('/api/v1/loads')
        .set('Authorization', `Bearer ${supToken}`)
        .send({
          pickupAddr: 'Karimnagar, Telangana',
          dropAddr: 'Hyderabad, Telangana',
          pickupLat: 18.438,
          pickupLng: 79.129,
          dropLat: 17.385,
          dropLng: 78.487,
          date: new Date(Date.now() + 86400000).toISOString(),
          truckType: 'open',
          modelId: model.id,
          weight: 18,
          distanceKm: 180,
          materialId: mat.id,
          commercialModel: 'open_bidding',
          referenceRate: 3000,
          advancePct: 30,
          biddingDeadline: new Date(Date.now() + 86400000 * 2).toISOString(),
        })
        .expect(201)
      expect(res.body.load.commercialModel).toBe('open_bidding')
      loadId = res.body.load.id
    })

    it('blocks a supplier from bidding on their own load (self-deal guard)', async () => {
      // Give the supplier transporter capability + profile so they could act on the other side.
      await request(app.getHttpServer())
        .patch('/api/v1/auth/capabilities')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ capabilities: ['supplier', 'transporter'] })
        .expect(200)
      await request(app.getHttpServer())
        .post('/api/v1/onboarding/transporter')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ companyName: 'Wagon Demo', pan: 'ABCDE1234F', fleetSize: 1 })
        .expect(201)

      const res = await request(app.getHttpServer())
        .post('/api/v1/bidding/bid')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ loadId, amount: 40000, advanceAmount: 12000, balanceAmount: 28000 })
        .expect(400)
      expect(res.body.message).toMatch(/own load/i)
    })

    it('transporter submits a structured bid', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/bidding/bid')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ loadId, amount: 40000, advanceAmount: 12000, balanceAmount: 28000, pickupBy: '2026-08-10T08:00:00Z', etaHours: 6, validityHours: 24 })
        .expect(201)
      bidId = res.body.bid.id
      expect(res.body.bid.amount).toBe(40000)
      expect(res.body.bid.balanceAmount).toBe(28000)
    })

    it('supplier sees the decision room with aggregated bids', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/bidding/load/${loadId}/decision-room`)
        .set('Authorization', `Bearer ${supToken}`)
        .expect(200)
      expect(res.body.summary.totalBids).toBe(1)
      expect(res.body.summary.bestPrice).toBe(40000)
      expect(res.body.bids[0].score).toBeGreaterThan(0)
    })

    it('supplier shortlists the bid', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/bidding/bid/${bidId}/shortlist`)
        .set('Authorization', `Bearer ${supToken}`)
        .expect(201)
      expect(res.body.bid.status).toBe('shortlisted')
    })

    it('supplier counters the bid', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/bidding/bid/${bidId}/counter`)
        .set('Authorization', `Bearer ${supToken}`)
        .send({ amount: 38500 })
        .expect(201)
      offerId = res.body.offer.id
      expect(res.body.offer.fromRole).toBe('supplier')
    })

    it('transporter re-counters', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/bidding/offer/${offerId}/respond`)
        .set('Authorization', `Bearer ${trToken}`)
        .send({ action: 'counter', amount: 39000 })
        .expect(201)
      expect(res.body.counter.fromRole).toBe('transporter')
      offerId = res.body.counter.id
    })

    it('supplier accepts the counteroffer', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/bidding/offer/${offerId}/respond`)
        .set('Authorization', `Bearer ${supToken}`)
        .send({ action: 'accept' })
        .expect(201)
      expect(res.body.offer.status).toBe('accepted')
    })

    it('supplier proposes the booking, awaiting transporter confirmation', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/bidding/load/${loadId}/confirm`)
        .set('Authorization', `Bearer ${supToken}`)
        .send({ bidId })
        .expect(201)
      expect(res.body.status).toBe('awaiting_transporter_confirmation')
    })

    it('transporter confirms and creates the immutable snapshot', async () => {
      const actionToken = await stepUpAction('confirm_booking', trToken)
      const res = await request(app.getHttpServer())
        .post(`/api/v1/bidding/load/${loadId}/confirm/transporter`)
        .set('Authorization', `Bearer ${trToken}`)
        .set('x-action-token', actionToken)
        .send({ bidId })
        .expect(201)
      expect(res.body.trip.id).toBeTruthy()
      expect(res.body.snapshot.rate).toBe(39000)

      const tripRes = await request(app.getHttpServer())
        .get(`/api/v1/bidding/trip/${res.body.trip.id}/booking`)
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(tripRes.body.snapshot.supplierConfirmed).toBe(true)
      expect(tripRes.body.snapshot.transporterConfirmed).toBe(true)
      expect(tripRes.body.snapshot.rate).toBe(39000)
    })
  })

  describe('negotiation timeline & exceptions', () => {
    let excTripId: string
    let excId: string

    it('returns the negotiation timeline with offers', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/bidding/load/${loadId}/timeline`)
        .set('Authorization', `Bearer ${supToken}`)
        .expect(200)
      expect(Array.isArray(res.body.offers)).toBe(true)
      expect(res.body.offers.length).toBeGreaterThanOrEqual(2)
    })

    it('transporter rates the supplier after delivery', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/bidding/trip/${tripId}/rate-supplier`)
        .set('Authorization', `Bearer ${trToken}`)
        .send({ score: 5, review: 'Great loading support' })
        .expect(201)
      expect(res.body.trip.supplierRating).toBe(5)
    })

    it('reports a breakdown exception on the delivered trip', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/exceptions/trip/${tripId}`)
        .set('Authorization', `Bearer ${trToken}`)
        .send({ kind: 'breakdown', title: 'Tyre burst', notes: 'Replacing at roadside', photos: ['mock://tyre.jpg'] })
        .expect(201)
      excId = res.body.exception.id
      expect(res.body.exception.kind).toBe('breakdown')
    })

    it('lists exceptions for the trip', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/exceptions/trip/${tripId}`)
        .set('Authorization', `Bearer ${supToken}`)
        .expect(200)
      expect(res.body.exceptions.length).toBeGreaterThanOrEqual(1)
    })

    it('resolves the exception', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/exceptions/${excId}/resolve`)
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(res.body.exception.status).toBe('resolved')
    })
  })

  describe('favorites, searches & bank', () => {
    it('saves and lists a favorite load', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/favorites/load/${loadId}`)
        .set('Authorization', `Bearer ${trToken}`)
        .expect(201)
      const res = await request(app.getHttpServer())
        .get('/api/v1/favorites')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(res.body.favorites.length).toBeGreaterThanOrEqual(1)
    })

    it('saves and lists a search', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/favorites/search')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ name: 'HYD → BLR', query: { truckType: 'container' } })
        .expect(201)
      const res = await request(app.getHttpServer())
        .get('/api/v1/favorites/searches')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(res.body.searches.length).toBeGreaterThanOrEqual(1)
    })

    it('saves and reads bank details', async () => {
      const bankToken = await stepUpAction('update_bank', trToken)
      await request(app.getHttpServer())
        .patch('/api/v1/auth/bank')
        .set('Authorization', `Bearer ${trToken}`)
        .set('x-action-token', bankToken)
        .send({ account: '1234567890', ifsc: 'SBIN0001234', holder: 'E2E Haulage' })
        .expect(200)
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/bank')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(res.body.bank.ifsc).toBe('SBIN0001234')
    })
  })

  describe('my bids & disputes', () => {
    it('lists my submitted bids with status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/bidding/mine')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(Array.isArray(res.body.bids)).toBe(true)
      expect(res.body.bids.length).toBeGreaterThanOrEqual(1)
      expect(res.body.bids.some((b: { status: string }) => b.status === 'accepted')).toBe(true)
    })

    it('raises a dispute with evidence', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/disputes')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ tripId, subject: 'Damaged goods', evidenceKeys: ['mock://damage.jpg'] })
        .expect(201)
      expect(res.body.subject).toBe('Damaged goods')
      expect(Array.isArray(res.body.evidenceKeys)).toBe(true)
    })

    it('lists my disputes', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/disputes/mine')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(Array.isArray(res.body.disputes)).toBe(true)
      expect(res.body.disputes.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('chat', () => {
    it('sends a trip message', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/chat/trip/${tripId}`)
        .set('Authorization', `Bearer ${trToken}`)
        .send({ body: 'Truck is 20 minutes away' })
        .expect(201)
      expect(res.body.message.body).toBe('Truck is 20 minutes away')
    })

    it('lists messages and threads', async () => {
      const msgs = await request(app.getHttpServer())
        .get(`/api/v1/chat/trip/${tripId}`)
        .set('Authorization', `Bearer ${supToken}`)
        .expect(200)
      expect(msgs.body.messages.length).toBeGreaterThanOrEqual(1)

      const threads = await request(app.getHttpServer())
        .get('/api/v1/chat/threads')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(Array.isArray(threads.body.threads)).toBe(true)
      expect(threads.body.threads.some((t: { tripId: string }) => t.tripId === tripId)).toBe(true)
    })
  })

  describe('admin enterprise controls', () => {
    it('blocks self-promotion to admin via /auth/role', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/auth/role')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ role: 'admin' })
        .expect(400)
    })

    it('admin suspends, activates, and changes a user role', async () => {
      const users = await request(app.getHttpServer())
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${admToken}`)
        .expect(200)
      const target = users.body.users[0]
      expect(target).toBeTruthy()

      await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${target.id}/suspend`)
        .set('Authorization', `Bearer ${admToken}`)
        .expect(201)
      await request(app.getHttpServer())
        .post(`/api/v1/admin/users/${target.id}/activate`)
        .set('Authorization', `Bearer ${admToken}`)
        .expect(201)
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${target.id}/role`)
        .set('Authorization', `Bearer ${admToken}`)
        .send({ role: 'supplier' })
        .expect(200)
    })

    it('admin lists payments and refunds one', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/payments')
        .set('Authorization', `Bearer ${admToken}`)
        .expect(200)
      expect(Array.isArray(res.body.payments)).toBe(true)

      const payment = res.body.payments.find((p: { type: string }) => p.type === 'escrow')
      if (payment) {
        const refund = await request(app.getHttpServer())
          .post(`/api/v1/admin/payments/${payment.id}/refund`)
          .set('Authorization', `Bearer ${admToken}`)
          .expect(201)
        expect(refund.body.refund.type).toBe('refund')
      }
    })

    it('admin actions a report (block)', async () => {
      const reports = await request(app.getHttpServer())
        .get('/api/v1/admin/reports')
        .set('Authorization', `Bearer ${admToken}`)
        .expect(200)
      if (reports.body.reports.length > 0) {
        const r = reports.body.reports[0]
        await request(app.getHttpServer())
          .post(`/api/v1/admin/reports/${r.id}/action`)
          .set('Authorization', `Bearer ${admToken}`)
          .send({ action: 'dismiss' })
          .expect(201)
      }
    })

    it('audits every admin mutation', async () => {
      const audit = await request(app.getHttpServer())
        .get('/api/v1/admin/audit')
        .set('Authorization', `Bearer ${admToken}`)
        .expect(200)
      const actions = audit.body.items.map((a: { action: string }) => a.action)
      expect(actions).toContain('user.activate')
      expect(actions).toContain('payment.refund')
    })

    it('returns broadcast history', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/broadcasts')
        .set('Authorization', `Bearer ${admToken}`)
        .expect(200)
      expect(Array.isArray(res.body.broadcasts)).toBe(true)
      const latest = res.body.broadcasts[0]
      expect(latest.title).toBeTruthy()
      expect(typeof latest.sentTo).toBe('number')
    })

    it('returns a load detail with bids, supplier & material', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/loads/${loadId}`)
        .set('Authorization', `Bearer ${admToken}`)
        .expect(200)
      expect(res.body.load.id).toBe(loadId)
      expect(Array.isArray(res.body.load.bids)).toBe(true)
      expect(res.body.load.material).toBeTruthy()
      expect(res.body.load.supplier).toBeTruthy()
    })

    it('returns a payment detail with trip & load info', async () => {
      const payments = await request(app.getHttpServer())
        .get('/api/v1/admin/payments')
        .set('Authorization', `Bearer ${admToken}`)
        .expect(200)
      const payment = payments.body.payments.find((p: { tripId: string }) => p.tripId === tripId)
      expect(payment).toBeTruthy()
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/payments/${payment.id}`)
        .set('Authorization', `Bearer ${admToken}`)
        .expect(200)
      expect(res.body.payment.id).toBe(payment.id)
      expect(res.body.payment.trip).toBeTruthy()
      expect(res.body.payment.trip.load).toBeTruthy()
    })
  })

  describe('search, per-truck matching & role-aware surfaces (recent work)', () => {
    let supOrgId: string
    let trOrgId: string
    let jaipurLoadId: string
    let jaipurFare: number
    let chennaiListingId: string
    let jaipurListingId: string
    let trRequestId: string

    beforeAll(async () => {
      const ref = await request(app.getHttpServer())
        .get('/api/v1/reference')
        .set('Authorization', `Bearer ${supToken}`)
        .expect(200)
      const model = ref.body.models.find((m: { type: string }) => m.type === 'container')
      const material = ref.body.materials[0]

      // Org memberships let the supplier/transporter post market supply/demand.
      const supOrg = await request(app.getHttpServer())
        .post('/api/v1/foundation/organizations')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ name: 'E2E Search Shipper', kind: 'shipper', countryCode: 'IN' })
        .expect(201)
      supOrgId = supOrg.body.organization.id
      const trOrg = await request(app.getHttpServer())
        .post('/api/v1/foundation/organizations')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ name: 'E2E Search Hauler', kind: 'transporter', countryCode: 'IN' })
        .expect(201)
      trOrgId = trOrg.body.organization.id

      // A deterministic load on a well-known lane for lane/price/sort + matching tests.
      const load = await request(app.getHttpServer())
        .post('/api/v1/loads')
        .set('Authorization', `Bearer ${supToken}`)
        .send({
          pickupAddr: 'Jaipur, Rajasthan', dropAddr: 'Delhi, India',
          pickupLat: 26.912, pickupLng: 75.787, dropLat: 28.613, dropLng: 77.209,
          date: '2026-10-05T08:00:00Z', truckType: 'container',
          modelId: model.id, weight: 32, distanceKm: 300, materialId: material.id,
        })
        .expect(201)
      jaipurLoadId = load.body.load.id
      jaipurFare = load.body.load.fareEstimate

      // Market supply: two live capacity listings at different prices/origins.
      const chennai = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ kind: 'truck_capacity', originRef: 'Chennai', destinationRef: 'Pune', city: 'Chennai', capacityAvailable: 25, capacityUnit: 't', price: 45000, description: 'SearchCaseE2E Chennai fleet' })
        .expect(201)
      chennaiListingId = chennai.body.listing.id
      const jaipur = await request(app.getHttpServer())
        .post('/api/v1/market/listings')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ kind: 'truck_capacity', originRef: 'Jaipur', destinationRef: 'Delhi', city: 'Jaipur', capacityAvailable: 40, capacityUnit: 't', price: 30000, description: 'Jaipur capacity' })
        .expect(201)
      jaipurListingId = jaipur.body.listing.id

      // Market demand from ANOTHER org, on the supplier's saved-search lane.
      const req = await request(app.getHttpServer())
        .post('/api/v1/market/requests')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ kind: 'transport', originRef: 'Jaipur', destinationRef: 'Delhi', city: 'Jaipur', budget: 50000, capacityNeeded: 20000, capacityUnit: 'kg', description: 'SearchCaseReqE2E' })
        .expect(201)
      trRequestId = req.body.request.id

      // Saved lane gives the supplier market context for relevance ranking.
      await request(app.getHttpServer())
        .post('/api/v1/favorites/search')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ name: 'Jaipur lane', query: { q: 'Jaipur' } })
        .expect(201)
    })

    afterAll(async () => {
      const prisma = app.get(PrismaService)
      // Remove this suite's orgs + everything attached so the enablement suite
      // starts from its own clean primary-org view.
      await prisma.marketListing.deleteMany({ where: { id: { in: [chennaiListingId, jaipurListingId] } } })
      await prisma.marketRequest.deleteMany({ where: { requesterOrgId: { in: [supOrgId, trOrgId] } } })
      await prisma.shipmentLeg.deleteMany({ where: { shipment: { ownerOrgId: { in: [supOrgId, trOrgId] } } } })
      await prisma.shipment.deleteMany({ where: { ownerOrgId: { in: [supOrgId, trOrgId] } } })
      await prisma.organizationMember.deleteMany({ where: { organizationId: { in: [supOrgId, trOrgId] } } })
      await prisma.organization.deleteMany({ where: { id: { in: [supOrgId, trOrgId] } } })
    })

    it('filters loads by drop lane (toLane) case-insensitively', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/loads?toLane=delhi')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(res.body.items.some((l: { id: string }) => l.id === jaipurLoadId)).toBe(true)
      expect(res.body.items.every((l: { dropAddr: string }) => /delhi/i.test(l.dropAddr))).toBe(true)
    })

    it('sorts loads by price (cheapest first)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/loads?sort=cheapest')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      const fares = res.body.items.map((l: { fareEstimate: number }) => l.fareEstimate)
      for (let i = 1; i < fares.length; i++) {
        expect(fares[i]!).toBeGreaterThanOrEqual(fares[i - 1]!)
      }
    })

    it('filters loads by fareEstimate price range', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/loads?minPrice=${jaipurFare - 1000}&maxPrice=${jaipurFare + 1000}`)
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(res.body.items.some((l: { id: string }) => l.id === jaipurLoadId)).toBe(true)
      expect(res.body.items.every((l: { fareEstimate: number }) => l.fareEstimate >= jaipurFare - 1000 && l.fareEstimate <= jaipurFare + 1000)).toBe(true)
    })

    it('enriches the transporter feed with per-truck match reasons', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/loads?q=Jaipur')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      const target = res.body.items.find((l: { id: string }) => l.id === jaipurLoadId)
      expect(target).toBeTruthy()
      expect(typeof target.matchScore).toBe('number')
      expect(Array.isArray(target.reasons)).toBe(true)
      expect(target.reasons.length).toBeGreaterThan(0)
      expect(target.reasons.some((r: string) => /fits this truck type/i.test(r))).toBe(true)
    })

    it('searches market listings case-insensitively and by description', async () => {
      const byCity = await request(app.getHttpServer())
        .get('/api/v1/market/listings?q=CHENNAI')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(byCity.body.listings.some((l: { id: string }) => l.id === chennaiListingId)).toBe(true)

      const byDesc = await request(app.getHttpServer())
        .get('/api/v1/market/listings?q=searchcasee2e')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(byDesc.body.listings.some((l: { id: string }) => l.id === chennaiListingId)).toBe(true)
    })

    it('sorts market listings by price (priciest first)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/market/listings?sort=priciest')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      const idx = (id: string) => res.body.listings.findIndex((l: { id: string }) => l.id === id)
      expect(idx(chennaiListingId)).toBeGreaterThan(-1)
      expect(idx(jaipurListingId)).toBeGreaterThan(-1)
      expect(idx(chennaiListingId)).toBeLessThan(idx(jaipurListingId))
    })

    it('filters market requests by budget, capacity and q', async () => {
      const byBudget = await request(app.getHttpServer())
        .get('/api/v1/market/requests?maxBudget=60000')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(byBudget.body.requests.some((r: { id: string }) => r.id === trRequestId)).toBe(true)
      expect(byBudget.body.requests.every((r: { budget: number | null }) => r.budget === null || r.budget <= 60000)).toBe(true)

      const byCapacity = await request(app.getHttpServer())
        .get('/api/v1/market/requests?minCapacity=10000')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(byCapacity.body.requests.some((r: { id: string }) => r.id === trRequestId)).toBe(true)

      const byQ = await request(app.getHttpServer())
        .get('/api/v1/market/requests?q=searchcasereqe2e')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(byQ.body.requests.some((r: { id: string }) => r.id === trRequestId)).toBe(true)
    })

    it('ranks for-you demand by saved-search lane relevance', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/market/for-you')
        .set('Authorization', `Bearer ${supToken}`)
        .expect(200)
      const demand = res.body.shipmentsForMe.find((r: { id: string }) => r.id === trRequestId)
      expect(demand).toBeTruthy()
      expect(demand.hitsKnownLane).toBe(true)
      expect(demand.relevance).toBeGreaterThanOrEqual(25)
    })

    it('exposes role-aware home blocks (driver / enablement / admin / transporter)', async () => {
      // Transporter: transporter block, never driver/admin blocks.
      const trHome = await request(app.getHttpServer())
        .get('/api/v1/home/summary')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(trHome.body.transporter).toBeTruthy()
      expect(trHome.body.driver).toBeUndefined()
      expect(trHome.body.admin).toBeUndefined()

      // Driver: the seeded driver user gets the driver block.
      const drvCode = await requestOtp('9000099999')
      const drvRes = await request(app.getHttpServer())
        .post('/api/v1/auth/verify')
        .send({ mobile: '9000099999', code: drvCode })
        .expect(201)
      const drvHome = await request(app.getHttpServer())
        .get('/api/v1/home/summary')
        .set('Authorization', `Bearer ${drvRes.body.accessToken}`)
        .expect(200)
      expect(drvHome.body.driver).toBeTruthy()
      expect(typeof drvHome.body.driver.available).toBe('boolean')

      // Enablement: adding a forwarder capability surfaces the enablement block.
      await request(app.getHttpServer())
        .patch('/api/v1/auth/capabilities')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ capabilities: ['supplier', 'forwarder'] })
        .expect(200)
      const supHome = await request(app.getHttpServer())
        .get('/api/v1/home/summary')
        .set('Authorization', `Bearer ${supToken}`)
        .expect(200)
      expect(supHome.body.enablement.capabilities).toContain('forwarder')
      expect(supHome.body.supplier).toBeTruthy()
      // Restore the combined capabilities for the gamification test below.
      await request(app.getHttpServer())
        .patch('/api/v1/auth/capabilities')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ capabilities: ['supplier', 'transporter'] })
        .expect(200)

      // Admin: platform KPI block only for admins.
      const admHome = await request(app.getHttpServer())
        .get('/api/v1/home/summary')
        .set('Authorization', `Bearer ${admToken}`)
        .expect(200)
      expect(admHome.body.admin).toBeTruthy()
    })

    it('derives gamification quests from capabilities, not just role', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/auth/capabilities')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ capabilities: ['supplier'] })
        .expect(200)
      const solo = await request(app.getHttpServer())
        .get('/api/v1/gamification')
        .set('Authorization', `Bearer ${supToken}`)
        .expect(200)
      const soloIds = solo.body.quests.map((q: { id: string }) => q.id)
      expect(soloIds).toContain('load') // supplier-only quest
      expect(soloIds).not.toContain('truck') // transporter-only quest

      await request(app.getHttpServer())
        .patch('/api/v1/auth/capabilities')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ capabilities: ['supplier', 'transporter'] })
        .expect(200)
      const both = await request(app.getHttpServer())
        .get('/api/v1/gamification')
        .set('Authorization', `Bearer ${supToken}`)
        .expect(200)
      const bothIds = both.body.quests.map((q: { id: string }) => q.id)
      expect(bothIds).toContain('load')
      expect(bothIds).toContain('truck')
    })

    it('exposes my received reviews with reviewer name (ratings/mine)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ratings/mine')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(Array.isArray(res.body.reviews)).toBe(true)
      expect(res.body.reviews.length).toBeGreaterThanOrEqual(1)
      const rated = res.body.reviews.find((r: { rating: number }) => r.rating === 5)
      expect(rated).toBeTruthy()
      expect(typeof rated.reviewerName).toBe('string')
      expect(rated.route).toContain('→')
    })
  })
})
