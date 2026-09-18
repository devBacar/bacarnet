import { timingSafeEqual } from 'node:crypto'
import type { Request, Response } from 'express'
import { getEnv } from '../../config/env.js'
import { logError } from '../../lib/log.js'
import { emitStTicketStatusChangedNotification } from '../notifications/emitStTicketStatusChanged.js'
import {
  addStAttachments,
  addStComment,
  createStTicket,
  fetchStCatalog,
  fetchStComments,
  fetchStTicket,
  StApiError,
  updateStStatus,
} from './client.js'
import { parseStMultipart } from './multipart.js'
import {
  appendStTicketAttachments,
  createStTicketLink,
  getStTicketLink,
  listStTicketLinksForOwner,
  requireOwnedStTicketLink,
  updateStTicketLinkStatus,
} from './repository.js'
import type { StTicketAttachment, StTicketAction, StTicketStatus } from './types.js'

function parseTicketId(req: Request): number {
  const id = Number.parseInt(String(req.params.stTicketId ?? ''), 10)
  if (!Number.isInteger(id) || id <= 0) throw Object.assign(new Error('Ticket inválido'), { statusCode: 400 })
  return id
}

function userContext(req: Request) {
  const user = req.authedUser
  if (!user) throw Object.assign(new Error('No autenticado'), { statusCode: 401 })
  return {
    uid: user.uid,
    email: user.email.trim().toLowerCase(),
    nombre: user.displayName.trim() || user.email.split('@')[0],
  }
}

function sendError(res: Response, err: unknown, fallback: string): void {
  const status =
    err instanceof StApiError
      ? err.status
      : (err as Error & { statusCode?: number })?.statusCode ?? 500
  if (status >= 500) logError(fallback, err)
  res.status(status).json({ error: err instanceof Error ? err.message : fallback })
}

function normalizeAttachments(value: unknown): StTicketAttachment[] {
  if (!Array.isArray(value)) return []
  const baseUrl = getEnv().stTicketsBaseUrl
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    if (typeof row.id !== 'number' || typeof row.file_name !== 'string') return []
    const filePath = String(row.file_path ?? '').replaceAll('\\', '/').replace(/^\/+/, '')
    return [{
      ...(row as unknown as StTicketAttachment),
      url: filePath ? `${baseUrl}/${filePath}` : undefined,
    }]
  })
}

export async function getStCatalogHandler(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await fetchStCatalog())
  } catch (err) {
    sendError(res, err, 'No se pudo obtener el catálogo de ST')
  }
}

export async function createStTicketHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = userContext(req)
    const { fields, files } = await parseStMultipart(req)
    const outbound = {
      requesterEmail: user.email,
      requesterNombre: user.nombre,
      title: fields.title?.trim() ?? '',
      description: fields.description?.trim() ?? '',
      priority: fields.priority?.trim() || 'medium',
      department_id: fields.department_id?.trim() ?? '',
      category_id: fields.category_id?.trim() ?? '',
      predefined_problem_id: fields.predefined_problem_id?.trim() ?? '',
    }
    if (!outbound.title || !outbound.description || !outbound.department_id || !outbound.category_id) {
      res.status(400).json({ error: 'Título, descripción, categoría y área son obligatorios' })
      return
    }

    const created = await createStTicket(outbound, files)
    const attachments = normalizeAttachments(created.attachments)
    await createStTicketLink({
      stTicketId: created.stTicketId,
      ownerUid: user.uid,
      requesterEmail: user.email,
      requesterNombre: user.nombre,
      title: outbound.title,
      description: outbound.description,
      priority: outbound.priority,
      departmentId: Number(outbound.department_id),
      categoryId: Number(outbound.category_id),
      status: created.status as StTicketStatus,
      attachments,
    })
    res.status(201).json({ ...created, attachments })
  } catch (err) {
    sendError(res, err, 'No se pudo crear el ticket en ST')
  }
}

export async function listMyStTicketsHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = userContext(req)
    const tickets = await listStTicketLinksForOwner(user.uid)
    res.json({
      tickets: tickets.map((ticket) => ({
        ...ticket,
        createdAt: ticket.createdAt?.toDate?.().toISOString() ?? null,
        updatedAt: ticket.updatedAt?.toDate?.().toISOString() ?? null,
      })),
    })
  } catch (err) {
    sendError(res, err, 'No se pudieron listar los tickets')
  }
}

