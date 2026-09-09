import type { Request, Response } from 'express'
import { logError } from '../../lib/log.js'
import { writeAuditLogBestEffort } from '../audit/writeAuditLog.js'
import { getRagConfig } from '../rag/config.js'
import { isPilotAccessAllowed } from '../rag/pilotAccess.js'
import { executeCalendarCancel } from './executeCalendarCancel.js'
import { executeCalendarCreate } from './executeCalendarCreate.js'
import { executeEmailSend } from './executeEmailSend.js'
import {
  getPendingActionForUser,
  isPendingActionExpired,
  markPendingActionStatus,
} from './pendingActionStore.js'
import type {
  AssistantActionConfirmResult,
  CalendarActionPayload,
  CalendarCancelActionPayload,
  EmailActionPayload,
} from './types.js'

export async function confirmAssistantAction(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const actionId = typeof req.params.actionId === 'string' ? req.params.actionId.trim() : ''
  if (!actionId) {
    res.status(400).json({ error: 'Acción inválida' })
    return
  }

  try {
    const config = await getRagConfig()
    if (!isPilotAccessAllowed(config, user)) {
      res.status(403).json({ error: 'No tenés acceso al asistente.' })
      return
    }

    const pending = await getPendingActionForUser(actionId, user.uid)
    if (!pending) {
      res.status(404).json({ error: 'Acción no encontrada' })
      return
    }

    const { data } = pending
    if (data.status === 'confirmed') {
      res.status(409).json({ error: 'Esta acción ya fue confirmada.' })
      return
    }
    if (data.status === 'cancelled') {
      res.status(409).json({ error: 'Esta acción fue cancelada.' })
      return
    }
    if (data.status !== 'pending' || isPendingActionExpired(data)) {
      await markPendingActionStatus(actionId, 'expired')
      res.status(410).json({ error: 'El borrador expiró. Pedile al asistente que lo prepare de nuevo.' })
      return
    }

    let result: Record<string, unknown>
    let message: string

    if (data.type === 'email') {
      const payload = data.payload as EmailActionPayload
      const sent = await executeEmailSend({
        impersonateAs: data.impersonateAs,
        payload,
      })
      result = sent
      message = `Correo enviado a ${payload.to.join(', ')}.`

      await writeAuditLogBestEffort({
        userId: user.uid,
        userEmail: user.email,
        action: 'assistant_email_sent',
        targetType: 'resource',
        targetId: actionId,
        targetName: payload.subject,
        parentFolderId: null,
        mimeType: null,
        reason: null,
        metadata: {
          source: 'rag_assistant',
          pendingActionId: actionId,
          impersonateAs: data.impersonateAs,
          to: payload.to,
          cc: payload.cc,
          subject: payload.subject,
          bodyPreview: payload.body.slice(0, 500),
          messageId: sent.messageId,
        },
      })
    } else if (data.type === 'calendar_cancel') {
      const payload = data.payload as CalendarCancelActionPayload
      const cancelled = await executeCalendarCancel({
        impersonateAs: data.impersonateAs,
        payload,
      })
      result = cancelled
      message = `Evento "${payload.title}" cancelado en tu calendario.`

      await writeAuditLogBestEffort({
        userId: user.uid,
        userEmail: user.email,
        action: 'assistant_calendar_event_cancelled',
        targetType: 'resource',
        targetId: actionId,
        targetName: payload.title,
        parentFolderId: null,
        mimeType: null,
        reason: null,
        metadata: {
          source: 'rag_assistant',
          pendingActionId: actionId,
          impersonateAs: data.impersonateAs,
          startDateTime: payload.startDateTime,
          endDateTime: payload.endDateTime,
          timeZone: payload.timeZone,
          attendees: payload.attendees,
          eventId: payload.eventId,
        },
      })
    } else {
      const payload = data.payload as CalendarActionPayload
      const created = await executeCalendarCreate({
        impersonateAs: data.impersonateAs,
        payload,
      })
      result = created
      message = `Evento "${payload.title}" creado en tu calendario.`

      await writeAuditLogBestEffort({
        userId: user.uid,
        userEmail: user.email,
        action: 'assistant_calendar_event_created',
        targetType: 'resource',
        targetId: actionId,
        targetName: payload.title,
        parentFolderId: null,
        mimeType: null,
        reason: null,
        metadata: {
          source: 'rag_assistant',
          pendingActionId: actionId,
          impersonateAs: data.impersonateAs,
          startDateTime: payload.startDateTime,
          endDateTime: payload.endDateTime,
          timeZone: payload.timeZone,
          attendees: payload.attendees,
          location: payload.location,
          addGoogleMeet: payload.addGoogleMeet === true,
          eventId: created.eventId,
          htmlLink: created.htmlLink,
          hangoutLink: created.hangoutLink,
        },
      })
    }

    await markPendingActionStatus(actionId, 'confirmed', result)

    const body: AssistantActionConfirmResult = {
      ok: true,
      actionId,
      type: data.type,
      message,
      result,
    }
    res.json(body)
  } catch (err) {
    logError('Confirmación de acción del asistente falló', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'No se pudo ejecutar la acción',
    })
  }
}

export async function cancelAssistantAction(req: Request, res: Response): Promise<void> {
  const user = req.authedUser
  if (!user) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }

  const actionId = typeof req.params.actionId === 'string' ? req.params.actionId.trim() : ''
  if (!actionId) {
    res.status(400).json({ error: 'Acción inválida' })
    return
  }

  try {
    const config = await getRagConfig()
    if (!isPilotAccessAllowed(config, user)) {
      res.status(403).json({ error: 'No tenés acceso al asistente.' })
      return
    }

    const pending = await getPendingActionForUser(actionId, user.uid)
    if (!pending) {
      res.status(404).json({ error: 'Acción no encontrada' })
      return
    }

    if (pending.data.status === 'confirmed') {
      res.status(409).json({ error: 'Esta acción ya fue confirmada y no se puede cancelar.' })
      return
    }

    await markPendingActionStatus(actionId, 'cancelled')
    res.json({ ok: true, actionId, status: 'cancelled' })
  } catch (err) {
    logError('Cancelación de acción del asistente falló', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : 'No se pudo cancelar la acción',
    })
  }
}
