import type { Request, Response } from 'express'
import type { Timestamp } from 'firebase-admin/firestore'
import { logError } from '../../lib/log.js'
import { listHelpdeskAnalisisForTicket } from './analisisRepository.js'
import { listHelpdeskBitacoraForTicket } from './bitacoraRepository.js'
import {
  listHelpdeskReunionesForTicket,
  listActiveHelpdeskTeamMembers,
  listHelpdeskTickets,
} from './repository.js'
import type {
  HelpdeskMinutaIniciativa,
  HelpdeskMinutaProcesoEvaluado,
  HelpdeskTicket,
  HelpdeskUrgencia,
} from './types.js'
import { helpdeskEstadoLabelFromIdx } from './types.js'

const TRUNC_OBJETIVO = 150
const TRUNC_BITACORA = 100

function tsToDate(ts: Timestamp | undefined | null): Date | null {
  if (!ts || typeof ts.toDate !== 'function') return null
  return ts.toDate()
}

function isTestTicket(ticket: HelpdeskTicket & { id: string }): boolean {
  const p = (ticket.problematica ?? '').toLowerCase()
  const area = (ticket.areaNombre ?? '').toLowerCase()
  const email = (ticket.requesterEmail ?? '').toLowerCase()
  const nombre = (ticket.requesterNombre ?? '').toLowerCase()
  if (p.includes('[e2e') || p.includes('e2e prod') || p.includes('e2e —')) return true
  if (area.includes('e2e')) return true
  if (email.includes('prueba.helpdesk') || email.includes('+e2e')) return true
  if (nombre.startsWith('e2e ')) return true
  if (ticket.token === 'e2e-notif-analisis' || ticket.token === 'prod-screenshot-seed') return true
  return false
}

function truncate(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function veredictoCounts(iniciativas: HelpdeskMinutaIniciativa[]): {
  total: number
  viable: number
  viableConCondiciones: number
  noViable: number
} {
  let viable = 0
  let viableConCondiciones = 0
  let noViable = 0
  for (const i of iniciativas) {
    if (i.veredicto === 'Viable') viable += 1
    else if (i.veredicto === 'Viable con condiciones') viableConCondiciones += 1
    else if (i.veredicto === 'No viable') noViable += 1
  }
  return { total: iniciativas.length, viable, viableConCondiciones, noViable }
}

function daysSince(date: Date): number {
  const ms = Date.now() - date.getTime()
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)))
}

const MAX_PROCESOS_NAMED = 3
const MAX_INICIATIVAS_NAMED = 4
const TRUNC_INICIATIVAS_RESUMEN = 220

function formatProcesosResumen(procesos: HelpdeskMinutaProcesoEvaluado[]): string {
  const names = procesos
    .map((p) => p.procesoEvaluado?.trim())
    .filter((n): n is string => Boolean(n))
  if (names.length === 0) return ''
  const head = names.slice(0, MAX_PROCESOS_NAMED)
  const extra = names.length - head.length
  let label = `Procesos: ${head.join(', ')}`
  if (extra > 0) label += ` +${extra} más`
  return label
}

function formatIniciativasResumen(iniciativas: HelpdeskMinutaIniciativa[]): string {
  const parts = iniciativas
    .map((i) => {
      const nombre = i.nombre?.trim() || 'Sin nombre'
      const veredicto = i.veredicto?.trim()
      return veredicto ? `${nombre} (${veredicto})` : nombre
    })
    .filter(Boolean)
  if (parts.length === 0) return ''
  const head = parts.slice(0, MAX_INICIATIVAS_NAMED)
  const extra = parts.length - head.length
  let label = head.join(', ')
  if (extra > 0) label += ` +${extra} más`
  return truncate(label, TRUNC_INICIATIVAS_RESUMEN)
}

