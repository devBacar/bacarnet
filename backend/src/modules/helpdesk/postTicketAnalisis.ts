import type { Request, Response } from 'express'
import { getEnv, isEmailInAllowedDomain } from '../../config/env.js'
import { logError } from '../../lib/log.js'
import { parseMultipartUpload } from '../drive/parseMultipartUpload.js'
import {
  createHelpdeskAnalisis,
  hasHelpdeskAnalisisPendiente,
  listHelpdeskAnalisisForTicket,
} from './analisisRepository.js'
import { HELPDESK_ANALISIS_DEFAULT_APROBADOR } from './types.js'
import {
  serializeHelpdeskAnalisis,
  shareHelpdeskDriveFileWithReaders,
  truncateProblematicaForEmail,
  uploadHelpdeskDocumentToDrive,
} from './helpdeskDriveUpload.js'
import { emitHelpdeskAnalisisPendienteNotifications } from '../notifications/emitHelpdeskAnalisisPendiente.js'
import { logHelpdeskEmailAvisoBestEffort } from './logHelpdeskEmailAviso.js'
import { notificarN8n } from './n8nWebhooks.js'
import { getHelpdeskTicketById } from './repository.js'
import { markHelpdeskVistoSeccionNowForUser } from './vistoPorRepository.js'

function parseAprobadoresEmails(raw: string | undefined): string[] {
  const parts = (raw ?? '')
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (parts.length === 0) {
    return [HELPDESK_ANALISIS_DEFAULT_APROBADOR]
  }
  return [...new Set(parts)]
}

export async function postTicketAnalisisHandler(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const ticketId = String(req.params.ticketId ?? '').trim()
  if (!ticketId) {
    res.status(400).json({ error: 'ticketId inválido' })
    return
  }

  let parsed
  try {
    parsed = await parseMultipartUpload(req)
  } catch (err) {
    if (err instanceof Error && err.message === 'UPLOAD_TOO_LARGE') {
      res.status(413).json({ error: 'El archivo supera el límite de 25 MB' })
      return
    }
    res.status(400).json({ error: 'No se pudo leer la carga multipart' })
    return
  }

  const uploadedFile = parsed.file
  if (!uploadedFile) {
    res.status(400).json({ error: 'file es obligatorio' })
    return
  }

  const domain = getEnv().allowedEmailDomain
  const aprobadoresEmails = parseAprobadoresEmails(parsed.fields.aprobadoresEmails)
  for (const email of aprobadoresEmails) {
    if (!isEmailInAllowedDomain(email, domain)) {
      res.status(400).json({ error: `Email de aprobador inválido: ${email}` })
      return
    }
  }

  try {
    const ticket = await getHelpdeskTicketById(ticketId)
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }
    if (ticket.cancelado === true) {
      res.status(409).json({ error: 'El proyecto está cancelado; reactivalo antes de subir análisis' })
      return
    }
    if (ticket.estadoIdx !== 2) {
      res.status(409).json({ error: 'Solo se puede subir análisis en estado Realizando análisis' })
      return
    }
    if (await hasHelpdeskAnalisisPendiente(ticketId)) {
      res.status(409).json({ error: 'Ya hay un análisis pendiente de aprobación' })
      return
    }

    const upload = await uploadHelpdeskDocumentToDrive({
      user,
      fileName: uploadedFile.originalname,
      mimeType: uploadedFile.mimetype,
      buffer: uploadedFile.buffer,
    })
    if (!upload.ok) {
      res.status(upload.status).json({ error: upload.error })
      return
    }

    await shareHelpdeskDriveFileWithReaders(upload.fileId, aprobadoresEmails)

    const subidoPorNombre = user.displayName?.trim() || user.email
    const analisisId = await createHelpdeskAnalisis({
      ticketId,
      data: {
        archivoDriveId: upload.fileId,
        archivoDriveLink: upload.webViewLink,
        subidoPorNombre,
        subidoPorEmail: user.email.trim().toLowerCase(),
        aprobadoresEmails,
        decididoPorEmail: null,
        decididoFecha: null,
        comentarioDecision: null,
      },
    })

    const { publicAppUrl } = getEnv()
    const appUrl = `${publicAppUrl}/aprobaciones-pendientes`
    const problematica = truncateProblematicaForEmail(ticket.problematica)

    for (const destinatarioEmail of aprobadoresEmails) {
      await notificarN8n('analisis_pendiente_aprobacion', {
        destinatarioEmail,
        ticketId,
        analisisId,
        area: ticket.areaNombre,
        problematica,
        archivoDriveLink: upload.webViewLink,
        subidoPorNombre,
        subidoPorEmail: user.email.trim().toLowerCase(),
        appUrl,
      })
      await logHelpdeskEmailAvisoBestEffort({
        tipo: 'analisis_pendiente_aprobacion',
        destinatarios: [destinatarioEmail],
        area: ticket.areaNombre,
        areaId: ticket.areaId ?? null,
        ticketId,
      })
    }

    void emitHelpdeskAnalisisPendienteNotifications({
      ticketId,
      analisisId,
      areaNombre: ticket.areaNombre,
      aprobadoresEmails,
      actor: user,
    })

    await markHelpdeskVistoSeccionNowForUser(ticketId, user.uid, 'analisis')

    const all = await listHelpdeskAnalisisForTicket(ticketId)
    const created = all.find((a) => a.id === analisisId)
    res.status(201).json({
      analisisId,
      analisis: created ? serializeHelpdeskAnalisis(created) : null,
    })
  } catch (err) {
    logError('postTicketAnalisis falló', err)
    res.status(500).json({ error: 'No se pudo registrar el análisis' })
  }
}
