import { WebhookDispatcher } from '../src/integrations/webhook-dispatcher.service'

describe('WebhookDispatcher', () => {
  let service: WebhookDispatcher
  let prisma: any
  let deliveryRows: any[]

  const setupDeliver = (rows: any[]) => {
    deliveryRows = rows
    prisma.$transaction.mockImplementation((fn: any) => fn({ $queryRaw: jest.fn().mockResolvedValue(rows) }))
  }

  beforeEach(() => {
    prisma = {
      webhookSubscription: { findMany: jest.fn(), findUnique: jest.fn() },
      webhookDelivery: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(),
    }
    service = new WebhookDispatcher(prisma)
  })

  describe('enqueue', () => {
    it('fans out only to subscriptions of the SAME org (no cross-tenant leak)', async () => {
      prisma.webhookSubscription.findMany.mockResolvedValue([
        { id: 'wh1', orgId: 'orgA', eventTypes: ['LOAD_CREATED'], secret: 's' },
      ])
      await service.enqueue('LOAD_CREATED', { ref: 'load1' }, 'orgA', 'msg1')
      expect(prisma.webhookSubscription.findMany).toHaveBeenCalledWith({
        where: { status: 'active', orgId: 'orgA' },
      })
      expect(prisma.webhookDelivery.create).toHaveBeenCalledWith({
        data: { subscriptionId: 'wh1', eventCode: 'LOAD_CREATED', payload: { ref: 'load1' }, dedupeKey: 'wh1:msg1' },
      })
    })

    it('skips subscriptions whose eventTypes do not match', async () => {
      prisma.webhookSubscription.findMany.mockResolvedValue([
        { id: 'wh1', orgId: 'orgA', eventTypes: ['DELIVERED'], secret: 's' },
      ])
      await service.enqueue('LOAD_CREATED', {}, 'orgA', 'msg1')
      expect(prisma.webhookDelivery.create).not.toHaveBeenCalled()
    })

    it('does not create duplicate deliveries for the same outbox message', async () => {
      prisma.webhookSubscription.findMany.mockResolvedValue([
        { id: 'wh1', orgId: 'orgA', eventTypes: ['LOAD_CREATED'], secret: 's' },
      ])
      prisma.webhookDelivery.findUnique.mockResolvedValue({ id: 'existing' })
      await service.enqueue('LOAD_CREATED', {}, 'orgA', 'msg1')
      expect(prisma.webhookDelivery.create).not.toHaveBeenCalled()
    })

    it('is a no-op when no org is provided', async () => {
      await service.enqueue('LOAD_CREATED', {}, null, 'msg1')
      expect(prisma.webhookSubscription.findMany).not.toHaveBeenCalled()
    })
  })

  describe('deliver', () => {
    it('increments attempts and marks sent on 2xx', async () => {
      const delivery = { id: 'd1', subscriptionId: 'wh1', eventCode: 'LOAD_CREATED', payload: {}, attempts: 0, nextRetryAt: null }
      setupDeliver([delivery])
      prisma.webhookSubscription.findUnique.mockResolvedValue({ id: 'wh1', secret: 'abc', url: 'http://example.com/h', name: 'h' })
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 })
      await service['deliver']()
      const update = prisma.webhookDelivery.update.mock.calls[0][0]
      expect(update.data).toMatchObject({ status: 'sent', attempts: 1 })
    })

    it('marks dead after MAX_ATTEMPTS with exponential backoff in between', async () => {
      const delivery = { id: 'd1', subscriptionId: 'wh1', eventCode: 'LOAD_CREATED', payload: {}, attempts: 3, nextRetryAt: null }
      setupDeliver([delivery])
      prisma.webhookSubscription.findUnique.mockResolvedValue({ id: 'wh1', secret: 'abc', url: 'http://example.com/h', name: 'h' })
      global.fetch = jest.fn().mockRejectedValue(new Error('network'))
      await service['deliver']()
      const update = prisma.webhookDelivery.update.mock.calls[0][0]
      expect(update.data.status).toBe('dead')
      expect(update.data.nextRetryAt).toBeNull()
    })

    it('sets backoff nextRetryAt on a 5xx for a retryable attempt', async () => {
      const delivery = { id: 'd1', subscriptionId: 'wh1', eventCode: 'LOAD_CREATED', payload: {}, attempts: 1, nextRetryAt: null }
      setupDeliver([delivery])
      prisma.webhookSubscription.findUnique.mockResolvedValue({ id: 'wh1', secret: 'abc', url: 'http://example.com/h', name: 'h' })
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 })
      await service['deliver']()
      const update = prisma.webhookDelivery.update.mock.calls[0][0]
      expect(update.data.status).toBe('failed')
      expect(update.data.attempts).toBe(2)
      expect(update.data.nextRetryAt).toBeInstanceOf(Date)
    })

    afterEach(() => {
      delete (global as any).fetch
    })
  })

  describe('retryNow', () => {
    it('resets a delivery to pending with zero attempts', async () => {
      prisma.webhookDelivery.update.mockResolvedValue({ id: 'd1' })
      await service.retryNow('d1')
      expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { status: 'pending', attempts: 0, nextRetryAt: null, responseStatus: null },
      })
    })
  })
})
