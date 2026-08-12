import { OutboxRelay } from '../src/outbox/outbox-relay.service'

describe('OutboxRelay', () => {
  let service: OutboxRelay
  let prisma: any
  let webhooks: any

  beforeEach(() => {
    prisma = {
      outboxMessage: { updateMany: jest.fn(), update: jest.fn(), create: jest.fn() },
      logisticsEvent: { create: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({ $queryRaw: jest.fn() })),
    }
    webhooks = { enqueue: jest.fn() }
    service = new OutboxRelay(prisma, webhooks)
  })

  describe('reapStaleClaims', () => {
    it('reclaims publishing rows older than the timeout', async () => {
      prisma.outboxMessage.updateMany.mockResolvedValue({ count: 3 })
      await service['reapStaleClaims']()
      expect(prisma.outboxMessage.updateMany).toHaveBeenCalledWith({
        where: {
          status: 'publishing',
          claimedAt: { lte: expect.any(Date) },
        },
        data: { status: 'pending' },
      })
    })
  })

  describe('emit', () => {
    const tx = {
      logisticsEvent: { create: jest.fn().mockResolvedValue({}) },
      outboxMessage: { create: jest.fn().mockResolvedValue({}) },
    }

    it('writes event + outbox row atomically with orgId and dedupeKey', async () => {
      await service.emit(tx, {
        eventType: 'SHIPMENT',
        eventCode: 'SHIPMENT_CREATED',
        entityType: 'shipment',
        entityId: 's1',
        orgId: 'org1',
        shipmentId: 's1',
        correlationId: 'cid-1',
        payload: { ref: 'X' },
      })
      expect(tx.logisticsEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ orgId: 'org1', correlationId: 'cid-1', eventCode: 'SHIPMENT_CREATED' }),
      })
      expect(tx.outboxMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ orgId: 'org1', dedupeKey: 'cid-1', aggregateId: 's1' }),
      })
    })

    it('applies defaults (classifier ACT, source system)', async () => {
      await service.emit(tx, {
        eventType: 'TRANSPORT',
        eventCode: 'DEPARTED',
        entityType: 'leg',
        entityId: 'l1',
      })
      const eventData = tx.logisticsEvent.create.mock.calls[0][0].data
      expect(eventData.classifier).toBe('ACT')
      expect(eventData.source).toBe('system')
    })
  })
})
