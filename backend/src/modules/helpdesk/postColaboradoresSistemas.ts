import type { Request, Response } from 'express'
import { Timestamp } from 'firebase-admin/firestore'
import { logError } from '../../lib/log.js'
import { emitHelpdeskColaboradorSistemasNotification } from '../notifications/emitHelpdeskColaboradorSistemas.js'
import { logHelpdeskEmailAvisoBestEffort } from './logHelpdeskEmailAviso.js'
import {
  getHelpdeskTeamMemberById,
  getHelpdeskTicketById,
  updateHelpdeskTicketFields,
} from './repository.js'
import type { HelpdeskColaboradorSistemas } from './types.js'

export async function postColaboradoresSistemasHandler(req: Request, res: Response): Promise<void> {
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
  const teamMemberId =
    body && typeof body.teamMemberId === 'string' ? body.teamMemberId.trim() : ''
  if (!teamMemberId) {
    res.status(400).json({ error: 'teamMemberId es obligatorio' })
    return
  }

  try {
    const ticket = await getHelpdeskTicketById(ticketId)
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }

    const member = await getHelpdeskTeamMemberById(teamMemberId)
    if (!member || !member.activo) {
      res.status(400).json({ error: 'Miembro del equipo no encontrado o inactivo' })
      return
    }

    const existing = ticket.colaboradoresSistemas ?? []
    if (existing.some((c) => c.teamMemberId === teamMemberId)) {
      res.status(409).json({ error: 'Esa persona ya está en la lista de colaboradores' })
      return
    }
    if (ticket.asignadoATeamId === teamMemberId) {
      res.status(409).json({ error: 'El responsable ya figura como titular del proyecto' })
      return
    }

    const row: HelpdeskColaboradorSistemas = {
      teamMemberId,
      nombre: member.nombre.trim(),
      email: member.email.trim().toLowerCase(),
      addedByEmail: user.email.trim().toLowerCase(),
      addedAt: Timestamp.now(),
    }

    await updateHelpdeskTicketFields(ticketId, {
      colaboradoresSistemas: [...existing, row],
    })

    void emitHelpdeskColaboradorSistemasNotification({
      ticketId,
      areaNombre: ticket.areaNombre,
      teamMemberEmail: member.email,
      actor: user,
    })
    await logHelpdeskEmailAvisoBestEffort({
      tipo: 'colaborador_sistemas_agregado',
      destinatarios: [member.email],
      area: ticket.areaNombre,
      areaId: ticket.areaId ?? null,
      ticketId,
    })

    res.status(201).json({ ticketId, teamMemberId })
  } catch (err) {
    logError('postColaboradoresSistemas falló', err)
    res.status(500).json({ error: 'No se pudo agregar colaborador' })
  }
}
