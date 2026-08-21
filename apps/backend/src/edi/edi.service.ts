import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { OrgAccessService } from '../org-access/org-access.service'
import type { User } from '@prisma/client'

/**
 * Minimal but real X12 and EDIFACT parsing/generation.
 *
 * X12    : segments separated by '~', elements by '*', sub-elements by ':'.
 * EDIFACT: segments separated by "'", elements by '+', sub-elements by ':'.
 *
 * We parse the envelope (ISA/GS/ST for X12; UNB/UNG/UNH for EDIFACT), extract
 * the document type + control numbers, then map to a canonical payload for the
 * document types the network understands (PO / ASN / load tender / ack).
 */

interface ParsedMessage {
  format: 'X12' | 'EDIFACT'
  documentType: string
  segments: string[][]
  interchangeId?: string
  controlNumber?: string
  payload: Record<string, unknown>
}

const X12_DOCS: Record<string, string> = {
  '850': 'PO',
  '855': 'PO_ACK',
  '856': 'ASN',
  '997': 'ACK',
  '204': 'LOAD_TENDER',
  '214': 'STATUS',
  '210': 'INVOICE',
}

const EDIFACT_DOCS: Record<string, string> = {
  ORDERS: 'PO',
  ORDRSP: 'PO_ACK',
  DESADV: 'ASN',
  IFTMIN: 'LOAD_TENDER',
  CUSCAR: 'CUSTOMS',
  INVOIC: 'INVOICE',
}

