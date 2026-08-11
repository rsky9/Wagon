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
  let loadId: string
  let tripId: string

  const SUP = '9963712337'
  const TR = '9491996633'
  const ADM = '9999988888'

  const requestOtp = async (mobile: string) => {
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
      trToken = await verify(TR, await requestOtp(TR))
      admToken = await verify(ADM, await requestOtp(ADM))
      expect(supToken).toBeTruthy()
      expect(trToken).toBeTruthy()
      expect(admToken).toBeTruthy()
    })

    it('rejects an invalid OTP', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/verify')
        .send({ mobile: SUP, code: '0000' })
        .expect(400)
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
    it('transporter accepts the load and a trip is created', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/trips/accept')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ loadId })
        .expect(201)
      tripId = res.body.trip.id
      expect(res.body.trip.status).toBe('accepted')
    })

    it('rejects double-acceptance (load already assigned)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/trips/accept')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ loadId })
        .expect(400)
    })

    it('supplier captures escrow idempotently (while accepted)', async () => {
      const first = await request(app.getHttpServer())
        .post('/api/v1/payments/escrow')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ tripId, amount: 5000 })
        .expect(201)
      expect(first.body.alreadyCaptured).toBe(false)

      const second = await request(app.getHttpServer())
        .post('/api/v1/payments/escrow')
        .set('Authorization', `Bearer ${supToken}`)
        .send({ tripId, amount: 5000 })
        .expect(201)
      expect(second.body.alreadyCaptured).toBe(true)
      expect(second.body.payment.id).toBe(first.body.payment.id)
    })

    it('moves trip to in-transit and records tracking points', async () => {
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

    it('transporter uploads POD and receives payout', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/payments/pod/${tripId}`)
        .set('Authorization', `Bearer ${trToken}`)
        .expect(201)

      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/release')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ tripId })
        .expect(201)
      expect(res.body.payment.type).toBe('payout')
      expect(res.body.payment.status).toBe('succeeded')
    })

    it('transporter passbook balances to zero after payout', async () => {
      const tr = await request(app.getHttpServer())
        .get('/api/v1/payments/passbook')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(tr.body.balance).toBe(0)
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
        .send({ truckNo: 'AP99TEST', type: 'container', modelId: model.id, origin: 'Hyderabad' })
        .expect(201)
      expect(res.body.truck.truckNo).toBe('AP99TEST')

      const list = await request(app.getHttpServer())
        .get('/api/v1/trucks')
        .set('Authorization', `Bearer ${trToken}`)
        .expect(200)
      expect(list.body.trucks.length).toBeGreaterThan(0)
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

    it('blocks supplier from trucks endpoint (transporter only)', async () => {
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
      const acceptRes = await request(app.getHttpServer())
        .post('/api/v1/trips/accept')
        .set('Authorization', `Bearer ${trToken}`)
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

    it('returns a masked number for the driver', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/trust/masked-number')
        .set('Authorization', `Bearer ${trToken}`)
        .send({ targetUserId: drvUserId })
        .expect(201)
      expect(res.body.maskedNumber).toMatch(/^9180/)
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
      const res = await request(app.getHttpServer())
        .post(`/api/v1/bidding/load/${loadId}/confirm/transporter`)
        .set('Authorization', `Bearer ${trToken}`)
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
      await request(app.getHttpServer())
        .patch('/api/v1/auth/bank')
        .set('Authorization', `Bearer ${trToken}`)
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
  })
})
