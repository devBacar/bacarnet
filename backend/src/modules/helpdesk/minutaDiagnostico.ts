import type { HelpdeskMinutaDiagnostico } from './types.js'

export const HELPDESK_REUNION_TIPO_INICIAL = 'Reunión inicial'

const IMPACTO = new Set(['Alto', 'Medio', 'Bajo'])
const FACTIBILIDAD = new Set(['Alta', 'Media', 'Baja'])
const COSTO = new Set(['Alto', 'Medio', 'Bajo'])
const URGENCIA_INICIATIVA = new Set(['Crítico', 'Deseable', 'Posponible'])
const VEREDICTO = new Set(['Viable', 'Viable con condiciones', 'No viable'])

function asTrimmedString(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLen)
}

export function isValidHelpdeskMinutaDiagnostico(value: unknown): value is HelpdeskMinutaDiagnostico {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const body = value as Record<string, unknown>

  const fecha = asTrimmedString(body.fecha, 32)
  const facilitador = asTrimmedString(body.facilitador, 200)
  const participantes = asTrimmedString(body.participantes, 4000)
  const objetivoSesion = asTrimmedString(body.objetivoSesion, 8000)
  const alcance = asTrimmedString(body.alcance, 8000)
  const proyectosAprobados = asTrimmedString(body.proyectosAprobados, 8000)
  const responsables = asTrimmedString(body.responsables, 8000)
  const accionesInmediatas = asTrimmedString(body.accionesInmediatas, 8000)
  const fechaSeguimiento = asTrimmedString(body.fechaSeguimiento, 32)

  if (!fecha || !facilitador) return false

  if (!Array.isArray(body.procesosEvaluados) || body.procesosEvaluados.length === 0) {
    return false
  }
  for (const item of body.procesosEvaluados) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    const row = item as Record<string, unknown>
    if (!asTrimmedString(row.procesoEvaluado, 500)) return false
  }

  if (!Array.isArray(body.iniciativasPropuestas) || body.iniciativasPropuestas.length === 0) {
    return false
  }
  for (const item of body.iniciativasPropuestas) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    const row = item as Record<string, unknown>
    if (!asTrimmedString(row.nombre, 500)) return false
    if (!IMPACTO.has(String(row.impactoEstimado))) return false
    if (!FACTIBILIDAD.has(String(row.factibilidad))) return false
    if (!COSTO.has(String(row.costoEsfuerzo))) return false
    if (!URGENCIA_INICIATIVA.has(String(row.urgencia))) return false
    if (!VEREDICTO.has(String(row.veredicto))) return false
  }

  return true
}

export function normalizeHelpdeskMinutaDiagnostico(
  value: HelpdeskMinutaDiagnostico,
): HelpdeskMinutaDiagnostico {
  const fechaSeguimiento = value.fechaSeguimiento?.trim()
  const normalized: HelpdeskMinutaDiagnostico = {
    fecha: value.fecha.trim(),
    facilitador: value.facilitador.trim(),
    participantes: value.participantes.trim(),
    objetivoSesion: value.objetivoSesion.trim(),
    alcance: value.alcance.trim(),
    procesosEvaluados: value.procesosEvaluados.map((p) => ({
      procesoEvaluado: p.procesoEvaluado.trim(),
      descripcionBreve: p.descripcionBreve.trim(),
      problemasIdentificados: p.problemasIdentificados.trim(),
      metricasActuales: p.metricasActuales.trim(),
    })),
    iniciativasPropuestas: value.iniciativasPropuestas.map((i) => ({
      nombre: i.nombre.trim(),
      beneficioEsperado: i.beneficioEsperado.trim(),
      recursosRequeridos: i.recursosRequeridos.trim(),
      impactoEstimado: i.impactoEstimado,
      factibilidad: i.factibilidad,
      costoEsfuerzo: i.costoEsfuerzo,
      urgencia: i.urgencia,
      veredicto: i.veredicto,
    })),
    proyectosAprobados: value.proyectosAprobados.trim(),
    responsables: value.responsables.trim(),
    accionesInmediatas: value.accionesInmediatas.trim(),
  }
  if (fechaSeguimiento) {
    normalized.fechaSeguimiento = fechaSeguimiento
  }
  return normalized
}
