import {
  PASSIVE_NOTIFICATION_TYPES,
  type NotificationActor,
  type PlannedNotification,
} from './types.js'
import { writeNotificationsBestEffort } from './writeNotification.js'

const STATUS_LABELS: Record<string, string> = {
  open: 'Recibido',
  'in-progress': 'En atención',
  resolved: 'Resuelto',
  closed: 'Cerrado',
}

/** ST no tiene identidad en Bacarnet: el cambio lo origina el sistema de tickets, no un usuario. */
const ST_ACTOR: NotificationActor = {
  uid: 'system:st-tickets',
  email: 'soporte-ti@bacarsa.com.ar',
  displayName: 'Tickets',
}

/** La campanita ya rotula «Ticket de soporte», así que el título solo aporta el estado. */
const STATUS_TITLES: Record<string, string> = {
  open: 'Pedido recibido',
  'in-progress': 'Pedido en atención',
  resolved: 'Pedido resuelto',
  closed: 'Pedido cerrado',
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

function buildBody(input: { status: string; previousStatus?: string | null; source?: string | null }): string {
  const nuevo = statusLabel(input.status)
  if (input.status === 'resolved') {
    return `Tu pedido fue marcado como Resuelto. Si el problema sigue, podés reabrirlo desde Tickets.`
  }
  if (input.status === 'closed') {
    return input.source === 'cron'
      ? 'Tu pedido se cerró automáticamente por inactividad después de haber sido resuelto.'
      : 'Tu pedido fue cerrado.'
  }
  if (input.previousStatus && input.previousStatus !== input.status) {
    return `Tu pedido pasó de ${statusLabel(input.previousStatus)} a ${nuevo}.`
  }
  return `Tu pedido pasó a ${nuevo}.`
}

/**
 * Notificación in-app al solicitante cuando ST cambia el estado de su ticket.
 * Best effort: nunca debe hacer fallar la respuesta del webhook a ST.
 */
export async function emitStTicketStatusChangedNotification(input: {
  recipientUid: string
  stTicketId: number
  title: string
  status: string
  previousStatus?: string | null
  source?: string | null
  changedAt?: string | null
}): Promise<void> {
  const planned: PlannedNotification = {
    recipientUid: input.recipientUid,
    type: PASSIVE_NOTIFICATION_TYPES.ST_TICKET_STATUS_CHANGED,
    category: 'passive',
    actor: ST_ACTOR,
    title: STATUS_TITLES[input.status] ?? `Pedido ${statusLabel(input.status)}`,
    body: `${input.title ? `«${input.title}». ` : ''}${buildBody(input)}`,
    deepLink: { path: '/soporte-ti' },
    context: {
      stTicketId: input.stTicketId,
      ticketTitle: input.title || null,
      status: input.status,
      previousStatus: input.previousStatus ?? null,
      source: input.source ?? null,
      changedAt: input.changedAt ?? null,
    },
    // changedAt hace único cada cambio y a la vez idempotente si ST reintenta el mismo webhook.
    dedupeKey: [
      PASSIVE_NOTIFICATION_TYPES.ST_TICKET_STATUS_CHANGED,
      input.stTicketId,
      input.previousStatus ?? '',
      input.status,
      input.changedAt ?? '',
      input.recipientUid,
    ].join(':'),
  }

  await writeNotificationsBestEffort([planned])
}