@Injectable()
export class EdiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orgAccess: OrgAccessService,
  ) {}

  /** Split a raw message into its raw segments (kept verbatim). */
  private segmentize(raw: string, format: 'X12' | 'EDIFACT'): string[] {
    const sep = format === 'X12' ? '~' : "'"
    return raw
      .split(sep)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  private elementize(seg: string, format: 'X12' | 'EDIFACT'): string[] {
    const sep = format === 'X12' ? '*' : '+'
    return seg.split(sep).map((s) => s.trim())
  }

  /** Parse raw EDI text into segments + envelope + document type. */
  parse(raw: string): ParsedMessage {
    const text = raw.trim()
    if (!text) throw new BadRequestException('Empty EDI message')

    const x12ish = text.includes('ISA') && text.includes('~')
    const edifactish = text.includes('UNB') && text.includes("'")
    let format: 'X12' | 'EDIFACT'
    if (x12ish) format = 'X12'
    else if (edifactish) format = 'EDIFACT'
    else throw new BadRequestException('Unrecognized EDI format (expected X12 or EDIFACT envelope)')

    const segmentStrings = this.segmentize(text, format)
    const segments = segmentStrings.map((s) => this.elementize(s, format))

    let documentType = 'UNKNOWN'
    let interchangeId: string | undefined
    let controlNumber: string | undefined

    if (format === 'X12') {
      const isa = segments.find((s) => s[0] === 'ISA')
      interchangeId = isa?.[6] // receiver id (as sent)
      const st = segments.find((s) => s[0] === 'ST')
      documentType = X12_DOCS[st?.[1] ?? ''] ?? st?.[1] ?? 'UNKNOWN'
      controlNumber = st?.[2]
    } else {
      const unb = segments.find((s) => s[0] === 'UNB')
      interchangeId = unb?.[2] // recipient id (who the message is sent to)
      const unh = segments.find((s) => s[0] === 'UNH')
      controlNumber = unh?.[1]
      const msgType = unh?.[2]?.split(':')[0]
      documentType = EDIFACT_DOCS[msgType ?? ''] ?? msgType ?? 'UNKNOWN'
    }

    return { format, documentType, segments, interchangeId, controlNumber, payload: {} }
  }

  /** Map the parsed segments to a canonical payload for known doc types. */
  private mapPayload(parsed: ParsedMessage): Record<string, unknown> {
    const payload: Record<string, unknown> = { documentType: parsed.documentType }
    const segs = parsed.segments
    if (parsed.format === 'X12') {
      if (parsed.documentType === 'PO' || parsed.documentType === 'PO_ACK') {
        const beg = segs.find((s) => s[0] === 'BEG')
        payload.purchaseOrder = { poNumber: beg?.[3], date: beg?.[5], type: beg?.[1] }
      } else if (parsed.documentType === 'ASN') {
        const shp = segs.find((s) => s[0] === 'BSN')
        payload.asn = { shipmentId: shp?.[2], date: shp?.[3] }
      } else if (parsed.documentType === 'LOAD_TENDER') {
        const b2 = segs.find((s) => s[0] === 'B2')
        payload.loadTender = { reference: b2?.[5] }
      }
    } else {
      if (parsed.documentType === 'PO') {
        const bpm = segs.find((s) => s[0] === 'BGM')
        payload.purchaseOrder = { poNumber: bpm?.[1]?.[1], type: bpm?.[1]?.[0] }
      } else if (parsed.documentType === 'ASN') {
        const bgn = segs.find((s) => s[0] === 'BGM')
        payload.asn = { reference: bgn?.[1]?.[1] }
      } else if (parsed.documentType === 'LOAD_TENDER') {
        const tdt = segs.find((s) => s[0] === 'TDT')
        payload.loadTender = { transportMode: tdt?.[1] }
      }
    }
    return payload
  }

  /** Capture an inbound EDI message from a partner; persist verbatim + mapped. */
  async receive(input: { orgId: string; partnerOrgId?: string; raw: string }, user: User) {
    const parsed = this.parse(input.raw)
    const payload = this.mapPayload(parsed)
    const message = await this.prisma.ediMessage.create({
      data: {
        orgId: input.orgId,
        partnerOrgId: input.partnerOrgId,
        direction: 'inbound',
        format: parsed.format,
        documentType: parsed.documentType,
        interchangeId: parsed.interchangeId,
        controlNumber: parsed.controlNumber,
        raw: input.raw,
        segments: parsed.segments as never,
        payload: payload as never,
        status: 'received',
      },
    })
    await this.audit.log({ actorId: user.id, action: 'edi.receive', resource: message.id, after: { documentType: parsed.documentType } })
    return { message }
  }

  /** Generate an outbound X12 message for a document type + payload. */
  generate(input: { orgId: string; partnerOrgId?: string; documentType: string; payload: Record<string, unknown> }, _user: User) {
    const dt = input.documentType.toUpperCase()
    const format: 'X12' | 'EDIFACT' = input.payload.format === 'EDIFACT' ? 'EDIFACT' : 'X12'

    let body: string
    let canonicalType: string
    if (format === 'X12') {
      const poNum = String(input.payload.poNumber ?? input.payload.reference ?? '')
      const segments: string[] = []
      if (dt === 'PO' || dt === 'PO_ACK') {
        segments.push(`BEG*00*SA*${poNum}**${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`)
      } else if (dt === 'ASN') {
        segments.push(`BSN*00*${poNum}*${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`)
      } else if (dt === 'LOAD_TENDER') {
        segments.push(`B2*${poNum}`)
      } else if (dt === 'ACK') {
        segments.push(`AK1*${poNum}`)
      }
      const code = Object.entries(X12_DOCS).find(([, v]) => v === dt)?.[0] ?? '997'
      body = `ISA*00*          *00*          *ZZ*WAGON        *ZZ*PARTNER      *${new Date().toISOString().slice(0, 12).replace(/[-:]/g, '')}*U*00401*000000001*0*P*>~GS*${code}*WAGON*PARTNER*${new Date().toISOString().slice(0, 10).replace(/-/g, '')}*0000*1*X*004010~ST*${code}*0001~${segments.join('~')}~SE*${segments.length + 2}*0001~GE*1*1~IEA*1*000000001~`
      canonicalType = dt
    } else {
      const ref = String(input.payload.poNumber ?? input.payload.reference ?? '')
      const msgCode = Object.entries(EDIFACT_DOCS).find(([, v]) => v === dt)?.[0] ?? 'ORDERS'
      body = `UNB+UNOC:3+WAGON+PARTNER+${new Date().toISOString().slice(0, 10).replace(/-/g, '')}:0000+1'UNH+1+${msgCode}:D:97A:UN'BGM+${msgCode}+${ref}+9'TDT+20'UNS+S'CNT+2:1'UNT+6+1'UNZ+1+1'`
      canonicalType = dt
    }

    return { message: { format, documentType: canonicalType, raw: body } }
  }

  /** Persist + mark an outbound EDI message as sent. */
  async send(input: { orgId: string; partnerOrgId?: string; documentType: string; payload: Record<string, unknown> }, user: User) {
    const generated = this.generate(input, user)
    const message = await this.prisma.ediMessage.create({
      data: {
        orgId: input.orgId,
        partnerOrgId: input.partnerOrgId,
        direction: 'outbound',
        format: generated.message.format,
        documentType: generated.message.documentType,
        raw: generated.message.raw,
        segments: [] as never,
        payload: input.payload as never,
        status: 'sent',
      },
    })
    await this.audit.log({ actorId: user.id, action: 'edi.send', resource: message.id, after: { documentType: generated.message.documentType } })
    return { message }
  }

  async list(user: User, query?: { direction?: string; status?: string; documentType?: string }) {
    const isAdmin = (user.role === 'admin' || (user.capabilities as string[])?.includes('admin')) as boolean
    const where: Record<string, unknown> = {}
    if (query?.direction) where.direction = query.direction
    if (query?.status) where.status = query.status
    if (query?.documentType) where.documentType = query.documentType
    if (!isAdmin) {
      where.orgId = { in: await this.orgAccess.memberOrgIds(user) }
    }
    const messages = await this.prisma.ediMessage.findMany({
      where: where as never,
      include: { org: { select: { id: true, name: true } }, partnerOrg: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return { messages }
  }

  async get(id: string, _user: User) {
    const message = await this.prisma.ediMessage.findUnique({
      where: { id },
      include: { org: { select: { id: true, name: true } }, partnerOrg: { select: { id: true, name: true } } },
    })
    if (!message) throw new NotFoundException('EDI message not found')
    return { message }
  }
}