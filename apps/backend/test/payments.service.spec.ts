import { BadRequestException, NotFoundException } from '@nestjs/common'
import { PaymentsService } from '../src/payments/payments.service'
import { NotificationsService } from '../src/notifications/notifications.service'

describe('PaymentsService', () => {
  let service: PaymentsService
  let prisma: any
  let notifications: any
  let provider: any
  let outbox: any

  const trip = {
    id: 'trip1',
    loadId: 'load1',
    transporterId: 'tr1',
    status: 'accepted',
    load: { supplierId: 'sup1', id: 'load1', fareEstimate: 5000 },
  }

  const supplier = { id: 'sup1', userId: 'user-sup' } as any
  const transporter = { id: 'tr1', userId: 'user-tr', bankAccount: '1234', ifsc: 'IFSC' } as any
  const user = { id: 'user-sup', role: 'supplier' } as any

  beforeEach(() => {
    prisma = {
      trip: { findUnique: jest.fn(), update: jest.fn() },
      supplier: { findUnique: jest.fn() },
      transporter: { findUnique: jest.fn() },
      payment: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
      user: { update: jest.fn() },
      load: { update: jest.fn() },
      kycDocument: { count: jest.fn() },
      shipment: { findFirst: jest.fn() },
      dispute: { count: jest.fn() },
      settlement: { count: jest.fn() },
      proofOfDelivery: { findUnique: jest.fn() },
    }
    notifications = { create: jest.fn() }
    provider = { capture: jest.fn(), payout: jest.fn() }
    outbox = { emit: jest.fn() }
    service = new PaymentsService(prisma, notifications, outbox, provider)
  })

  describe('captureEscrow', () => {
    it('throws if amount is not positive', async () => {
      await expect(service.captureEscrow('t1', 0, user)).rejects.toThrow(BadRequestException)
    })

    it('throws if trip not found', async () => {
      prisma.trip.findUnique.mockResolvedValue(null)
      await expect(service.captureEscrow('t1', 100, user)).rejects.toThrow(NotFoundException)
    })

    it('throws if only the load supplier can pay', async () => {
      prisma.trip.findUnique.mockResolvedValue(trip)
      prisma.supplier.findUnique.mockResolvedValue({ id: 'other-supplier', userId: 'x' })
      await expect(service.captureEscrow('t1', 100, user)).rejects.toThrow(BadRequestException)
    })

    it('is idempotent — returns existing payment if already captured', async () => {
      prisma.trip.findUnique.mockResolvedValue(trip)
      prisma.supplier.findUnique.mockResolvedValue(supplier)
      prisma.payment.findUnique.mockResolvedValue({ id: 'existing', status: 'succeeded' })
      const res = await service.captureEscrow('t1', 5000, user)
      expect(res.alreadyCaptured).toBe(true)
      expect(res.payment.id).toBe('existing')
      expect(provider.capture).not.toHaveBeenCalled()
    })

    it('captures via provider and creates a payment record', async () => {
      prisma.trip.findUnique.mockResolvedValue(trip)
      prisma.supplier.findUnique.mockResolvedValue(supplier)
      prisma.payment.findUnique.mockResolvedValue(null)
      prisma.transporter.findUnique.mockResolvedValue(transporter)
      provider.capture.mockResolvedValue({ providerRef: 'ref', status: 'succeeded', capturedAt: new Date() })
      prisma.payment.create.mockResolvedValue({ id: 'pay1', status: 'succeeded' })

      const res = await service.captureEscrow('t1', 5000, user)
      expect(provider.capture).toHaveBeenCalledWith(expect.objectContaining({ amount: 5000 }))
      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'escrow', amount: 5000 }) }),
      )
      expect(res.alreadyCaptured).toBe(false)
    })
  })

  describe('releasePayout', () => {
    const deliveredTrip = { ...trip, status: 'delivered' }
    const trUser = { id: 'user-tr', role: 'transporter' } as any

    it('throws if trip not delivered', async () => {
      prisma.trip.findUnique.mockResolvedValue(trip)
      prisma.transporter.findUnique.mockResolvedValue(transporter)
      await expect(service.releasePayout('t1', trUser)).rejects.toThrow(BadRequestException)
    })

    it('throws if no escrow captured', async () => {
      prisma.trip.findUnique.mockResolvedValue(deliveredTrip)
      prisma.transporter.findUnique.mockResolvedValue(transporter)
      prisma.payment.findFirst.mockResolvedValue(null)
      prisma.dispute.count.mockResolvedValue(0)
      prisma.shipment.findFirst.mockResolvedValue(null)
      prisma.settlement.count.mockResolvedValue(0)
      prisma.proofOfDelivery.findUnique.mockResolvedValue({ status: 'confirmed' })
      await expect(service.releasePayout('t1', trUser)).rejects.toThrow(BadRequestException)
    })

    it('releases escrow amount as payout', async () => {
      prisma.trip.findUnique.mockResolvedValue(deliveredTrip)
      prisma.transporter.findUnique.mockResolvedValue(transporter)
      prisma.payment.findFirst.mockResolvedValue({ id: 'esc1', type: 'escrow', status: 'succeeded', amount: 5000 })
      prisma.payment.findUnique.mockResolvedValue(null)
      prisma.dispute.count.mockResolvedValue(0)
      prisma.shipment.findFirst.mockResolvedValue(null)
      prisma.settlement.count.mockResolvedValue(0)
      prisma.proofOfDelivery.findUnique.mockResolvedValue({ status: 'confirmed' })
      provider.payout.mockResolvedValue({ providerRef: 'ref', status: 'succeeded', paidAt: new Date() })
      prisma.payment.create.mockResolvedValue({ id: 'pay1', status: 'succeeded' })

      const res = await service.releasePayout('t1', trUser)
      expect(provider.payout).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 4900, destination: { account: '1234', ifsc: 'IFSC' } }),
      )
      expect(res.alreadyPaid).toBe(false)
    })
  })
})
