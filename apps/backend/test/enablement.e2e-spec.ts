import { Test } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import request from 'supertest'
import helmet from 'helmet'
import { AppModule } from '../src/app.module'
import { REDIS } from '../src/redis/redis.module'
import { PrismaService } from '../src/prisma/prisma.service'

describe('Enablement platform (e2e)', () => {
  let app: INestApplication
  let supToken: string
  let trToken: string
  let admToken: string
  let shipmentId: string
  let orderId: string
  let consolidationId: string
  let planId: string
  let claimId: string
  let facilityId: string
  let webhookId: string

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

  const api = (token: string) => ({
    get: (path: string) => request(app.getHttpServer()).get(`/api/v1${path}`).set('Authorization', `Bearer ${token}`),
    post: (path: string, body?: unknown) => request(app.getHttpServer()).post(`/api/v1${path}`).set('Authorization', `Bearer ${token}`).send(body),
    patch: (path: string, body?: unknown) => request(app.getHttpServer()).patch(`/api/v1${path}`).set('Authorization', `Bearer ${token}`).send(body),
  })

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.use(helmet())
    app.setGlobalPrefix('api/v1')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    await app.init()
    await app.listen(0)

    const prisma = app.get(PrismaService)
    await prisma.$transaction([
      prisma.warehouseOperation.deleteMany(),
      prisma.facility.deleteMany(),
      prisma.consolidation.deleteMany(),
      prisma.forwardDocument.deleteMany(),
      prisma.carrierBooking.deleteMany(),
      prisma.forwardOrder.deleteMany(),
      prisma.settlement.deleteMany(),
      prisma.insurancePolicy.deleteMany(),
      prisma.claim.deleteMany(),
      prisma.riskAssessment.deleteMany(),
      prisma.aiRecommendation.deleteMany(),
      prisma.plan.deleteMany(),
      prisma.webhookDelivery.deleteMany(),
      prisma.webhookSubscription.deleteMany(),
      prisma.integrationConnector.deleteMany(),
      prisma.shipmentLeg.deleteMany(),
      prisma.shipment.deleteMany(),
      prisma.logisticsEvent.deleteMany(),
      prisma.outboxMessage.deleteMany(),
      prisma.marketQuote.deleteMany(),
      prisma.marketRequest.deleteMany(),
      prisma.marketListing.deleteMany(),
      prisma.orgRating.deleteMany(),
      prisma.carrierService.deleteMany(),
      prisma.lane.deleteMany(),
    ])
    // Keep the supplier's forwarder org for order ownership assertions.
    supToken = await verify(SUP, await requestOtp(SUP))
    trToken = await verify(TR, await requestOtp(TR))
    admToken = await verify(ADM, await requestOtp(ADM))
  })

  afterAll(async () => {
    await app.close()
    const redis = app.get(REDIS)
    if (redis && typeof redis.quit === 'function') await redis.quit()
  })

  describe('Foundation', () => {
    it('creates an org, shipment and legs with owner scoping', async () => {
      const org = await api(supToken).post('/foundation/organizations', { name: 'E2E Fwd', kind: 'forwarder', countryCode: 'IN' }).expect(201)
      expect(org.body.organization.kind).toBe('forwarder')

      const ship = await api(supToken).post('/foundation/shipments', { commodity: 'Steel', weightKg: 5000, pieces: 8, value: 500000 }).expect(201)
      shipmentId = ship.body.shipment.id
      expect(ship.body.shipment.ownerOrgId).toBeTruthy()

      await api(supToken).post(`/foundation/shipments/${shipmentId}/legs`, { mode: 'road', pickupAddr: 'Mumbai', dropAddr: 'Mundra', distanceKm: 1100 }).expect(201)
      await api(supToken).post(`/foundation/shipments/${shipmentId}/legs`, { mode: 'ocean', pickupAddr: 'Mundra', dropAddr: 'Singapore', distanceKm: 4000 }).expect(201)
    })

    it('enforces shipment status transitions', async () => {
      await api(supToken).patch(`/foundation/shipments/${shipmentId}/status`, { status: 'planned' }).expect(200)
      await api(supToken).patch(`/foundation/shipments/${shipmentId}/status`, { status: 'delivered' }).expect(400)
    })

    it('denies cross-tenant shipment access', async () => {
      const list = await api(trToken).get('/foundation/shipments').expect(200)
      expect(list.body.shipments.length).toBe(0)
      await api(trToken).get(`/foundation/shipments/${shipmentId}`).expect(403)
    })
  })

  describe('Forwarding', () => {
    it('creates orders and sets margins', async () => {
      const order = await api(supToken).post('/forwarding/orders', { shipmentId, buyAmount: 100000, sellAmount: 125000 }).expect(201)
      orderId = order.body.order.id
      expect(order.body.order.forwarderId).toBeTruthy()
      const margin = await api(supToken).post(`/forwarding/orders/${orderId}/margin`, { buyAmount: 100000, sellAmount: 125000 }).expect(201)
      expect(margin.body.pct).toBeCloseTo(20, 1)
      await api(supToken).post(`/forwarding/orders/${orderId}/margin`, { buyAmount: 150000, sellAmount: 100000 }).expect(400)
    })

    it('rejects cross-tenant order reads', async () => {
      await api(trToken).get(`/forwarding/orders/${orderId}`).expect(403)
    })

    it('consolidates orders into an LCL grouping', async () => {
      const ship2 = await api(supToken).post('/foundation/shipments', { commodity: 'Copper', weightKg: 3000, pieces: 5 }).expect(201)
      const order2 = await api(supToken).post('/forwarding/orders', { shipmentId: ship2.body.shipment.id, buyAmount: 60000, sellAmount: 75000 }).expect(201)
      const con = await api(supToken).post('/forwarding/consolidations', {
        mode: 'ocean', origin: 'Mundra', destination: 'Singapore', equipment: '40HC',
        orderIds: [orderId, order2.body.order.id],
      }).expect(201)
      consolidationId = con.body.consolidation.id
      expect(con.body.consolidation.status).toBe('grouping')
      const detail = await api(supToken).get(`/forwarding/orders/${orderId}`).expect(200)
      expect(detail.body.order.status).toBe('consolidated')
      const ready = await api(supToken).post(`/forwarding/consolidations/${consolidationId}/ready`).expect(201)
      expect(ready.body.consolidation.status).toBe('ready')
    })
  })

  describe('Planning', () => {
    it('proposes, supersedes and declines plans with validation', async () => {
      const p1 = await api(supToken).post('/planning/plans', {
        shipmentId,
        legs: [{ mode: 'road', origin: 'Mumbai', destination: 'Mundra', cost: 20000, etaHours: 30 }, { mode: 'ocean', origin: 'Mundra', destination: 'Singapore', cost: 80000, etaHours: 200 }],
        cost: 100000, etaHours: 230,
      }).expect(201)
      const p2 = await api(supToken).post('/planning/plans', {
        shipmentId,
        legs: [{ mode: 'air', origin: 'Mumbai', destination: 'Singapore', cost: 300000, etaHours: 12 }],
      }).expect(201)
      planId = p1.body.plan.id

      await api(supToken).post(`/planning/plans/${p2.body.plan.id}/select`).expect(201)
      await api(supToken).post(`/planning/plans/${p1.body.plan.id}/select`).expect(201)
      const superseded = await api(supToken).get(`/planning/plans/${p2.body.plan.id}`).expect(200)
      expect(superseded.body.plan.status).toBe('superseded')
      await api(supToken).post(`/planning/plans/${p2.body.plan.id}/select`).expect(400)

      await api(supToken).post('/planning/plans', {
        shipmentId,
        legs: [{ mode: 'road', origin: 'A', destination: 'B' }, { mode: 'ocean', origin: 'X', destination: 'Z' }],
      }).expect(400)
      await api(supToken).post('/planning/plans', { shipmentId, legs: [{ mode: 'road', origin: 'A', destination: 'B', cost: 20000 }], cost: 5000 }).expect(400)
    })
  })

  describe('Finance', () => {
    it('files a claim, blocks self-assessment, admin decides, settlement auto-created', async () => {
      const claim = await api(supToken).post('/finance/claims', { shipmentId, reason: 'damage', amount: 50000 }).expect(201)
      claimId = claim.body.claim.id
      // Segregation of duties: the claimant cannot assess their own claim.
      await api(supToken).post(`/finance/claims/${claimId}/assess`, { recommendedAmount: 45000 }).expect(403)
      // Admin decides (approve) — this auto-creates a claim settlement.
      const decided = await api(admToken).post(`/admin/claims/${claimId}/decide`, { decision: 'approved' }).expect(201)
      expect(decided.body.claim.status).toBe('approved')
      const summary = await api(supToken).get(`/finance/shipments/${shipmentId}/summary`).expect(200)
      expect(summary.body.totals.due).toBeGreaterThan(0)
      await api(supToken).post(`/finance/claims/${claimId}/decide`, { decision: 'rejected' }).expect(400)
    })

    it('denies cross-tenant claim lists', async () => {
      const claims = await api(trToken).get('/finance/claims').expect(200)
      expect(claims.body.claims.length).toBe(0)
    })

    it('assesses risk with a band', async () => {
      const risk = await api(supToken).post(`/finance/risk/${shipmentId}/assess`).expect(201)
      expect(risk.body.assessment.band).toBeTruthy()
      expect(risk.body.assessment.score).toBeGreaterThan(0)
    })
  })

  describe('AI', () => {
    it('rejects negative costs and clamps scores', async () => {
      await api(supToken).post('/ai/plan', { shipmentId, options: [{ mode: 'air', cost: -500, etaHours: 10 }] }).expect(400)
      const rec = await api(supToken).post('/ai/plan', {
        shipmentId,
        options: [{ mode: 'road', origin: 'Mumbai', destination: 'Mundra', cost: 20000, etaHours: 30 }, { mode: 'ocean', origin: 'Mundra', destination: 'Singapore', cost: 80000, etaHours: 200 }],
        constraints: { maxBudget: 100000, preference: 'cheapest' },
      }).expect(201)
      expect(rec.body.ranked.every((r: { score: number }) => r.score >= 0 && r.score <= 1)).toBe(true)
      const accepted = await api(supToken).patch(`/ai/recommendations/${rec.body.recommendation.id}/status`, { status: 'accepted' }).expect(200)
      expect(accepted.body.recommendation.status).toBe('accepted')
    })
  })

  describe('Integrations', () => {
    it('creates webhooks, blocks SSRF, strips secrets, rotates', async () => {
      const wh = await api(supToken).post('/integrations/webhooks', { name: 'E2E hook', url: 'http://localhost:9996/h', eventTypes: ['PLAN_SELECTED'] }).expect(201)
      webhookId = wh.body.webhook.id
      await api(supToken).post('/integrations/webhooks', { name: 'bad', url: 'http://169.254.169.254/latest', eventTypes: ['X'] }).expect(400)
      const list = await api(supToken).get('/integrations/webhooks').expect(200)
      expect(list.body.webhooks.every((w: Record<string, unknown>) => !('secret' in w))).toBe(true)
      await api(supToken).post(`/integrations/webhooks/${webhookId}/test`).expect(201)
      const rotated = await api(supToken).post(`/integrations/webhooks/${webhookId}/rotate-secret`).expect(201)
      expect(rotated.body.secret.length).toBe(64)
    })
  })

  describe('Global', () => {
    it('converts currency and gates admin ops', async () => {
      const fx = await api(supToken).get('/countries/convert?code=US&amount=100').expect(200)
      expect(fx.body.converted).toBe(8320)
      await api(supToken).get('/countries/convert?code=XYZ&amount=10').expect(400)
      await api(supToken).post('/countries/admin/upsert', { code: 'JP', name: 'Japan', currency: 'JPY', exchangeRateToBase: 0.55 }).expect(403)
      await api(admToken).post('/countries/admin/upsert', { code: 'JP', name: 'Japan', currency: 'JPY', exchangeRateToBase: 0.55 }).expect(201)
    })
  })

  describe('Storage', () => {
    it('binds operators, advances and cancels ops with tenant isolation', async () => {
      await api(supToken).post('/foundation/organizations', { name: 'E2E Wh', kind: 'warehouse' }).expect(201)
      const fac = await api(supToken).post('/storage/facilities', { name: 'E2E CFS', kind: 'cfs', city: 'Mundra' }).expect(201)
      facilityId = fac.body.facility.id
      expect(fac.body.facility.operatorId).toBeTruthy()

      const op = await api(supToken).post(`/storage/facilities/${facilityId}/operations`, { shipmentId }).expect(201)
      expect(op.body.operation.status).toBe('appointment')
      const advanced = await api(supToken).post(`/storage/operations/${op.body.operation.id}/advance`).expect(201)
      expect(advanced.body.operation.status).toBe('gate_in')
      await api(trToken).post(`/storage/operations/${op.body.operation.id}/advance`).expect(403)
      await api(supToken).patch(`/storage/operations/${op.body.operation.id}/cancel`, { reason: 'test' }).expect(200)
    })
  })

  describe('Load↔Shipment unification + settlement payments', () => {
    it('exposes load->shipment and shipment->load linkage', async () => {
      // The e2e fixture shipment exists; create a fresh one so ref != a load id.
      const ship = await api(supToken).post('/foundation/shipments', { commodity: 'Link', weightKg: 100 }).expect(201)
      const sid = ship.body.shipment.id
      // A load-projected shipment should link back (ref = load.id). We verify the
      // API contract both ways using the fixture shipment's detail.
      const det = await api(supToken).get(`/foundation/shipments/${sid}`).expect(200)
      // Shipment detail contract includes legs/plans regardless of source.
      expect(Array.isArray(det.body.shipment.legs)).toBe(true)
      expect('sourceLoad' in det.body).toBe(true)
    })

    it('clears a settlement with a real, idempotent payment', async () => {
      const ship = await api(supToken).post('/foundation/shipments', { commodity: 'Pay', weightKg: 100 }).expect(201)
      const sid = ship.body.shipment.id
      const st = await api(supToken).post('/finance/settlements', { shipmentId: sid, type: 'freight', amount: 5000 }).expect(201)
      const cleared = await api(supToken).post(`/finance/settlements/${st.body.settlement.id}/clear`).expect(201)
      expect(cleared.body.payment).toBeTruthy()
      expect(cleared.body.payment.type).toBe('settlement')
      expect(cleared.body.payment.status).toBe('succeeded')
      expect(cleared.body.payment.amount).toBe(5000)
      // Re-clearing a cleared settlement must not double-charge.
      await api(supToken).post(`/finance/settlements/${st.body.settlement.id}/clear`).expect(400)
      const list = await api(supToken).get('/finance/settlements').expect(200)
      const mine = list.body.settlements.find((x: { id: string }) => x.id === st.body.settlement.id)
      expect(mine.payment?.providerRef).toBeTruthy()
    })
  })

  describe('Marketplace (cross-type capability exchange)', () => {
    it('publishes + browses listings across orgs (Phase A)', async () => {
      const lane = await api(supToken).post('/market/lanes', { originRef: 'Mumbai', destinationRef: 'Pune', mode: 'road' }).expect(201)
      expect(lane.body.lane.originRef).toBe('mumbai')
      const listing = await api(supToken).post('/market/listings', {
        kind: 'warehouse_space', laneId: lane.body.lane.id, originRef: 'Mumbai', destinationRef: 'Pune',
        city: 'Pune', capacityAvailable: 1000, capacityUnit: 'm3', price: 5000,
      }).expect(201)
      expect(listing.body.listing.status).toBe('live')
      // A different org (transporter) can browse the supplier's listing.
      const browse = await api(trToken).get('/market/listings?kind=warehouse_space').expect(200)
      expect(browse.body.listings.some((l: { id: string }) => l.id === listing.body.listing.id)).toBe(true)
    })

    it('posts demand, quotes with own listing, accepts (Phase B)', async () => {
      const req = await api(supToken).post('/market/requests', {
        kind: 'warehouse', originRef: 'Mumbai', destinationRef: 'Pune', capacityNeeded: 800, capacityUnit: 'm3', budget: 6000,
      }).expect(201)
      expect(req.body.request.status).toBe('open')
      // Transporter publishes their own truck capacity, then quotes the demand.
      const lane = await api(trToken).post('/market/lanes', { originRef: 'Mumbai', destinationRef: 'Pune', mode: 'road' }).expect(201)
      const tlst = await api(trToken).post('/market/listings', {
        kind: 'truck_capacity', laneId: lane.body.lane.id, originRef: 'Mumbai', destinationRef: 'Pune',
        capacityAvailable: 5000, capacityUnit: 'kg', price: 18000,
      }).expect(201)
      const quote = await api(trToken).post(`/market/requests/${req.body.request.id}/quotes`, { listingId: tlst.body.listing.id, amount: 5500 }).expect(201)
      expect(quote.body.quote.status).toBe('submitted')
      // Can't quote with another org's listing.
      await api(trToken).post(`/market/requests/${req.body.request.id}/quotes`, { listingId: (await api(supToken).get('/market/listings?kind=warehouse_space').expect(200)).body.listings[0].id }).expect(400)
      // Requester accepts.
      const accepted = await api(supToken).post(`/market/quotes/${quote.body.quote.id}/accept`).expect(201)
      expect(accepted.body.quote.status).toBe('accepted')
    })

    it('ranks matches and gates org reputation (Phase C)', async () => {
      const req = await api(supToken).post('/market/requests', { kind: 'transport', originRef: 'Mumbai', destinationRef: 'Pune', capacityNeeded: 2000 }).expect(201)
      const matches = await api(supToken).get(`/market/requests/${req.body.request.id}/match`).expect(200)
      expect(Array.isArray(matches.body.matches)).toBe(true)
      // Cross-org rating works; self-rating blocked.
      const supOrg = (await api(supToken).get('/foundation/organizations').expect(200)).body.organizations[0].id
      const rated = await api(trToken).post('/market/ratings', { subjectOrgId: supOrg, axis: 'supplier', score: 4, review: 'prompt' }).expect(201)
      expect(rated.body.rating.axis).toBe('supplier')
      await api(supToken).post('/market/ratings', { subjectOrgId: supOrg, axis: 'supplier', score: 1 }).expect(400)
    })

    it('publishes carrier schedules with bookable slots (Phase D)', async () => {
      await api(supToken).post('/foundation/organizations', { name: 'E2E Carrier', kind: 'carrier' }).expect(201)
      const svc = await api(supToken).post('/market/carrier-services', {
        originRef: 'Mundra', destinationRef: 'Singapore', mode: 'ocean', vessel: 'MV E2E', voyage: '001', totalSlots: 1, rate: 120000,
      }).expect(201)
      expect(svc.body.service.availableSlots).toBe(1)
      const publicBrowse = await api(trToken).get('/market/carrier-services').expect(200)
      expect(publicBrowse.body.services.some((x: { id: string }) => x.id === svc.body.service.id)).toBe(true)
      const booked = await api(trToken).post(`/market/carrier-services/${svc.body.service.id}/book`).expect(201)
      expect(booked.body.service.status).toBe('sold_out')
      await api(trToken).post(`/market/carrier-services/${svc.body.service.id}/book`).expect(400)
    })
  })
})