export async function getTableroProyectosHandler(req: Request, res: Response): Promise<void> {
  try {
    const team = await listActiveHelpdeskTeamMembers()
    const teamById = new Map(team.map((m) => [m.id, m.nombre]))

    const tickets = (await listHelpdeskTickets()).filter((t) => !isTestTicket(t))

    const rows = await Promise.all(
      tickets.map(async (ticket) => {
        const [reuniones, bitacora, analisisList] = await Promise.all([
          listHelpdeskReunionesForTicket(ticket.id),
          listHelpdeskBitacoraForTicket(ticket.id),
          listHelpdeskAnalisisForTicket(ticket.id),
        ])

        const activityDates: Date[] = []
        const created = tsToDate(ticket.createdAt)
        if (created) activityDates.push(created)

        let minutaObjetivo: string | null = null
        let procesosEvaluadosCount = 0
        let procesosResumen = ''
        let analisisResumen: {
          iniciativasTotal: number
          veredictos: ReturnType<typeof veredictoCounts>
          iniciativasResumen: string
        } | null = null
        let bitacoraResumen: { texto: string; fecha: string | null } | null = null

        for (const reunion of reuniones) {
          const reunionCreated = tsToDate(reunion.createdAt)
          if (reunionCreated) activityDates.push(reunionCreated)
          const md = reunion.minutaDiagnostico
          if (md) {
            const mu = tsToDate(md.updatedAt)
            if (mu) activityDates.push(mu)
            if (ticket.estadoIdx >= 2) {
              const objetivo = md.objetivoSesion?.trim() ?? ''
              if (objetivo) {
                minutaObjetivo = truncate(objetivo, TRUNC_OBJETIVO)
              }
              if (Array.isArray(md.procesosEvaluados) && md.procesosEvaluados.length > 0) {
                procesosEvaluadosCount = md.procesosEvaluados.length
                procesosResumen = formatProcesosResumen(md.procesosEvaluados)
              }
            }
            if (ticket.estadoIdx >= 3) {
              const approved = analisisList.some((a) => a.estado === 'aprobado')
              if (approved && Array.isArray(md.iniciativasPropuestas)) {
                analisisResumen = {
                  iniciativasTotal: md.iniciativasPropuestas.length,
                  veredictos: veredictoCounts(md.iniciativasPropuestas),
                  iniciativasResumen: formatIniciativasResumen(md.iniciativasPropuestas),
                }
              }
            }
          }
          const legacyMinuta = reunion.minuta
          if (legacyMinuta?.updatedAt) {
            const lu = tsToDate(legacyMinuta.updatedAt)
            if (lu) activityDates.push(lu)
          }
        }

        for (const a of analisisList) {
          const sub = tsToDate(a.subidoFecha)
          if (sub) activityDates.push(sub)
          if (a.estado === 'aprobado' || a.estado === 'rechazado') {
            const dec = tsToDate(a.decididoFecha)
            if (dec) activityDates.push(dec)
          }
        }

        if (bitacora.length > 0) {
          const last = bitacora[bitacora.length - 1]
          const bc = tsToDate(last.createdAt)
          if (bc) activityDates.push(bc)
          if (ticket.estadoIdx >= 4 && ticket.estadoIdx <= 5) {
            bitacoraResumen = {
              texto: truncate(last.texto ?? '', TRUNC_BITACORA),
              fecha: bc?.toISOString() ?? null,
            }
          }
        }

        const canceladoFecha = tsToDate(ticket.canceladoFecha ?? null)
        if (canceladoFecha) activityDates.push(canceladoFecha)

        const lastActivity =
          activityDates.length > 0
            ? new Date(Math.max(...activityDates.map((d) => d.getTime())))
            : created ?? new Date()

        const responsableNombre = ticket.asignadoATeamId
          ? teamById.get(ticket.asignadoATeamId) ?? null
          : null

        return {
          ticketId: ticket.id,
          area: ticket.areaNombre,
          urgencia: ticket.urgencia as HelpdeskUrgencia,
          estadoIdx: ticket.estadoIdx,
          estado: helpdeskEstadoLabelFromIdx(ticket.estadoIdx),
          responsableTeamId: ticket.asignadoATeamId,
          responsableNombre,
          cancelado: Boolean(ticket.cancelado),
          createdAt: created?.toISOString() ?? null,
          diasSinActividad: daysSince(lastActivity),
          minutaResumen:
            ticket.estadoIdx >= 2 && (minutaObjetivo || procesosResumen)
              ? {
                  objetivoSesion: minutaObjetivo ?? '',
                  procesosEvaluadosCount,
                  procesosResumen,
                }
              : null,
          analisisResumen,
          bitacoraResumen,
          finalizadoAt:
            ticket.estadoIdx === 5 && !ticket.cancelado ? lastActivity.toISOString() : null,
        }
      }),
    )

    res.json({ tickets: rows })
  } catch (err) {
    logError('getTableroProyectos', err)
    res.status(500).json({ error: 'No se pudo cargar el tablero de proyectos' })
  }
}
