import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { parseMultipartUpload } from '../drive/parseMultipartUpload.js'
import { createHelpdeskBitacoraEntrada, getHelpdeskBitacoraEntradaById } from './bitacoraRepository.js'
import {
  bitacoraVisibleForTicket,
  canAccessHelpdeskBitacora,
  canPostHelpdeskBitacoraAsRequesterSide,
} from './bitacoraAccess.js'
import { uploadHelpdeskDocumentToDrive } from './helpdeskDriveUpload.js'
import { serializeHelpdeskBitacoraEntrada } from './serializeBitacora.js'
import { Timestamp } from 'firebase-admin/firestore'
import { getHelpdeskTicketById } from './repository.js'
import { markHelpdeskVistoSeccion } from './vistoPorRepository.js'

const MAX_TEXTO = 5000

export async function postTicketBitacoraHandler(req: Request, res: Response): Promise<void> {
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

  const texto = (parsed.fields.texto ?? '').trim()
  if (!texto) {
    res.status(400).json({ error: 'texto es obligatorio' })
    return
  }
  if (texto.length > MAX_TEXTO) {
    res.status(400).json({ error: `texto no puede superar ${MAX_TEXTO} caracteres` })
    return
  }

  try {
    const ticket = await getHelpdeskTicketById(ticketId)
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }

    const access = await canAccessHelpdeskBitacora(user, ticket)
    if (!access) {
      res.status(403).json({ error: 'No autorizado' })
      return
    }
    if (!bitacoraVisibleForTicket(ticket)) {
      res.status(409).json({ error: 'La bitácora no está disponible en este estado del proyecto' })
      return
    }

    const uploadedFile = parsed.file
    let adjuntoDriveLink: string | null = null

    if (access === 'requester' && !canPostHelpdeskBitacoraAsRequesterSide(user, ticket)) {
      res.status(403).json({ error: 'Como lector solo podés ver la bitácora, no comentar' })
      return
    }

    if (access === 'team') {
      if (uploadedFile) {
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
        adjuntoDriveLink = upload.webViewLink
      }
      const entradaId = await createHelpdeskBitacoraEntrada({
        ticketId,
        entrada: {
          autorNombre: user.displayName?.trim() || user.email,
          autorEmail: user.email,
          tipo: 'avance',
          texto,
          adjuntoDriveLink,
        },
      })
      const createdEntrada = await getHelpdeskBitacoraEntradaById(ticketId, entradaId)
      const vistoAt = createdEntrada?.createdAt ?? Timestamp.now()
      await markHelpdeskVistoSeccion(ticketId, user.uid, 'bitacora', vistoAt)
      res.status(201).json({ entradaId, ticketId, tipo: 'avance' })
      return
    }

    if (uploadedFile) {
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
      adjuntoDriveLink = upload.webViewLink
    }

    const entradaId = await createHelpdeskBitacoraEntrada({
      ticketId,
      entrada: {
        autorNombre: user.displayName?.trim() || user.email,
        autorEmail: user.email,
        tipo: 'comentario',
        texto,
        adjuntoDriveLink,
      },
    })

    const created = {
      id: entradaId,
      autorNombre: user.displayName?.trim() || user.email,
      autorEmail: user.email.trim().toLowerCase(),
      tipo: 'comentario' as const,
      texto,
      adjuntoDriveLink,
      createdAt: undefined,
    }
    res.status(201).json({
      entradaId,
      ticketId,
      tipo: 'comentario',
      entrada: serializeHelpdeskBitacoraEntrada(created),
    })
  } catch (err) {
    logError('postTicketBitacora falló', err)
    res.status(500).json({ error: 'No se pudo publicar en la bitácora' })
  }
}
