import type { Timestamp } from 'firebase-admin/firestore'
import {
  serializeColaboradorSistemas,
} from './serializeColaboradores.js'
import {
  helpdeskEstadoLabelFromIdx,
  type HelpdeskEmailLog,
  type HelpdeskNota,
  type HelpdeskReunion,
  type HelpdeskTicket,
} from './types.js'

function timestampToIso(value: Timestamp | undefined): string | null {
  if (!value || typeof value.toDate !== 'function') return null
  return value.toDate().toISOString()
}

export function serializeHelpdeskReunion(reunion: HelpdeskReunion & { id: string }) {
  return {
    id: reunion.id,
    tipo: reunion.tipo,
    fecha: reunion.fecha,
    hora: reunion.hora,
    conTeamId: reunion.conTeamId,
    participantesTeamIds: reunion.participantesTeamIds,
    estado: reunion.estado,
    calendarEventId: reunion.calendarEventId ?? null,
    calendarHtmlLink: reunion.calendarHtmlLink ?? null,
    calendarOrganizerEmail: reunion.calendarOrganizerEmail ?? null,
    calendarError: reunion.calendarError ?? null,
    calendarErrorMessage: reunion.calendarErrorMessage ?? null,
    minuta: reunion.minuta
      ? {
          texto: reunion.minuta.texto,
          autorNombre: reunion.minuta.autorNombre,
          updatedAt: timestampToIso(reunion.minuta.updatedAt),
        }
      : null,
    minutaDiagnostico: reunion.minutaDiagnostico
      ? {
          ...reunion.minutaDiagnostico,
          updatedAt: timestampToIso(reunion.minutaDiagnostico.updatedAt),
        }
      : null,
    createdAt: timestampToIso(reunion.createdAt),
  }
}

export function serializeHelpdeskEmailLog(entry: HelpdeskEmailLog & { id: string }) {
  return {
    id: entry.id,
    fecha: timestampToIso(entry.fecha),
    tipo: entry.tipo,
    destinatarios: entry.destinatarios,
    area: entry.area ?? null,
    areaId: entry.areaId ?? null,
    ticketId: entry.ticketId ?? null,
    respondido: entry.respondido ?? null,
    fechaRespuesta: timestampToIso(entry.fechaRespuesta ?? undefined),
    source: entry.source ?? null,
  }
}

export function serializeHelpdeskTicket(
  ticket: HelpdeskTicket & { id: string },
  reuniones: (HelpdeskReunion & { id: string })[],
  emailLog: (HelpdeskEmailLog & { id: string })[] = [],
) {
  return {
    id: ticket.id,
    requesterUid: ticket.requesterUid,
    requesterEmail: ticket.requesterEmail,
    requesterNombre: ticket.requesterNombre,
    areaId: ticket.areaId,
    areaNombre: ticket.areaNombre,
    problematica: ticket.problematica,
    urgencia: ticket.urgencia,
    estadoIdx: ticket.estadoIdx,
    estado: helpdeskEstadoLabelFromIdx(ticket.estadoIdx),
    asignadoATeamId: ticket.asignadoATeamId,
    cancelado: ticket.cancelado === true,
    canceladoMotivo: ticket.canceladoMotivo ?? null,
    canceladoPor: ticket.canceladoPor ?? null,
    canceladoFecha: timestampToIso(ticket.canceladoFecha ?? undefined),
    createdAt: timestampToIso(ticket.createdAt),
    reuniones: reuniones.map(serializeHelpdeskReunion),
    emailLog: emailLog.map(serializeHelpdeskEmailLog),
    colaboradoresSistemas: (ticket.colaboradoresSistemas ?? []).map(serializeColaboradorSistemas),
  }
}

export function serializeHelpdeskNota(nota: HelpdeskNota & { id: string }) {
  return {
    id: nota.id,
    autorNombre: nota.autorNombre,
    texto: nota.texto,
    createdAt: timestampToIso(nota.createdAt),
  }
}

export function ticketPayloadForN8n(ticket: HelpdeskTicket & { id: string }) {
  return {
    ticketId: ticket.id,
    requesterUid: ticket.requesterUid,
    requesterEmail: ticket.requesterEmail,
    requesterNombre: ticket.requesterNombre,
    areaId: ticket.areaId,
    areaNombre: ticket.areaNombre,
    problematica: ticket.problematica,
    urgencia: ticket.urgencia,
    estadoIdx: ticket.estadoIdx,
    estado: helpdeskEstadoLabelFromIdx(ticket.estadoIdx),
    asignadoATeamId: ticket.asignadoATeamId,
  }
}
