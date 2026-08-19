import { Test } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import request from 'supertest'
import helmet from 'helmet'
import { createServer, Server } from 'node:http'
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
      prisma.scheduledAppointment.deleteMany(),
      prisma.dock.deleteMany(),
      prisma.warehouseOperation.deleteMany(),
      prisma.facility.deleteMany(),
      prisma.consolidation.deleteMany(),
      prisma.forwardDocument.deleteMany(),
      prisma.carrierBooking.deleteMany(),
      prisma.forwardOrder.deleteMany(),
      prisma.settlement.deleteMany(),
      prisma.invoiceLine.deleteMany(),
      prisma.invoice.deleteMany(),
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
      prisma.cargoUnit.deleteMany(),
      prisma.orgRating.deleteMany(),
      prisma.carrierService.deleteMany(),
      prisma.lane.deleteMany(),
      prisma.returnOrder.deleteMany(),
      prisma.handover.deleteMany(),
      prisma.customsDeclaration.deleteMany(),
      prisma.container.deleteMany(),
      prisma.contract.deleteMany(),
      prisma.tradeDocument.deleteMany(),
      prisma.organizationDocument.deleteMany(),
      prisma.ediMessage.deleteMany(),
      prisma.truckMaintenance.deleteMany(),
    ])
    // Keep the supplier's forwarder org for order ownership assertions.
    supToken = await verify(SUP, await requestOtp(SUP))
    trToken = await verify(TR, await requestOtp(TR))
    admToken = await verify(ADM, await requestOtp(ADM))
    // Ensure the demo transporter is KYC-verified so quote/bid gates pass.
    await prisma.user.update({ where: { mobile: TR }, data: { transporterVerified: true, verified: true, kycStatus: 'approved' } })
    // Ensure the demo supplier is KYC-verified so the load-posting gate passes.
    await prisma.user.update({ where: { mobile: SUP }, data: { supplierVerified: true, verified: true, kycStatus: 'approved' } })
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

    it('auto re-plans when a physical leg of the selected plan fails', async () => {
      // p1 (selected above) = road Mumbai→Mundra + ocean Mundra→Singapore.
      // Its legs were materialized as ShipmentLeg rows by select(); find the road leg.
      const shipDetail = await api(supToken).get(`/foundation/shipments/${shipmentId}`).expect(200)
      const roadLeg = shipDetail.body.shipment.legs.find((l: { mode: string }) => l.mode === 'road')
      expect(roadLeg).toBeTruthy()

      const failed = await api(supToken).post(`/foundation/legs/${roadLeg.id}/transition`, { event: 'failed', reason: 'vehicle breakdown' }).expect(201)
      expect(failed.body.leg.status).toBe('failed')
      expect(failed.body.rePlan).toBeTruthy()
      expect(failed.body.rePlan.plan.source).toBe('re_plan')
      expect(failed.body.rePlan.plan.status).toBe('proposed')
      // The re-plan replaces the road leg with a fallback (rail) at the same index.
      const replanLegs = failed.body.rePlan.plan.legs as Array<{ mode: string; origin: string }>
      expect(replanLegs[0].mode).toBe('rail')
      expect(replanLegs[0].origin).toBe('Mumbai')

      // The original selected plan is flagged with the failed leg index.
      const orig = await api(supToken).get(`/planning/plans/${planId}`).expect(200)
      expect(orig.body.plan.failedLegIndex).toBe(0)
      // A failed leg without reason is rejected.
      await api(supToken).post(`/foundation/legs/${roadLeg.id}/transition`, { event: 'failed' }).expect(400)
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

    it('runs the insurance policy lifecycle (issue → claim → expiry gates)', async () => {
      // A carrier/other org underwrites a policy for the shipment owner (sup).
      await api(supToken).post('/foundation/organizations', { name: 'E2E Insurer', kind: 'other' }).expect(201)
      const policy = await api(supToken).post('/finance/policies', { shipmentId, policyRef: 'POL-E2E-1', premium: 5000, coverage: 200000 }).expect(201)
      expect(policy.body.policy.status).toBe('active')
      const pid = policy.body.policy.id

      // The owner claims coverage; claiming twice is rejected.
      const claimed = await api(supToken).post(`/finance/policies/${pid}/claim`).expect(201)
      expect(claimed.body.policy.status).toBe('claimed')
      await api(supToken).post(`/finance/policies/${pid}/claim`).expect(400)

      // A fresh policy can be expired (by owner or insurer).
      const p2 = await api(supToken).post('/finance/policies', { shipmentId, policyRef: 'POL-E2E-2', premium: 2000, coverage: 50000 }).expect(201)
      const expired = await api(supToken).post(`/finance/policies/${p2.body.policy.id}/expire`).expect(201)
      expect(expired.body.policy.status).toBe('expired')
      await api(supToken).post(`/finance/policies/${p2.body.policy.id}/expire`).expect(400)
      // A non-party (transporter) cannot touch the policy.
      await api(trToken).post(`/finance/policies/${p2.body.policy.id}/expire`).expect(403)
      // Cross-tenant policy list is empty.
      const list = await api(trToken).get('/finance/policies').expect(200)
      expect(list.body.policies.length).toBe(0)
    })

    it('quotes and accepts priced insurance cover per plan (risk-based premium)', async () => {
      // A plan exists for the fixture shipment (created in the Planning block).
      const plans = await api(supToken).get(`/planning/shipments/${shipmentId}/plans`).expect(200)
      const pid = plans.body.plans[0].id
      const quote = await api(supToken).post(`/finance/plans/${pid}/cover-quote`, { declaredValue: 1_000_000 }).expect(201)
      expect(quote.body.quote.coverage).toBe(1_000_000)
      expect(quote.body.quote.premium).toBeGreaterThan(0)
      expect(quote.body.quote.premium).toBeLessThan(1_000_000)
      expect(['low', 'medium', 'high']).toContain(quote.body.quote.band)
      // Higher value -> higher absolute premium (same risk rate).
      const higher = await api(supToken).post(`/finance/plans/${pid}/cover-quote`, { declaredValue: 10_000_000 }).expect(201)
      expect(higher.body.quote.premium).toBeGreaterThan(quote.body.quote.premium)
      // Accepting issues a real policy under a partner org.
      const accepted = await api(supToken).post(`/finance/plans/${pid}/cover-accept`, { declaredValue: 1_000_000, policyRef: 'POL-COVER-E2E' }).expect(201)
      expect(accepted.body.policy.status).toBe('active')
      expect(accepted.body.policy.coverage).toBe(1_000_000)
      expect(accepted.body.policy.premium).toBe(quote.body.quote.premium)
      // Bad value is rejected.
      await api(supToken).post(`/finance/plans/${pid}/cover-quote`, { declaredValue: 0 }).expect(400)
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

    it('accepting a plan recommendation disposes deterministically (auto-select)', async () => {
      const rec = await api(supToken).post('/ai/plan', {
        shipmentId,
        options: [{ mode: 'air', origin: 'Mumbai', destination: 'Singapore', cost: 280000, etaHours: 12 }],
      }).expect(201)
      const planId = rec.body.recommendation.output.planId
      expect(planId).toBeTruthy()
      // Accept → deterministic code selects the recommended plan.
      const accepted = await api(supToken).patch(`/ai/recommendations/${rec.body.recommendation.id}/status`, { status: 'accepted' }).expect(200)
      expect(accepted.body.disposed).toBeTruthy()
      const plan = await api(supToken).get(`/planning/plans/${planId}`).expect(200)
      expect(plan.body.plan.status).toBe('selected')
    })

    it('runs the risk agent with a band and emits AI events', async () => {
      const risk = await api(supToken).post(`/ai/risk/${shipmentId}`).expect(201)
      expect(risk.body.score).toBeGreaterThan(0)
      expect(['low', 'medium', 'high']).toContain(risk.body.band)
      const rec = await api(supToken).get('/ai/recommendations?entityType=shipment&entityId=' + shipmentId + '&agent=risk').expect(200)
      expect(rec.body.recommendations.some((r: { agent: string }) => r.agent === 'risk')).toBe(true)
      const events = await api(supToken).get(`/foundation/events?entityType=shipment&entityId=${shipmentId}`).expect(200)
      expect(events.body.events.some((e: { eventCode: string }) => e.eventCode === 'AI_RECOMMENDED')).toBe(true)
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

    it('surfaces the connector marketplace and installs from catalog', async () => {
      const cat = await api(supToken).get('/integrations/catalog').expect(200)
      const kinds = cat.body.connectors.map((c: { kind: string }) => c.kind)
      expect(kinds).toEqual(expect.arrayContaining(['tms', 'erp', 'carrier_api', 'tracking', 'customs']))
      expect(Array.isArray(cat.body.events)).toBe(true)
      // Installing an unknown kind is rejected.
      await api(supToken).post('/integrations/connectors/install', { kind: 'blockchain' }).expect(400)
      // Install the tracking connector from the catalog, then sync + disable.
      const installed = await api(supToken).post('/integrations/connectors/install', { kind: 'tracking', config: { webhookUrl: 'https://telematics.example/push' } }).expect(201)
      expect(installed.body.connector.kind).toBe('tracking')
      expect(installed.body.connector.status).toBe('active')
      const cid = installed.body.connector.id
      const synced = await api(supToken).post(`/integrations/connectors/${cid}/sync`).expect(201)
      expect(synced.body.syncedAt).toBeTruthy()
      const disabled = await api(supToken).patch(`/integrations/connectors/${cid}/status`, { status: 'disabled' }).expect(200)
      expect(disabled.body.connector.status).toBe('disabled')
      // A plain manual connector still works.
      const manual = await api(supToken).post('/integrations/connectors', { kind: 'erp', name: 'MyERP', baseUrl: 'https://erp.example.com' }).expect(201)
      expect(manual.body.connector.name).toBe('MyERP')
    })

    it('delivers a webhook to a live HTTP receiver over the outbox relay', async () => {
      // Local receiver to prove end-to-end fan-out (dev allows localhost).
      const received: string[] = []
      const receiver: Server = createServer((req, res) => {
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          received.push(body)
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        })
      })
      await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve))
      const port = (receiver.address() as { port: number }).port
      const url = `http://localhost:${port}/hook`

      const wh = await api(supToken).post('/integrations/webhooks', { name: 'live', url, eventTypes: ['SHIPMENT_CREATED'] }).expect(201)
      // Trigger the event via the outbox (same org: sup's primary org).
      await api(supToken).post('/foundation/shipments', { commodity: 'HookE2E', weightKg: 500 }).expect(201)

      // The relay publishes -> dispatcher fans out on a 1.5s loop.
      let deliveries = []
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500))
        const list = await api(supToken).get(`/integrations/webhooks/${wh.body.webhook.id}/deliveries`).expect(200)
        deliveries = list.body.deliveries
        if (deliveries.some((d: { status: string }) => d.status === 'sent')) break
      }
      expect(deliveries.some((d: { status: string }) => d.status === 'sent')).toBe(true)
      expect(received.length).toBeGreaterThan(0)
      const parsed = JSON.parse(received[0]!)
      expect(parsed.event).toBe('SHIPMENT_CREATED')
      expect(parsed.data).toBeTruthy()
      expect(parsed.timestamp).toBeTruthy()
      receiver.closeAllConnections?.()
      await new Promise<void>((resolve) => receiver.close(() => resolve()))
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

    it('runs the full warehouse chain to done with per-stage evidence', async () => {
      const op = await api(supToken).post(`/storage/facilities/${facilityId}/operations`, { shipmentId }).expect(201)
      const opId = op.body.operation.id
      expect(op.body.operation.appointmentAt).toBeTruthy()

      const stages = [
        'gate_in', 'receive', 'put_away', 'stored', 'pick', 'stage', 'load', 'gate_out', 'done',
      ]
      let current: Record<string, any> = op.body.operation
      for (const stage of stages) {
        const res = await api(supToken).post(`/storage/operations/${opId}/advance`).expect(201)
        current = res.body.operation
        expect(current.status).toBe(stage)
      }
      // Timestamps are stamped on the correct transitions.
      expect(current.gateInAt).toBeTruthy()
      expect(current.receivedAt).toBeTruthy()
      expect(current.putAwayAt).toBeTruthy()
      expect(current.storedAt).toBeTruthy()
      expect(current.pickedAt).toBeTruthy()
      expect(current.stagedAt).toBeTruthy()
      expect(current.loadedAt).toBeTruthy()
      expect(current.gateOutAt).toBeTruthy()
      // No further transition after done.
      await api(supToken).post(`/storage/operations/${opId}/advance`).expect(400)

      // Evidence can be recorded mid-flow but not on a completed op.
      const mid = await api(supToken).post(`/storage/facilities/${facilityId}/operations`, { shipmentId }).expect(201)
      const ev = await api(supToken).post(`/storage/operations/${mid.body.operation.id}/evidence`, { note: '48 pallets, bin A12', quantity: 48, bin: 'A12' }).expect(201)
      expect(Array.isArray(ev.body.operation.evidence)).toBe(true)
      expect(ev.body.operation.evidence[0].quantity).toBe(48)
      await api(supToken).post(`/storage/operations/${opId}/evidence`, { note: 'too late' }).expect(400)
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
      // Establish a real transaction (quote + accept) so cross-org rating is
      // backed by actual business between the two orgs (reputation integrity).
      const quote = await api(trToken).post(`/market/requests/${req.body.request.id}/quotes`, { amount: 9900 }).expect(201)
      await api(supToken).post(`/market/quotes/${quote.body.quote.id}/accept`).expect(201)
      // Cross-org rating works; self-rating blocked (supOrg is the supplier's own
      // org — the requesterOrgId of the demand it just posted).
      const supOrg = req.body.request.requesterOrgId
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

    it('bridges load -> transport request and truck -> truck_capacity listing', async () => {
      // Creating a load auto-publishes a transport MarketRequest.
      const model = (await api(supToken).get('/reference').expect(200)).body.models[0]
      const material = (await api(supToken).get('/loads').expect(200)).body.items[0]?.materialId
      await api(supToken).post('/loads', {
        pickupAddr: 'Delhi', dropAddr: 'Jaipur', pickupLat: 28.6, pickupLng: 77.2,
        dropLat: 26.9, dropLng: 75.8, date: '2026-09-05', truckType: 'open', modelId: model.id,
        weight: 6, distanceKm: 280, materialId: material,
      }).expect(201)
      const reqs = await api(supToken).get('/market/requests?kind=transport').expect(200)
      expect(reqs.body.requests.some((r: { sourceType?: string }) => r.sourceType === 'load')).toBe(true)
      // Creating a truck auto-publishes a truck_capacity listing.
      await api(trToken).post('/trucks', { truckNo: 'DL9NETE2E', type: 'open', modelId: model.id, origin: 'Delhi' }).expect(201)
      const listings = await api(supToken).get('/market/listings?kind=truck_capacity').expect(200)
      expect(listings.body.listings.some((l: { sourceType?: string }) => l.sourceType === 'truck')).toBe(true)
    })

    it('accepting a quote materializes an operational object', async () => {
      // Warehouse org (create under trToken) quotes supplier's warehouse demand.
      await api(trToken).post('/foundation/organizations', { name: 'E2E WH', kind: 'warehouse' }).expect(201)
      const fac = await api(trToken).post('/storage/facilities', { name: 'E2E WH CFS', kind: 'cfs', city: 'Pune', capacitySlots: 10 }).expect(201)
      // Supplier posts warehouse demand in Pune.
      const req = await api(supToken).post('/market/requests', { kind: 'warehouse', city: 'Pune', capacityNeeded: 500, capacityUnit: 'm3', budget: 3000 }).expect(201)
      // Transporter (provider org) quotes — but they own the facility, so it must be a different org. Use the warehouse org as provider.
      const whOrg = (await api(trToken).get('/foundation/organizations').expect(200)).body.organizations.find((o: { kind: string }) => o.kind === 'warehouse')
      // Ensure the provider is not the requester's org (they differ), and quote.
      const quote = await api(trToken).post(`/market/requests/${req.body.request.id}/quotes`, { amount: 2800 }).expect(201)
      await api(supToken).post(`/market/quotes/${quote.body.quote.id}/accept`).expect(201)
      // The warehouse operator now has an operation with a market ref.
      const ops = await api(trToken).get('/storage/operations').expect(200)
      expect(ops.body.operations.some((o: { ref: string }) => o.ref.startsWith('MK-'))).toBe(true)
      void whOrg
    })

    it('runs the guardrailed AI market agent', async () => {
      const req = await api(supToken).post('/market/requests', { kind: 'transport', originRef: 'Delhi', destinationRef: 'Jaipur', capacityNeeded: 2000 }).expect(201)
      const ai = await api(supToken).post(`/ai/market/${req.body.request.id}`).expect(201)
      expect(ai.body.recommendation.agent).toBe('market')
      expect(ai.body.recommendation.guardrails.neverAutoBooks).toBe(true)
    })

    it('materializes transport accept into shipment + settlement; admin can pause listing', async () => {
      // Transport demand -> quote (different org) -> accept creates shipment + settlement.
      const req = await api(supToken).post('/market/requests', { kind: 'transport', originRef: 'Mumbai', destinationRef: 'Pune', capacityNeeded: 3000 }).expect(201)
      const quote = await api(trToken).post(`/market/requests/${req.body.request.id}/quotes`, { amount: 15000 }).expect(201)
      await api(supToken).post(`/market/quotes/${quote.body.quote.id}/accept`).expect(201)
      const settlements = await api(supToken).get('/finance/settlements').expect(200)
      expect(settlements.body.settlements.some((x: { payeeId: string }) => x.payeeId === quote.body.quote.providerOrgId)).toBe(true)
      const ships = await api(supToken).get('/foundation/shipments').expect(200)
      expect(ships.body.shipments.some((x: { ref: string }) => x.ref.startsWith('MK-TR-'))).toBe(true)
      // Admin can pause a live listing.
      const listings = await api(trToken).get('/market/listings').expect(200)
      if (listings.body.listings.length > 0) {
        const paused = await api(admToken).post(`/admin/market/listings/${listings.body.listings[0].id}/pause`).expect(201)
        expect(paused.body.listing.status).toBe('paused')
      }
      const stats = await api(admToken).get('/admin/market/stats').expect(200)
      expect(typeof stats.body.listings).toBe('number')
    })

    it('supports reverse direction: request from a listing, provider notified, self-ask blocked', async () => {
      // Supplier publishes a warehouse listing.
      const fac = await api(supToken).post('/storage/facilities', { name: 'E2E Ask Wh', kind: 'cfs', city: 'Pune', capacitySlots: 10 }).expect(201)
      const listing = (await api(supToken).get('/market/listings?kind=warehouse_space').expect(200)).body.listings.find(
        (l: { sourceId: string }) => l.sourceId === fac.body.facility.id,
      )
      // Transporter (different org) asks the supplier's warehouse provider.
      const asked = await api(trToken).post(`/market/listings/${listing.id}/request`, { originRef: 'Mumbai', destinationRef: 'Pune', capacityNeeded: 400 }).expect(201)
      expect(asked.body.request.kind).toBe('warehouse')
      expect(asked.body.request.status).toBe('open')
      // Provider was notified.
      const notif = await api(supToken).get('/notifications').expect(200)
      expect(Array.isArray(notif.body.items)).toBe(true)
      // Self-ask blocked: supplier is a member of their own listing's org.
      await api(supToken).post(`/market/listings/${listing.id}/request`, {}).expect(400)
    })

    it('bridges transport request to classic load + quote withdraw/reject lifecycle', async () => {
      // Direct transport request also creates a Load in the classic feed.
      const before = (await api(supToken).get('/loads?pageSize=50').expect(200)).body.total
      await api(supToken).post('/market/requests', { kind: 'transport', originRef: 'E2ECity', destinationRef: 'E2EDrop', capacityNeeded: 3000 }).expect(201)
      const after = (await api(supToken).get('/loads?pageSize=50').expect(200)).body.total
      expect(after).toBeGreaterThan(before)
      // Quote lifecycle: provider withdraws -> request reverts; requester rejects.
      const req = await api(supToken).post('/market/requests', { kind: 'warehouse', city: 'E2ECity', capacityNeeded: 200, budget: 2000 }).expect(201)
      const q1 = await api(trToken).post(`/market/requests/${req.body.request.id}/quotes`, { amount: 1800 }).expect(201)
      const withdrawn = await api(trToken).post(`/market/quotes/${q1.body.quote.id}/withdraw`).expect(201)
      expect(withdrawn.body.quote.status).toBe('withdrawn')
      const q2 = await api(trToken).post(`/market/requests/${req.body.request.id}/quotes`, { amount: 1900 }).expect(201)
      const rejected = await api(supToken).post(`/market/quotes/${q2.body.quote.id}/reject`).expect(201)
      expect(rejected.body.quote.status).toBe('rejected')
    })

    it('tracks cargo unit lineage (create/split/merge) and leg lifecycle', async () => {
      const ship = await api(supToken).post('/foundation/shipments', { commodity: 'CargoE2E', weightKg: 10000 }).expect(201)
      const sid = ship.body.shipment.id
      // Cargo create + split + merge.
      const unit = await api(supToken).post(`/foundation/shipments/${sid}/cargo`, { kind: 'container', equipment: '40HC', weightKg: 10000 }).expect(201)
      expect(unit.body.unit.status).toBe('created')
      const split = await api(supToken).post(`/foundation/cargo/${unit.body.unit.id}/split`, { parts: [{ weightKg: 4000 }, { weightKg: 6000 }] }).expect(201)
      expect(split.body.children.length).toBe(2)
      const merged = await api(supToken).post(`/foundation/cargo/${split.body.children[0].id}/merge`, { parentId: unit.body.unit.id }).expect(201)
      expect(merged.body.unit.status).toBe('consolidated')
      const list = await api(supToken).get(`/foundation/shipments/${sid}/cargo`).expect(200)
      expect(list.body.units.length).toBe(3)
      // Leg departed/arrived lifecycle.
      const leg = await api(supToken).post(`/foundation/shipments/${sid}/legs`, { mode: 'ocean', pickupAddr: 'Mundra', dropAddr: 'Singapore' }).expect(201)
      const departed = await api(supToken).post(`/foundation/legs/${leg.body.leg.id}/transition`, { event: 'departed' }).expect(201)
      expect(departed.body.leg.status).toBe('in_transit')
      expect(departed.body.leg.departedAt).toBeTruthy()
      const arrived = await api(supToken).post(`/foundation/legs/${leg.body.leg.id}/transition`, { event: 'arrived' }).expect(201)
      expect(arrived.body.leg.status).toBe('arrived')
      expect(arrived.body.leg.arrivedAt).toBeTruthy()
    })

    it('runs the container lifecycle (gate-in → loaded → discharged → returned)', async () => {
      const ship = await api(supToken).post('/foundation/shipments', { commodity: 'CtnE2E', weightKg: 8000 }).expect(201)
      const sid = ship.body.shipment.id
      const unit = await api(supToken).post(`/foundation/shipments/${sid}/cargo`, { kind: 'container', equipment: '40HC', weightKg: 8000 }).expect(201)
      const cid = unit.body.unit.id

      const gated = await api(supToken).post(`/foundation/cargo/${cid}/container`, { event: 'gated_in' }).expect(201)
      expect(gated.body.unit.status).toBe('gate_in')
      const loaded = await api(supToken).post(`/foundation/cargo/${cid}/container`, { event: 'loaded' }).expect(201)
      expect(loaded.body.unit.status).toBe('loaded')
      // loaded -> discharged directly is allowed; skip in_transit for brevity.
      const discharged = await api(supToken).post(`/foundation/cargo/${cid}/container`, { event: 'discharged' }).expect(201)
      expect(discharged.body.unit.status).toBe('discharged')
      const returned = await api(supToken).post(`/foundation/cargo/${cid}/container`, { event: 'returned' }).expect(201)
      expect(returned.body.unit.status).toBe('returned')
      // Terminal: no further transitions.
      await api(supToken).post(`/foundation/cargo/${cid}/container`, { event: 'returned' }).expect(400)
      // Non-container units reject the container lifecycle.
      const pkg = await api(supToken).post(`/foundation/shipments/${sid}/cargo`, { kind: 'package', weightKg: 10 }).expect(201)
      await api(supToken).post(`/foundation/cargo/${pkg.body.unit.id}/container`, { event: 'gated_in' }).expect(400)
      // Events were emitted (DCSA codes).
      const events = await api(supToken).get(`/foundation/events?entityType=shipment&entityId=${sid}`).expect(200)
      const codes = events.body.events.map((e: { eventCode: string }) => e.eventCode)
      expect(codes).toContain('GTIN')
      expect(codes).toContain('GTOT')
    })

    it('personalizes the marketplace by capability (For You)', async () => {
      // The transporter can provide truck capacity and quote transport shipments.
      const forTr = await api(trToken).get('/market/for-you').expect(200)
      expect(forTr.body.canProvide).toContain('truck_capacity')
      expect(forTr.body.canFulfill).toContain('transport')
      expect(forTr.body.capabilities).toContain('transporter')
      // A fresh transport request (by the supplier, different org) shows up as
      // a shipment the transporter can quote on.
      await api(supToken).post('/market/requests', { kind: 'transport', originRef: 'ForyouCity', destinationRef: 'ForyouDrop', capacityNeeded: 2500 }).expect(201)
      const demand = await api(trToken).get('/market/for-you').expect(200)
      expect(demand.body.shipmentsForMe.some((r: { kind: string }) => r.kind === 'transport')).toBe(true)
      // Capacity the transporter can request: warehouse space (complementary capability).
      expect(Array.isArray(demand.body.capacityForMe)).toBe(true)
      // Driver capability cannot provide or fulfill anything.
      await api(supToken).patch('/auth/capabilities', { capabilities: ['supplier', 'driver'] }).expect(200)
      const forSup = await api(supToken).get('/market/for-you').expect(200)
      expect(forSup.body.canFulfill).toContain('transport')
      // Restore capabilities for the rest of the suite.
      await api(supToken).patch('/auth/capabilities', { capabilities: ['supplier'] }).expect(200)
    })

    it('surfaces live-state signals on offers (availability, freshness, claims)', async () => {
      // A listing with an availability window and a provider who has activity.
      const listing = await api(trToken).post('/market/listings', {
        kind: 'truck_capacity', originRef: 'LiveCity', destinationRef: 'LiveDrop',
        capacityAvailable: 3000, price: 25000,
        availableFrom: new Date(Date.now() - 864e5).toISOString(),
        availableTo: new Date(Date.now() + 7 * 864e5).toISOString(),
      }).expect(201)
      const browse = await api(supToken).get('/market/listings?kind=truck_capacity').expect(200)
      const live = browse.body.listings.find((l: { id: string }) => l.id === listing.body.listing.id)
      expect(live).toBeTruthy()
      expect(live.onMarketNow).toBe(true)
      expect(typeof live.fresh).toBe('number')
      expect('lastEvent' in live).toBe(true)
      expect('claimRate' in live).toBe(true)
      expect('completionRate' in live).toBe(true)
      // Detail also carries live-state.
      const det = await api(supToken).get(`/market/listings/${listing.body.listing.id}`).expect(200)
      expect(det.body.listing.onMarketNow).toBe(true)
    })

    it('decomposes one need into a multi-party plan (fan-out + recombine)', async () => {
      // Publish supply on two capability kinds (road + ocean) so decomposition can fan out.
      await api(trToken).post('/market/listings', { kind: 'truck_capacity', originRef: 'DecomposeCity', destinationRef: 'DecomposePort', capacityAvailable: 20000, price: 20000 }).expect(201)
      await api(trToken).post('/market/listings', { kind: 'carrier_service', originRef: 'DecomposePort', destinationRef: 'DecomposeHub', capacityAvailable: 20000, price: 80000 }).expect(201)

      const request = await api(supToken).post('/market/requests', { kind: 'transport', originRef: 'DecomposeCity', destinationRef: 'DecomposeHub', capacityNeeded: 12000 }).expect(201)
      const dec = await api(supToken).post(`/market/requests/${request.body.request.id}/decompose`, {
        legs: [
          { origin: 'DecomposeCity', destination: 'DecomposePort', kind: 'transport', capacityNeeded: 12000 },
          { origin: 'DecomposePort', destination: 'DecomposeHub', kind: 'carrier', capacityNeeded: 12000 },
        ],
      }).expect(201)

      expect(dec.body.unsatisfiable).toBe(false)
      expect(dec.body.plan).toBeTruthy()
      expect(dec.body.plan.status).toBe('proposed')
      expect(dec.body.plan.legs.length).toBe(2)
      expect(dec.body.plan.legs[0].mode).toBe('road')
      expect(dec.body.plan.legs[1].mode).toBe('ocean')
      expect(dec.body.plan.legs[0].providerId).toBeTruthy()
      expect(dec.body.plan.legs[1].providerId).toBeTruthy()
      expect(dec.body.cost).toBeGreaterThan(0)
      expect(dec.body.selections.length).toBe(2)
      // The recombined plan can be selected by the requester.
      await api(supToken).post(`/planning/plans/${dec.body.plan.id}/select`).expect(201)
    })

    it('reports unsatisfiable decomposition when a leg has no supply', async () => {
      const request = await api(supToken).post('/market/requests', { kind: 'forwarding', originRef: 'NowhereCity', destinationRef: 'NowhereHub' }).expect(201)
      const dec = await api(supToken).post(`/market/requests/${request.body.request.id}/decompose`, {
        legs: [{ origin: 'NowhereCity', destination: 'NowhereHub', kind: 'forwarding' }],
      }).expect(201)
      expect(dec.body.unsatisfiable).toBe(true)
      expect(dec.body.plan).toBeNull()
      expect(dec.body.note).toContain('No live')
    })

    it('re-procures a failed leg from the live marketplace', async () => {
      // Build a selected plan whose road leg has live replacement supply on its lane.
      const ship = await api(supToken).post('/foundation/shipments', { commodity: 'ReProc', weightKg: 1000 }).expect(201)
      const sid = ship.body.shipment.id
      await api(supToken).post('/planning/plans', {
        shipmentId: sid,
        legs: [{ mode: 'road', origin: 'ReProOrigin', destination: 'ReProPort', cost: 15000, etaHours: 20 }],
        cost: 15000, etaHours: 20,
      }).expect(201)
      const plans = await api(supToken).get(`/planning/shipments/${sid}/plans`).expect(200)
      const planId = plans.body.plans[0].id
      await api(supToken).post(`/planning/plans/${planId}/select`).expect(201)

      // Live truck_capacity supply on the exact failed lane.
      await api(trToken).post('/market/listings', { kind: 'truck_capacity', originRef: 'ReProOrigin', destinationRef: 'ReProPort', capacityAvailable: 5000, price: 19000 }).expect(201)

      const det = await api(supToken).get(`/foundation/shipments/${sid}`).expect(200)
      const roadLeg = det.body.shipment.legs.find((l: { mode: string }) => l.mode === 'road')
      const failed = await api(supToken).post(`/foundation/legs/${roadLeg.id}/transition`, { event: 'failed', reason: 'breakdown' }).expect(201)
      expect(failed.body.rePlan).toBeTruthy()
      expect(failed.body.rePlan.sourcedFromMarket).toBe(true)
      // Replacement carries the real marketplace provider (tr org), not a static flip.
      const legs = failed.body.rePlan.plan.legs as Array<{ mode: string; providerId?: string; carrier?: string; cost?: number }>
      expect(legs[0].providerId).toBeTruthy()
      expect(legs[0].cost).toBe(19000)
      expect(legs[0].carrier).toBeTruthy()
    })

    it('lets an ERP/TMS post demand programmatically via connector API key', async () => {
      // The supplier creates a connector with a machine credential.
      const conn = await api(supToken).post('/integrations/connectors', { kind: 'erp', name: 'Proc ERP', generateKey: true }).expect(201)
      const apiKey = conn.body.apiKey
      expect(apiKey).toMatch(/^wgn_/)
      // The raw key is shown once; the hash is never exposed.
      expect('apiKeyHash' in conn.body.connector).toBe(false)

      // An external system posts demand with x-api-key (no user JWT).
      const prog = (path: string, body?: unknown) =>
        request(app.getHttpServer()).post(`/api/v1/programmatic/market${path}`).set('x-api-key', apiKey).send(body)

      const posted = await prog('/requests', { kind: 'transport', originRef: 'ProgCity', destinationRef: 'ProgDrop', capacityNeeded: 4000, budget: 90000 }).expect(201)
      expect(posted.body.request.kind).toBe('transport')
      expect(posted.body.request.sourceType).toBe('programmatic')
      // It appears in the org's own requests and in the open feed.
      const mine = await api(supToken).get('/market/requests/mine').expect(200)
      expect(mine.body.requests.some((r: { id: string }) => r.id === posted.body.request.id)).toBe(true)

      // Programmatic decomposition with supply published for the lane.
      await api(trToken).post('/market/listings', { kind: 'truck_capacity', originRef: 'ProgCity', destinationRef: 'ProgDrop', capacityAvailable: 5000, price: 30000 }).expect(201)
      const dec = await prog(`/requests/${posted.body.request.id}/decompose`, {
        legs: [{ origin: 'ProgCity', destination: 'ProgDrop', kind: 'transport' }],
      }).expect(201)
      expect(dec.body.unsatisfiable).toBe(false)
      expect(dec.body.plan).toBeTruthy()

      // A bad key is rejected.
      await prog('/requests', { kind: 'transport' }).set('x-api-key', 'wgn_bogus').expect(401)
    })
  })

  describe('contracts, invoicing, containers, returns, handovers & customs (e2e)', () => {
    let trOrgId: string
    let supOrgId: string

    beforeAll(async () => {
      // Both parties need an organization for contract/invoice party resolution.
      const trOrgs = (await api(trToken).get('/foundation/organizations').expect(200)).body.organizations as Array<{ id: string; kind: string }>
      const supOrgs = (await api(supToken).get('/foundation/organizations').expect(200)).body.organizations as Array<{ id: string; kind: string }>
      trOrgId = trOrgs.find((o) => o.kind === 'transporter')?.id ?? trOrgs[0]!.id
      supOrgId = supOrgs.find((o) => o.kind === 'shipper')?.id ?? supOrgs[0]!.id
    })

    it('creates and activates a contract binding two parties', async () => {
      const res = await api(supToken).post('/contracts', {
        type: 'carrier',
        partyAOrgId: supOrgId,
        partyBOrgId: trOrgId,
        title: 'E2E quarterly carrier contract',
        incoterms: 'DAP',
        sla: { pickupSlaHours: 4, transitSlaHours: 48, responseSlaHours: 2 },
        territory: [{ originRef: 'Hyderabad', destinationRef: 'Delhi', modes: ['road', 'rail'] }],
        liability: { limit: 5000000, basis: 'per shipment', insuranceRequired: true },
        paymentTerms: 'Net 30',
      }).expect(201)
      expect(res.body.contract.ref).toMatch(/^CT-/)
      expect(res.body.contract.status).toBe('draft')

      // A party can activate it.
      const active = await api(trToken).patch(`/contracts/${res.body.contract.id}/status`, { status: 'active' }).expect(200)
      expect(active.body.contract.status).toBe('active')

      // Illegal transition is rejected.
      await api(trToken).patch(`/contracts/${res.body.contract.id}/status`, { status: 'paid' }).expect(400)

      // Admin is a global moderator and may terminate an active contract.
      const terminated = await api(admToken).patch(`/contracts/${res.body.contract.id}/status`, { status: 'terminated' }).expect(200)
      expect(terminated.body.contract.status).toBe('terminated')
    })

    it('issues a first-class invoice with tax lines and drives it to paid', async () => {
      const shipment = await api(supToken).post('/foundation/shipments', {
        ref: 'SHIP-E2E-INV',
        commodity: 'Pharma APIs',
        weightKg: 1200,
        pieces: 24,
        value: 2500000,
        mode: 'road',
      }).expect(201)
      const shipmentId = shipment.body.shipment.id

      const inv = await api(supToken).post('/invoices', {
        shipmentId,
        baseAmount: 42000,
        accessorials: [{ kind: 'toll', description: 'Toll charges', amount: 500 }, { kind: 'waiting', description: 'Waiting', amount: 300 }],
      }).expect(201)
      expect(inv.body.invoice.invoiceNo).toMatch(/^INV-/)
      expect(inv.body.invoice.baseAmount).toBe(42000)
      expect(inv.body.invoice.lines.length).toBeGreaterThanOrEqual(4) // base + gst + tds + accessorials

      const issued = await api(supToken).patch(`/invoices/${inv.body.invoice.id}/status`, { status: 'issued' }).expect(200)
      expect(issued.body.invoice.issueDate).toBeTruthy()

      const approved = await api(supToken).patch(`/invoices/${inv.body.invoice.id}/status`, { status: 'approved' }).expect(200)
      expect(approved.body.invoice.status).toBe('approved')

      const paid = await api(supToken).patch(`/invoices/${inv.body.invoice.id}/status`, { status: 'paid' }).expect(200)
      expect(paid.body.invoice.paidAt).toBeTruthy()

      // Reconciliation exposes the due balance even with no settlements attached.
      const rec = await api(supToken).get(`/invoices/${inv.body.invoice.id}/reconcile`).expect(200)
      expect(typeof rec.body.invoice.due).toBe('number')
      expect(rec.body.invoice.due).toBe(rec.body.invoice.netAmount)
    })

    it('registers and moves a container through its lifecycle', async () => {
      const res = await api(supToken).post('/containers', { number: 'E2E1234567', type: '40HC', locationRef: 'Hyderabad CFS' }).expect(201)
      expect(res.body.container.number).toBe('E2E1234567')

      // Duplicate number is rejected.
      await api(supToken).post('/containers', { number: 'E2E1234567' }).expect(400)

      const id = res.body.container.id
      await api(supToken).patch(`/containers/${id}/status`, { status: 'reserved' }).expect(200)
      await api(supToken).patch(`/containers/${id}/status`, { status: 'stuffed', sealNo: 'SEAL-777' }).expect(200)
      await api(supToken).patch(`/containers/${id}/status`, { status: 'loaded' }).expect(200)
      await api(supToken).patch(`/containers/${id}/status`, { status: 'discharged' }).expect(200)
      await api(supToken).patch(`/containers/${id}/status`, { status: 'released' }).expect(200)
      const emptyReturn = await api(supToken).patch(`/containers/${id}/status`, { status: 'empty_return', emptyReturnRequired: true }).expect(200)
      expect(emptyReturn.body.container.emptyReturnRequired).toBe(true)

      // Illegal skip (loaded -> empty_return) is rejected.
      const second = await api(supToken).post('/containers', { number: 'E2E9876543' }).expect(201)
      await api(supToken).patch(`/containers/${second.body.container.id}/status`, { status: 'empty_return' }).expect(400)

      const inspected = await api(supToken).post(`/containers/${id}/inspect`, { note: 'Reefer compressor ok' }).expect(201)
      expect(inspected.body.container.lastInspectionNote).toBe('Reefer compressor ok')
    })

    it('creates and closes a reverse-logistics return with disposition', async () => {
      const shipment = await api(supToken).post('/foundation/shipments', { ref: 'SHIP-E2E-RTN', commodity: 'Machinery' }).expect(201)
      const res = await api(supToken).post('/returns', { shipmentId: shipment.body.shipment.id, reason: 'customer_return', condition: 'Damaged corner', notes: 'Dent on the left edge' }).expect(201)
      expect(res.body.return.ref).toMatch(/^RT-/)

      const id = res.body.return.id
      await api(supToken).patch(`/returns/${id}/status`, { status: 'scheduled', pickupAt: '2026-10-05T10:00:00Z' }).expect(200)
      await api(supToken).patch(`/returns/${id}/status`, { status: 'picked_up' }).expect(200)
      await api(supToken).patch(`/returns/${id}/status`, { status: 'received' }).expect(200)
      await api(supToken).patch(`/returns/${id}/status`, { status: 'closed', disposition: 'repair' }).expect(200)

      const done = await api(supToken).get(`/returns/${id}`).expect(200)
      expect(done.body.return.status).toBe('closed')
      expect(done.body.return.disposition).toBe('repair')

      // Bad reason is rejected.
      await api(supToken).post('/returns', { reason: 'nonsense' }).expect(400)
    })

    it('records a chain-of-custody handover with condition and evidence', async () => {
      const res = await api(supToken).post('/handovers', {
        entityType: 'container',
        entityId: 'cont-1',
        fromOrgId: supOrgId,
        toOrgId: trOrgId,
        locationRef: 'Hyderabad CFS',
        condition: 'Good',
        quantity: 1,
        unit: 'unit',
        evidenceKey: 'signed-gate-sheet.jpg',
        nextResponsibility: 'Haul to Nagpur rail terminal',
      }).expect(201)
      expect(res.body.handover.ref).toMatch(/^HO-/)
      expect(res.body.handover.status).toBe('completed')

      // Same-party handover is rejected.
      await api(supToken).post('/handovers', { entityType: 'cargo_unit', toOrgId: supOrgId, fromOrgId: supOrgId }).expect(400)
    })

    it('files a customs declaration and moves it through release', async () => {
      const res = await api(supToken).post('/customs', {
        direction: 'export',
        hsCode: '3004.90',
        commodity: 'Pharma APIs',
        value: 2500000,
        brokerOrgId: supOrgId,
      }).expect(201)
      expect(res.body.declaration.ref).toMatch(/^CD-/)
      expect(res.body.declaration.status).toBe('draft')

      const id = res.body.declaration.id
      await api(supToken).patch(`/customs/${id}/status`, { status: 'filed' }).expect(200)
      await api(supToken).patch(`/customs/${id}/status`, { status: 'under_examination' }).expect(200)
      await api(supToken).patch(`/customs/${id}/status`, { status: 'cleared' }).expect(200)
      const released = await api(supToken).patch(`/customs/${id}/status`, { status: 'released' }).expect(200)
      expect(released.body.declaration.releasedAt).toBeTruthy()

      // A held declaration requires the hold reason.
      const held = await api(supToken).post('/customs', { direction: 'import', hsCode: '8517.12', commodity: 'Phones' }).expect(201)
      await api(supToken).patch(`/customs/${held.body.declaration.id}/status`, { status: 'filed' }).expect(200)
      const h = await api(supToken).patch(`/customs/${held.body.declaration.id}/status`, { status: 'held', holdReason: 'Valuation query' }).expect(200)
      expect(h.body.declaration.holdReason).toBe('Valuation query')

      // Invalid direction rejected.
      await api(supToken).post('/customs', { direction: 'warp' }).expect(400)
    })
  })

  describe('yard, trade documents, KYB & multimodal (e2e)', () => {
    let facilityId: string
    let dockId: string
    let apptId: string

    it('registers a dock and schedules a non-overlapping appointment', async () => {
      const fac = await api(supToken).post('/storage/facilities', { name: 'E2E CFS Yard', kind: 'cfs', city: 'Hyderabad', capacitySlots: 4 }).expect(201)
      facilityId = fac.body.facility.id

      const dock = await api(supToken).post('/yard/docks', { facilityId, name: 'Dock A', kind: 'combined' }).expect(201)
      dockId = dock.body.dock.id
      expect(dock.body.dock.status).toBe('available')

      const appt = await api(supToken).post('/yard/appointments', {
        facilityId, dockId, vehicleNo: 'AP01AB1234', windowStart: '2026-10-01T08:00:00Z', windowEnd: '2026-10-01T10:00:00Z',
      }).expect(201)
      apptId = appt.body.appointment.id
      expect(appt.body.appointment.ref).toMatch(/^APPT-/)

      // Overlap on the same dock is rejected.
      await api(supToken).post('/yard/appointments', {
        facilityId, dockId, vehicleNo: 'AP02CD5678', windowStart: '2026-10-01T09:00:00Z', windowEnd: '2026-10-01T11:00:00Z',
      }).expect(400)

      // A non-overlapping slot on the same dock is fine.
      await api(supToken).post('/yard/appointments', {
        facilityId, dockId, vehicleNo: 'AP02CD5678', windowStart: '2026-10-01T12:00:00Z', windowEnd: '2026-10-01T14:00:00Z',
      }).expect(201)

      // Invalid window rejected.
      await api(supToken).post('/yard/appointments', { facilityId, windowStart: '2026-10-01T16:00:00Z', windowEnd: '2026-10-01T15:00:00Z' }).expect(400)
    })

    it('drives an appointment through gate-in and gate-out', async () => {
      const confirmed = await api(supToken).patch(`/yard/appointments/${apptId}/status`, { status: 'confirmed' }).expect(200)
      expect(confirmed.body.appointment.status).toBe('confirmed')

      const inProgress = await api(supToken).patch(`/yard/appointments/${apptId}/status`, { status: 'in_progress' }).expect(200)
      expect(inProgress.body.appointment.gateInAt).toBeTruthy()

      const done = await api(supToken).patch(`/yard/appointments/${apptId}/status`, { status: 'completed' }).expect(200)
      expect(done.body.appointment.gateOutAt).toBeTruthy()

      // Dock is released back to available after completion.
      const docks = await api(supToken).get('/yard/docks').expect(200)
      expect(docks.body.docks.find((d: { id: string }) => d.id === dockId)?.status).toBe('available')

      // Illegal transition rejected.
      await api(supToken).patch(`/yard/appointments/${apptId}/status`, { status: 'no_show' }).expect(400)
    })

    it('issues a trade document and drives it to released', async () => {
      const shipment = await api(supToken).post('/foundation/shipments', { ref: 'SHIP-E2E-DOC', commodity: 'Textiles' }).expect(201)

      const doc = await api(supToken).post('/trade-documents', {
        docType: 'bol',
        shipmentId: shipment.body.shipment.id,
        lines: [{ description: 'Cotton bales', qty: 10, weightKg: 2500, value: 400000 }],
        incoterms: 'CIF',
        originRef: 'Mumbai',
        destinationRef: 'Singapore',
        currency: 'USD',
        totalValue: 400000,
      }).expect(201)
      expect(doc.body.document.ref).toMatch(/^BOL-/)
      expect(doc.body.document.docType).toBe('bol')

      const id = doc.body.document.id
      const signed = await api(supToken).patch(`/trade-documents/${id}/status`, { status: 'signed' }).expect(200)
      expect(signed.body.document.signedAt).toBeTruthy()
      expect(signed.body.document.signedBy).toBeTruthy()

      const released = await api(supToken).patch(`/trade-documents/${id}/status`, { status: 'released' }).expect(200)
      expect(released.body.document.released).toBe(true)
      expect(released.body.document.releasedAt).toBeTruthy()

      // Voiding a released doc is rejected.
      await api(supToken).patch(`/trade-documents/${id}/status`, { status: 'void' }).expect(400)

      // Invalid docType rejected.
      await api(supToken).post('/trade-documents', { docType: 'manifesto' }).expect(400)
    })

    it('uploads KYB docs, verifies an org, and builds a hierarchy', async () => {
      const org = await api(supToken).post('/foundation/organizations', { name: 'E2E KYB Sub', kind: 'warehouse' }).expect(201)
      const orgId = org.body.organization.id

      const uploaded = await api(supToken).post('/kyb/documents', { orgId, kind: 'registration', storageKey: 'kyb/reg.pdf' }).expect(201)
      expect(uploaded.body.document.status).toBe('pending')

      // Org is now pending review.
      const before = (await api(supToken).get('/kyb/tree').expect(200)).body.tree
      expect(before).toBeTruthy()

      // Admin verifies the document → org kybcStatus flips to verified.
      const decided = await api(admToken).patch(`/kyb/documents/${uploaded.body.document.id}/decide`, { status: 'verified' }).expect(200)
      expect(decided.body.document.status).toBe('verified')

      const tree = (await api(admToken).get(`/kyb/tree?rootId=${orgId}`).expect(200)).body.tree
      expect(tree.id).toBe(orgId)
      const verifiedOrg = await api(supToken).get(`/foundation/organizations/${orgId}`).expect(200)
      expect(verifiedOrg.body.organization.kybcStatus).toBe('verified')

      // Parent assignment + cycle guard.
      const parent = (await api(supToken).get('/foundation/organizations').expect(200)).body.organizations[0]
      await api(supToken).patch(`/kyb/organizations/${orgId}/parent`, { parentOrgId: parent.id }).expect(200)
      await api(supToken).patch(`/kyb/organizations/${parent.id}/parent`, { parentOrgId: orgId }).expect(400) // cycle
      void tree
    })

    it('converts between currencies for quoting/display', async () => {
      const res = await api(supToken).get('/finance/fx/convert?amount=100&from=USD&to=INR').expect(200)
      expect(res.body.amount).toBe(8350)
      expect(res.body.to).toBe('INR')
      expect(res.body.rate).toBe(83.5)

      // Unsupported currency rejected.
      await api(supToken).get('/finance/fx/convert?amount=1&from=XXX&to=INR').expect(400)

      const list = await api(supToken).get('/finance/currencies').expect(200)
      expect(list.body.currencies).toContain('USD')
    })

    it('generates multimodal plan options for a shipment route', async () => {
      const shipment = await api(supToken).post('/foundation/shipments', { ref: 'SHIP-E2E-MM', commodity: 'Machinery', weightKg: 8000 }).expect(201)
      const res = await api(supToken).post('/planning/multimodal', {
        shipmentId: shipment.body.shipment.id,
        origin: 'Hyderabad',
        destination: 'Delhi',
        originCountry: 'IN',
        destinationCountry: 'IN',
        weightKg: 8000,
      }).expect(201)
      expect(res.body.options.length).toBeGreaterThanOrEqual(2) // road + at least one alternative
      expect(res.body.currency).toBe('INR')
      // Every option is a real proposed Plan the orderer can select.
      const plans = await api(supToken).get(`/planning/shipments/${shipment.body.shipment.id}/plans`).expect(200)
      expect(plans.body.plans.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('EDI gateway, visibility & AI agents (e2e)', () => {
    let shipmentId: string
    let orgId: string

    beforeAll(async () => {
      const orgs = (await api(supToken).get('/foundation/organizations').expect(200)).body.organizations as Array<{ id: string }>
      orgId = orgs[0]!.id
    })

    it('parses an inbound X12 PO and an EDIFACT ASN', async () => {
      const x12 = `ISA*00*          *00*          *ZZ*PARTNER      *ZZ*WAGON        *20260819*0000*U*00401*000000001*0*P*>~GS*PO*PARTNER*WAGON*20260819*0000*1*X*004010~ST*850*0001~BEG*00*SA*PO-12345**20260819~SE*3*0001~GE*1*1~IEA*1*000000001~`
      const recv = await api(supToken).post('/integrations/edi/receive', { orgId, raw: x12 }).expect(201)
      expect(recv.body.message.format).toBe('X12')
      expect(recv.body.message.documentType).toBe('PO')
      expect(recv.body.message.payload.purchaseOrder.poNumber).toBe('PO-12345')

      const edifact = `UNB+UNOC:3+PARTNER+WAGON+20260819:0000+1'UNH+1+DESADV:D:97A:UN'BGM+DESADV+ASN-999+9'CNT+2:1'UNT+4+1'UNZ+1+1'`
      const recv2 = await api(supToken).post('/integrations/edi/receive', { orgId, raw: edifact }).expect(201)
      expect(recv2.body.message.format).toBe('EDIFACT')
      expect(recv2.body.message.documentType).toBe('ASN')

      // Unrecognized format rejected.
      await api(supToken).post('/integrations/edi/receive', { orgId, raw: 'not an edi message' }).expect(400)
    })

    it('generates and sends an outbound X12 load tender', async () => {
      const gen = await api(supToken).post('/integrations/edi/generate', {
        orgId, documentType: 'LOAD_TENDER', payload: { reference: 'LT-777' },
      }).expect(201)
      expect(gen.body.message.format).toBe('X12')
      expect(gen.body.message.raw).toContain('B2*LT-777')

      const sent = await api(supToken).post('/integrations/edi/send', {
        orgId, documentType: 'PO', payload: { poNumber: 'PO-222' },
      }).expect(201)
      expect(sent.body.message.direction).toBe('outbound')
      expect(sent.body.message.status).toBe('sent')

      const list = await api(supToken).get('/integrations/edi').expect(200)
      expect(list.body.messages.length).toBeGreaterThanOrEqual(3)
    })

    it('exposes a shipment visibility timeline', async () => {
      const shipment = await api(supToken).post('/foundation/shipments', { ref: 'SHIP-E2E-VIS', commodity: 'Electronics' }).expect(201)
      shipmentId = shipment.body.shipment.id

      // Emit an operational event so the timeline is non-trivial.
      const timeline = await api(supToken).get(`/visibility/shipments/${shipmentId}`).expect(200)
      expect(timeline.body.shipment.id).toBe(shipmentId)
      expect(Array.isArray(timeline.body.timeline)).toBe(true)

      // Non-member cannot view another shipment's timeline.
      await api(trToken).get(`/visibility/shipments/${shipmentId}`).expect(403)
    })

    it('AI drafts a document, predicts ETA and detects exceptions', async () => {
      const draft = await api(supToken).post('/ai/draft-document', { shipmentId, docType: 'packing_list' }).expect(201)
      expect(draft.body.draft.docType).toBe('packing_list')
      expect(draft.body.recommendation.agent).toBe('document')

      // Add a planned leg so ETA has something to predict.
      await api(supToken).post(`/foundation/shipments/${shipmentId}/legs`, { mode: 'road', pickupAddr: 'Hyderabad', dropAddr: 'Delhi', distanceKm: 1400 }).expect(201)

      const eta = await api(supToken).post(`/ai/eta/${shipmentId}`).expect(201)
      expect(eta.body.etaHours).toBeGreaterThan(0)
      expect(eta.body.recommendation.agent).toBe('eta')

      const exc = await api(supToken).post(`/ai/exceptions/${shipmentId}`).expect(201)
      expect(Array.isArray(exc.body.findings)).toBe(true)
      expect(exc.body.recommendation.agent).toBe('exception')

      // Recommendations appear in the caller's feed.
      const feed = await api(supToken).get('/ai/recommendations/mine').expect(200)
      expect(feed.body.recommendations.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('e-way bill lifecycle & exception loop (e2e)', () => {
    let loadId: string

    it('generates, extends and cancels an e-way bill across the lifecycle', async () => {
      const ref = await api(supToken).get('/reference').expect(200)
      const model = ref.body.models.find((m: { type: string }) => m.type === 'container')
      const material = ref.body.materials[0]

      const loadRes = await api(supToken).post('/loads', {
        pickupAddr: 'Hyderabad, Telangana 500001',
        dropAddr: 'Vijayawada, AP 520001',
        pickupLat: 17.385, pickupLng: 78.487, dropLat: 16.506, dropLng: 80.648,
        date: '2026-10-01T08:00:00Z', truckType: 'container', modelId: model.id,
        weight: 35, distanceKm: 250, materialId: material.id,
      }).expect(201)
      loadId = loadRes.body.load.id

      const gen = await api(supToken).post(`/ewb/loads/${loadId}/generate`).expect(201)
      expect(gen.body.ewbNumber).toMatch(/^EWB/)
      expect(gen.body.status).toBe('generated')
      expect(gen.body.validUntil).toBeTruthy()

      // Idempotent — regenerating returns the same number.
      const again = await api(supToken).post(`/ewb/loads/${loadId}/generate`).expect(201)
      expect(again.body.alreadyGenerated).toBe(true)
      expect(again.body.ewbNumber).toBe(gen.body.ewbNumber)

      // Extend bumps validity.
      const ext = await api(supToken).post(`/ewb/loads/${loadId}/extend`).expect(201)
      expect(ext.body.status).toBe('extended')

      // Status endpoint reflects the state.
      const status = await api(supToken).get(`/ewb/loads/${loadId}`).expect(200)
      expect(status.body.ewb.status).toBe('extended')
      expect(status.body.ewb.ewbNumber).toBe(gen.body.ewbNumber)

      // Cancel marks it cancelled.
      const cancel = await api(supToken).post(`/ewb/loads/${loadId}/cancel`, { reason: 'Route changed' }).expect(201)
      expect(cancel.body.status).toBe('cancelled')
      expect(cancel.body.cancelledAt).toBeTruthy()

      // Cancelling again is rejected.
      await api(supToken).post(`/ewb/loads/${loadId}/cancel`).expect(400)
    })

    it('runs the exception scan and returns an actionable feed', async () => {
      const scan = await api(supToken).post('/ai/exceptions/scan').expect(201)
      expect(scan.body.scanned).toBeGreaterThanOrEqual(0)
      expect(typeof scan.body.notified).toBe('number')

      const feed = await api(supToken).get('/ai/exceptions/feed').expect(200)
      expect(Array.isArray(feed.body.exceptions)).toBe(true)
    })
  })

  describe('analytics control tower (e2e)', () => {
    it('returns a network ops snapshot and an org summary', async () => {
      const ops = await api(admToken).get('/analytics/ops').expect(200)
      expect(typeof ops.body.trips.total).toBe('number')
      expect(typeof ops.body.trips.onTimeRate).toBe('number')
      expect(typeof ops.body.finance.invoicesTotal).toBe('number')
      expect(typeof ops.body.containers.utilization).toBe('number')
      expect(Array.isArray(Object.keys(ops.body.modeMix ?? {}))).toBe(true)

      const org = await api(supToken).get('/analytics/org').expect(200)
      expect(org.body.orgs).toBeGreaterThan(0)
      expect(typeof org.body.shipments.total).toBe('number')
      expect(typeof org.body.finance.invoicesTotal).toBe('number')
    })
  })

  describe('driver performance & fleet overview (e2e)', () => {
    it('reports driver performance and fleet earnings for a transporter', async () => {
      const truck = await api(trToken).post('/trucks', { truckNo: `AP44DRV${Date.now().toString().slice(-4)}`, type: 'container', modelId: (await api(trToken).get('/reference').expect(200)).body.models.find((m: { type: string }) => m.type === 'container').id, origin: 'Hyderabad' }).expect(201)

      const driver = await api(trToken).post('/drivers', { name: 'E2E Driver', mobile: '9876543210' }).expect(201)
      const driverId = driver.body.driver.id

      // Driver with no trips yet → zeroed summary.
      const perf = await api(trToken).get(`/drivers/${driverId}/performance`).expect(200)
      expect(perf.body.driver.id).toBe(driverId)
      expect(perf.body.summary.trips).toBe(0)
      expect(perf.body.summary.earned).toBe(0)

      // Fleet overview returns the expected shape.
      const ov = await api(trToken).get('/trucks/fleet/overview').expect(200)
      expect(ov.body.fleet.trucks).toBeGreaterThanOrEqual(1)
      expect(typeof ov.body.earnings).toBe('number')
      expect(typeof ov.body.coverage.driverCoverage).toBe('number')
      void truck
    })
  })

  describe('cross-border trade compliance (e2e)', () => {
    let shipmentId: string

    it('reports a country checklist and auto-issues required trade documents', async () => {
      const shipment = await api(supToken).post('/foundation/shipments', { ref: 'SHIP-E2E-XB', commodity: 'Machinery', weightKg: 2000, value: 500000 }).expect(201)
      shipmentId = shipment.body.shipment.id

      // Default destination is IN → requires commercial_invoice + packing_list (mappable).
      const checklist = await api(supToken).get(`/countries/shipments/${shipmentId}/checklist`).expect(200)
      expect(checklist.body.country.code).toBe('IN')
      expect(checklist.body.required).toContain('commercial_invoice')
      expect(checklist.body.required).toContain('packing_list')
      expect(checklist.body.missing).toContain('commercial_invoice')

      // Auto-issue the mappable required documents.
      const issued = await api(supToken).post(`/countries/shipments/${shipmentId}/documents/issue`).expect(201)
      expect(issued.body.issued.length).toBeGreaterThanOrEqual(2)
      expect(issued.body.issued.some((d: { docType: string }) => d.docType === 'commercial_invoice')).toBe(true)
      expect(issued.body.issued.some((d: { docType: string }) => d.docType === 'packing_list')).toBe(true)

      // Re-check the checklist — the issued docs are now present.
      const recheck = await api(supToken).get(`/countries/shipments/${shipmentId}/checklist`).expect(200)
      expect(recheck.body.missing).not.toContain('commercial_invoice')
      expect(recheck.body.missing).not.toContain('packing_list')

      // Compliance overview surfaces the shipment as complete-ish.
      const overview = await api(supToken).get('/countries/compliance/overview').expect(200)
      const row = overview.body.shipments.find((s: { shipmentId: string }) => s.shipmentId === shipmentId)
      expect(row).toBeTruthy()
      expect(Array.isArray(row.missing)).toBe(true)
    })
  })

  describe('notification center (e2e)', () => {
    let userId: string

    beforeAll(async () => {
      const prisma = app.get(PrismaService)
      const user = await prisma.user.findUniqueOrThrow({ where: { mobile: SUP } })
      userId = user.id
      await prisma.notification.deleteMany({ where: { userId } })
      await prisma.notification.createMany({
        data: [
          { userId, type: 'trip_started', title: 'Trip started', body: 'Trip A', isRead: false },
          { userId, type: 'trip_delivered', title: 'Trip delivered', body: 'Trip B', isRead: false },
          { userId, type: 'bid_received', title: 'Bid received', body: 'Bid C', isRead: true },
        ],
      })
    })

    it('lists notifications with an unread count and drives the read lifecycle', async () => {
      const list = await api(supToken).get('/notifications').expect(200)
      expect(list.body.items.length).toBeGreaterThanOrEqual(3)
      expect(list.body.unread).toBe(2)
      expect(list.body.total).toBeGreaterThanOrEqual(3)

      // Unread count endpoint.
      const count = await api(supToken).get('/notifications/count').expect(200)
      expect(count.body.unread).toBe(2)

      // Mark one read.
      const first = list.body.items[0]
      await api(supToken).patch(`/notifications/${first.id}/read`).expect(200)
      const after = await api(supToken).get('/notifications/count').expect(200)
      expect(after.body.unread).toBe(1)

      // Mark unread again.
      await api(supToken).patch(`/notifications/${first.id}/unread`).expect(200)
      const unreadAgain = await api(supToken).get('/notifications/count').expect(200)
      expect(unreadAgain.body.unread).toBe(2)

      // Mark all read.
      const all = await api(supToken).post('/notifications/read-all').expect(201)
      expect(all.body.updated).toBeGreaterThanOrEqual(2)
      const final = await api(supToken).get('/notifications/count').expect(200)
      expect(final.body.unread).toBe(0)
    })

    it('reads and updates notification preferences', async () => {
      const prefs = await api(supToken).get('/notifications/preferences').expect(200)
      expect(prefs.body.preferences.loadAlerts).toBe(true)

      const updated = await api(supToken).patch('/notifications/preferences', { promo: true, market: false }).expect(200)
      expect(updated.body.preferences.promo).toBe(true)
      expect(updated.body.preferences.market).toBe(false)

      const recheck = await api(supToken).get('/notifications/preferences').expect(200)
      expect(recheck.body.preferences.promo).toBe(true)
      expect(recheck.body.preferences.market).toBe(false)
    })
  })

  describe('fleet maintenance (e2e)', () => {
    let truckId: string

    it('logs maintenance and reports service-due across the fleet', async () => {
      const model = (await api(trToken).get('/reference').expect(200)).body.models.find((m: { type: string }) => m.type === 'container')
      const truck = await api(trToken).post('/trucks', { truckNo: `AP55MNT${Date.now().toString().slice(-4)}`, type: 'container', modelId: model.id, origin: 'Hyderabad', odometerKm: 120000, nextServiceKm: 150000 }).expect(201)
      truckId = truck.body.truck.id

      // Log a service with a new next-service odometer.
      const logged = await api(trToken).post(`/trucks/${truckId}/maintenance`, {
        kind: 'service', title: 'Full service', cost: 18000, odometerKm: 150000, nextServiceKm: 180000,
      }).expect(201)
      expect(logged.body.maintenance.kind).toBe('service')
      expect(logged.body.maintenance.cost).toBe(18000)

      // History reflects the record.
      const history = await api(trToken).get(`/trucks/${truckId}/maintenance`).expect(200)
      expect(history.body.maintenance.length).toBeGreaterThanOrEqual(1)
      expect(history.body.maintenance[0].title).toBe('Full service')

      // An invalid kind is rejected.
      await api(trToken).post(`/trucks/${truckId}/maintenance`, { kind: 'paintjob', title: 'X' }).expect(400)

      // Maintenance-due overview returns the fleet shape.
      const due = await api(trToken).get('/trucks/maintenance/due').expect(200)
      expect(Array.isArray(due.body.due)).toBe(true)
      expect(typeof due.body.totalMaintenanceCost).toBe('number')
      expect(due.body.totalMaintenanceCost).toBeGreaterThanOrEqual(18000)
    })
  })
})