export async function getStTicketDetailHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = userContext(req)
    const id = parseTicketId(req)
    const link = await requireOwnedStTicketLink(id, user.uid)
    const remote = await fetchStTicket(id)
    const status = remote.data.status
    if (typeof status === 'string' && status !== link.status) {
      await updateStTicketLinkStatus(id, status as StTicketStatus)
    }
    res.json({ ...remote, link: { ...link, status: status ?? link.status } })
  } catch (err) {
    sendError(res, err, 'No se pudo obtener el ticket')
  }
}

export async function getStCommentsHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = userContext(req)
    const id = parseTicketId(req)
    const link = await requireOwnedStTicketLink(id, user.uid)
    res.json(await fetchStComments(id, link.requesterEmail))
  } catch (err) {
    sendError(res, err, 'No se pudieron obtener los comentarios')
  }
}

export async function postStCommentHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = userContext(req)
    const id = parseTicketId(req)
    const link = await requireOwnedStTicketLink(id, user.uid)
    const texto = typeof req.body?.texto === 'string' ? req.body.texto.trim() : ''
    if (!texto) {
      res.status(400).json({ error: 'texto es obligatorio' })
      return
    }
    res.status(201).json(await addStComment(id, link.requesterEmail, texto))
  } catch (err) {
    sendError(res, err, 'No se pudo agregar el comentario')
  }
}

export async function postStAttachmentsHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = userContext(req)
    const id = parseTicketId(req)
    const link = await requireOwnedStTicketLink(id, user.uid)
    const { files } = await parseStMultipart(req)
    if (files.length === 0) {
      res.status(400).json({ error: 'Debés adjuntar al menos un archivo' })
      return
    }
    const remote = await addStAttachments(id, link.requesterEmail, files)
    const attachments = normalizeAttachments(remote.data)
    await appendStTicketAttachments(id, attachments)
    res.status(201).json({ ...remote, data: attachments })
  } catch (err) {
    sendError(res, err, 'No se pudieron subir los adjuntos')
  }
}

export async function putStStatusHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = userContext(req)
    const id = parseTicketId(req)
    const link = await requireOwnedStTicketLink(id, user.uid)
    const accion = req.body?.accion as StTicketAction
    if (accion !== 'reabrir' && accion !== 'cerrar') {
      res.status(400).json({ error: "accion debe ser 'reabrir' o 'cerrar'" })
      return
    }
    const remote = await updateStStatus(id, link.requesterEmail, accion)
    await updateStTicketLinkStatus(id, remote.data.status as StTicketStatus)
    res.json(remote)
  } catch (err) {
    sendError(res, err, 'No se pudo actualizar el estado')
  }
}

export async function stStatusWebhookHandler(req: Request, res: Response): Promise<void> {
  const expected = getEnv().stTicketsApiKey
  const provided = typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'].trim() : ''
  const valid =
    Boolean(expected && provided) &&
    Buffer.byteLength(expected) === Buffer.byteLength(provided) &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
  if (!valid) {
    res.status(401).json({ error: 'API key inválida' })
    return
  }
  const stTicketId = Number(req.body?.stTicketId)
  const status = req.body?.status
  if (!Number.isInteger(stTicketId) || typeof status !== 'string') {
    res.status(400).json({ error: 'Payload inválido' })
    return
  }
  try {
    const link = await getStTicketLink(stTicketId)
    if (!link) {
      res.json({ ok: true, skipped: true })
      return
    }
    const previousStatus = typeof req.body?.previousStatus === 'string' ? req.body.previousStatus : link.status
    await updateStTicketLinkStatus(stTicketId, status as StTicketStatus)

    // source 'client' es el propio solicitante (reabrir/cerrar): no tiene sentido avisarle de su acción.
    const source = typeof req.body?.source === 'string' ? req.body.source : null
    const notified = Boolean(link.ownerUid) && source !== 'client' && previousStatus !== status
    if (notified) {
      await emitStTicketStatusChangedNotification({
        recipientUid: link.ownerUid,
        stTicketId,
        title: typeof req.body?.title === 'string' ? req.body.title : link.title,
        status,
        previousStatus,
        source,
        changedAt: typeof req.body?.changedAt === 'string' ? req.body.changedAt : null,
      })
    }
    res.json({ ok: true, notified })
  } catch (err) {
    sendError(res, err, 'No se pudo procesar el webhook de ST')
  }
}
