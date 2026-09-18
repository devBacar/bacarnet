import {
  enrichCampanaAuditoriaRow,
  type CampanaAuditoriaEnrichedRow,
} from './campanaAuditoriaEnrich.js'
import { mapHelpdeskTicketsByRequesterEmail } from './campanaAuditoriaTickets.js'
import {
  serializeCampanaAuditoriaRow,
  type CampanaAuditoriaRow,
} from './getCampanaAuditoria.js'
import { listJefesAreasRows } from './n8nJefesAreas.js'

export async function loadCampanaAuditoriaEnrichedRows(): Promise<CampanaAuditoriaEnrichedRow[]> {
  const raw = await listJefesAreasRows()
  const baseRows = raw.map(serializeCampanaAuditoriaRow)
  const ticketMap = await mapHelpdeskTicketsByRequesterEmail(
    baseRows.map((r) => r.email ?? ''),
  )
  return baseRows.map((row) => {
    const email = row.email?.trim().toLowerCase() ?? null
    const tickets = email ? (ticketMap.get(email) ?? []) : []
    return enrichCampanaAuditoriaRow(row, tickets)
  })
}

export function campanaArchivoFilaFromRow(row: CampanaAuditoriaEnrichedRow): CampanaArchivoFila {
  const respondido = row.campana_cumplida
  const fechaRespuesta =
    row.fecha_formulario ??
    (row.respondio_correo ? row.fecha_envio : null) ??
    row.fecha_respuesta

  return {
    area: row.area,
    jefe: row.nombre,
    email: row.email,
    enviado: row.enviado,
    fechaEnvio: row.fecha_envio,
    respondido,
    fechaRespuesta,
  }
}

export type CampanaArchivoFila = {
  area: string | null
  jefe: string | null
  email: string | null
  enviado: boolean | null
  fechaEnvio: string | null
  respondido: boolean | null
  fechaRespuesta: string | null
}

export function campanaResumenFromFilas(filas: CampanaArchivoFila[]): CampanaArchivoResumen {
  const totalAreas = filas.length
  const respondieron = filas.filter((f) => f.respondido === true).length
  return {
    totalAreas,
    respondieron,
    sinResponder: totalAreas - respondieron,
  }
}

export type CampanaArchivoResumen = {
  totalAreas: number
  respondieron: number
  sinResponder: number
}
