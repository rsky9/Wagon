import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { OrgAccessService } from '../org-access/org-access.service'
import type { User } from '@prisma/client'

const DOCK_KINDS = ['loading', 'unloading', 'combined', 'cross_dock']
const APPT_TRANSITIONS: Record<string, string[]> = {
  requested: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'cancelled', 'no_show'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
  no_show: [],
}

interface DockInput {
  facilityId: string
  name: string
  kind?: string
  equipment?: string
}

interface AppointmentInput {
  facilityId: string
  dockId?: string
  orgId?: string
  shipmentId?: string
  vehicleNo?: string
  containerId?: string
  windowStart: string
  windowEnd: string
  cargoPieces?: number
  cargoWeightKg?: number
  note?: string
}

@Injectable()
export class YardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orgAccess: OrgAccessService,
  ) {}

  private async requireFacilityAccess(user: User, facilityId: string) {
    const facility = await this.prisma.facility.findUnique({ where: { id: facilityId } })
    if (!facility) throw new NotFoundException('Facility not found')
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    if (isAdmin) return facility
    if (facility.operatorId && (await this.orgAccess.isMember(user, facility.operatorId))) return facility
    throw new ForbiddenException('Not the operator of this facility')
  }

  private async requireAppointmentAccess(user: User, appointmentId: string) {
    const appt = await this.prisma.scheduledAppointment.findUnique({ where: { id: appointmentId }, include: { facility: true } })
    if (!appt) throw new NotFoundException('Appointment not found')
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    if (isAdmin) return appt
    const orgIds = await this.orgAccess.memberOrgIds(user)
    if (orgIds.includes(appt.orgId ?? '') || (appt.facility.operatorId && orgIds.includes(appt.facility.operatorId))) return appt
    throw new ForbiddenException('Not a party to this appointment')
  }

  /** Register a loading/unloading bay at a facility. */
  async createDock(input: DockInput, user: User) {
    await this.requireFacilityAccess(user, input.facilityId)
    if (!input.name?.trim()) throw new BadRequestException('Dock name is required')
    if (!DOCK_KINDS.includes(input.kind ?? 'loading')) throw new BadRequestException('Invalid dock kind')
    const dock = await this.prisma.dock.create({
      data: { facilityId: input.facilityId, name: input.name.trim(), kind: input.kind ?? 'loading', equipment: input.equipment },
      include: { facility: { select: { id: true, name: true, city: true } } },
    })
    await this.audit.log({ actorId: user.id, action: 'dock.create', resource: dock.id, after: { name: dock.name } })
    return { dock }
  }

  async listDocks(user: User, query?: { facilityId?: string; status?: string }) {
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    const where: Record<string, unknown> = {}
    if (query?.facilityId) where.facilityId = query.facilityId
    if (query?.status) where.status = query.status
    if (!isAdmin) {
      const myFacilities = await this.prisma.facility.findMany({ where: { operatorId: { in: await this.orgAccess.memberOrgIds(user) } }, select: { id: true } })
      where.facilityId = { in: myFacilities.map((f) => f.id) }
    }
    const docks = await this.prisma.dock.findMany({
      where: where as never,
      include: { facility: { select: { id: true, name: true, city: true } }, appointments: { select: { id: true, windowStart: true, windowEnd: true, status: true } } },
      orderBy: [{ facilityId: 'asc' }, { name: 'asc' }],
    })
    return { docks }
  }

  /** Reserve a dock for a window; rejects overlaps on the same dock. */
  async createAppointment(input: AppointmentInput, user: User) {
    await this.requireFacilityAccess(user, input.facilityId)
    const start = new Date(input.windowStart)
    const end = new Date(input.windowEnd)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new BadRequestException('Valid windowStart/windowEnd required')
    if (end <= start) throw new BadRequestException('windowEnd must be after windowStart')

    const dockId = input.dockId ?? null
    if (dockId) {
      const dock = await this.prisma.dock.findUnique({ where: { id: dockId } })
      if (!dock || dock.facilityId !== input.facilityId) throw new BadRequestException('Dock does not belong to this facility')
      if (dock.status === 'maintenance') throw new BadRequestException('Dock is under maintenance')
      // Overlap guard: no other non-cancelled appointment on this dock in the window.
      const clash = await this.prisma.scheduledAppointment.findFirst({
        where: {
          dockId,
          status: { notIn: ['cancelled', 'no_show'] },
          OR: [
            { windowStart: { lt: end }, windowEnd: { gt: start } },
          ],
        },
      })
      if (clash) throw new BadRequestException('Dock is already booked in this window')
    }

    const myOrgs = await this.orgAccess.userOrgs(user)
    const orgId = input.orgId ?? myOrgs[0]?.id ?? null
    const appointment = await this.prisma.scheduledAppointment.create({
      data: {
        ref: `APPT-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 9 + 1)}`,
        facilityId: input.facilityId,
        dockId: dockId ?? undefined,
        orgId,
        shipmentId: input.shipmentId,
        vehicleNo: input.vehicleNo,
        containerId: input.containerId,
        windowStart: start,
        windowEnd: end,
        cargoPieces: input.cargoPieces,
        cargoWeightKg: input.cargoWeightKg,
        note: input.note,
        createdBy: user.id,
      },
      include: { facility: { select: { id: true, name: true } }, dock: { select: { id: true, name: true } } },
    })
    if (dockId) {
      await this.prisma.dock.update({ where: { id: dockId }, data: { status: 'busy', busyUntil: end } }).catch(() => {})
    }
    await this.audit.log({ actorId: user.id, action: 'appointment.create', resource: appointment.id, after: { ref: appointment.ref, dockId } })
    return { appointment }
  }

  async listAppointments(user: User, query?: { facilityId?: string; status?: string; date?: string }) {
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    const where: Record<string, unknown> = {}
    if (query?.facilityId) where.facilityId = query.facilityId
    if (query?.status) where.status = query.status
    if (query?.date) {
      const day = new Date(query.date)
      const next = new Date(day.getTime() + 86400000)
      where.windowStart = { gte: day, lt: next }
    }
    if (!isAdmin) {
      const orgIds = await this.orgAccess.memberOrgIds(user)
      const myFacilities = await this.prisma.facility.findMany({ where: { operatorId: { in: orgIds } }, select: { id: true } })
      where.OR = [{ orgId: { in: orgIds } }, { facilityId: { in: myFacilities.map((f) => f.id) } }]
    }
    const appointments = await this.prisma.scheduledAppointment.findMany({
      where: where as never,
      include: {
        facility: { select: { id: true, name: true, city: true } },
        dock: { select: { id: true, name: true } },
        org: { select: { id: true, name: true } },
        container: { select: { id: true, number: true, type: true } },
      },
      orderBy: { windowStart: 'asc' },
      take: 200,
    })
    return { appointments }
  }

  async getAppointment(appointmentId: string, user: User) {
    await this.requireAppointmentAccess(user, appointmentId)
    const appointment = await this.prisma.scheduledAppointment.findUnique({
      where: { id: appointmentId },
      include: {
        facility: { select: { id: true, name: true, city: true } },
        dock: { select: { id: true, name: true } },
        org: { select: { id: true, name: true } },
        container: { select: { id: true, number: true, type: true } },
        shipment: { select: { id: true, ref: true } },
      },
    })
    return { appointment }
  }

  /** Move an appointment through the gate lifecycle and record gate events. */
  async transition(appointmentId: string, status: string, user: User) {
    await this.requireAppointmentAccess(user, appointmentId)
    const appointment = await this.prisma.scheduledAppointment.findUnique({ where: { id: appointmentId } })
    if (!appointment) throw new NotFoundException('Appointment not found')
    if (!APPT_TRANSITIONS[appointment.status]?.includes(status)) {
      throw new BadRequestException(`Cannot move appointment ${appointment.status} → ${status}`)
    }
    const data: Record<string, unknown> = { status }
    if (status === 'in_progress') data.gateInAt = new Date()
    if (status === 'completed') data.gateOutAt = new Date()
    const updated = await this.prisma.scheduledAppointment.update({ where: { id: appointmentId }, data })
    // Release the dock once the appointment completes or is cancelled/no-show.
    if (appointment.dockId && ['completed', 'cancelled', 'no_show'].includes(status)) {
      await this.prisma.dock.updateMany({ where: { id: appointment.dockId }, data: { status: 'available', busyUntil: null } }).catch(() => {})
    }
    await this.audit.log({ actorId: user.id, action: 'appointment.transition', resource: appointmentId, after: { status } })
    return { appointment: updated }
  }
}