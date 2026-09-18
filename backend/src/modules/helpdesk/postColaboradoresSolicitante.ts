import type { Request, Response } from 'express'
import { Timestamp } from 'firebase-admin/firestore'
import { logError } from '../../lib/log.js'
import { emitHelpdeskColaboradorSolicitanteNotification } from '../notifications/emitHelpdeskColaboradorSolicitante.js'
import { resolveColaboradorProfileByEmail } from './resolveColaboradorProfile.js'
import { getHelpdeskTicketById, updateHelpdeskTicketFields } from './repository.js'
import {
  isTicketRequester,
  syncColaboradorIndexFields,
} from './ticketCollaboratorAccess.js'
import type { HelpdeskColaboradorSolicitante, HelpdeskColaboradorSolicitanteRol } from './types.js'

function parseRol(value: unknown): HelpdeskColaboradorSolicitanteRol | null {
  if (value === 'lector' || value === 'editor') return value
  return null
}

export async function postColaboradoresSolicitanteHandler(req: Request, res: Response): Promise<void> {
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

  const body = req.body as Record<string, unknown> | null
  const emailRaw = body && typeof body.email === 'string' ? body.email.trim() : ''
  const rol = body ? parseRol(body.rol) : null
  if (!emailRaw) {
    res.status(400).json({ error: 'email es obligatorio' })
    return
  }
  if (!rol) {
    res.status(400).json({ error: "rol debe ser 'lector' o 'editor'" })
    return
  }

  try {
    const ticket = await getHelpdeskTicketById(ticketId)
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }

    if (!isTicketRequester(user, ticket)) {
      res.status(403).json({ error: 'Solo el solicitante original puede invitar colaboradores' })
      return
    }

    const profile = await resolveColaboradorProfileByEmail(emailRaw)
    if (!profile) {
      res.status(400).json({ error: 'Email inválido o fuera del dominio corporativo' })
      return
    }

    const requesterEmail = ticket.requesterEmail.trim().toLowerCase()
    if (profile.email === requesterEmail) {
      res.status(409).json({ error: 'No podés invitarte a vos mismo como colaborador' })
      return
    }

    const existing = ticket.colaboradoresSolicitante ?? []
    if (existing.some((c) => c.email.trim().toLowerCase() === profile.email)) {
      res.status(409).json({ error: 'Esa persona ya está invitada' })
      return
    }

    const row: HelpdeskColaboradorSolicitante = {
      email: profile.email,
      uid: profile.uid,
      nombre: profile.nombre,
      rol,
      addedAt: Timestamp.now(),
    }

    const colaboradoresSolicitante = [...existing, row]
    const indexFields = syncColaboradorIndexFields(colaboradoresSolicitante)

    await updateHelpdeskTicketFields(ticketId, {
      colaboradoresSolicitante,
      ...indexFields,
    })

    void emitHelpdeskColaboradorSolicitanteNotification({
      ticketId,
      areaNombre: ticket.areaNombre,
      colaboradorEmail: profile.email,
      colaboradorUid: profile.uid,
      rol,
      actor: user,
    })
    res.status(201).json({ ticketId, email: profile.email, rol })
  } catch (err) {
    logError('postColaboradoresSolicitante falló', err)
    res.status(500).json({ error: 'No se pudo invitar colaborador' })
  }
}
