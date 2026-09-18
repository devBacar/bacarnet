import type { HelpdeskMinutaDiagnostico } from '../../types/helpdeskMinutaDiagnostico'
import {
  emptyIniciativa,
  emptyProcesoEvaluado,
  inputDateToDisplay,
  reunionFechaToInputDate,
} from '../../types/helpdeskMinutaDiagnostico'

export type HelpdeskMinutaSimple = {
  participantes: string
  /** Análisis de lo conversado en la reunión. */
  analisisConversacion: string
  /** Cómo funcionan hoy los procesos revisados. */
  procesosActuales: string
  /** Problemas, fricciones o gaps detectados. */
  problemasDetectados: string
  /** Proyecto o mejora propuesta a partir de lo anterior. */
  propuesta: string
  proximosPasos: string
}

export function emptyHelpdeskMinutaSimple(_areaNombre: string): HelpdeskMinutaSimple {
  return {
    participantes: '',
    analisisConversacion: '',
    procesosActuales: '',
    problemasDetectados: '',
    propuesta: '',
    proximosPasos: '',
  }
}

export function minutaSimpleFromDiagnostico(
  minuta: HelpdeskMinutaDiagnostico,
  areaNombre: string,
): HelpdeskMinutaSimple {
  const p0 = minuta.procesosEvaluados[0]
  const i0 = minuta.iniciativasPropuestas[0]
  return {
    participantes: minuta.participantes ?? '',
    analisisConversacion: minuta.objetivoSesion?.trim() || minuta.alcance?.trim() || '',
    procesosActuales:
      p0?.descripcionBreve?.trim() ||
      p0?.procesoEvaluado?.trim() ||
      areaNombre,
    problemasDetectados: p0?.problemasIdentificados?.trim() || '',
    propuesta: i0?.nombre?.trim() || minuta.proyectosAprobados?.trim() || '',
    proximosPasos:
      minuta.accionesInmediatas?.trim() ||
      i0?.beneficioEsperado?.trim() ||
      minuta.responsables?.trim() ||
      '',
  }
}

export function diagnosticoFromMinutaSimple(
  simple: HelpdeskMinutaSimple,
  base: HelpdeskMinutaDiagnostico,
  areaNombre: string,
): HelpdeskMinutaDiagnostico {
  const analisis = simple.analisisConversacion.trim()
  const procesos = simple.procesosActuales.trim()
  const problemas = simple.problemasDetectados.trim()
  const propuesta = simple.propuesta.trim() || 'Propuesta acordada en reunión'
  const pasos = simple.proximosPasos.trim() || propuesta

  const procesoNombre =
    procesos.split('\n').find((line) => line.trim())?.trim().slice(0, 500) ||
    areaNombre

  const procesoRow = {
    ...emptyProcesoEvaluado(),
    procesoEvaluado: procesoNombre,
    descripcionBreve: procesos || analisis,
    problemasIdentificados: problemas || procesos || analisis,
  }

  const iniciativa = {
    ...emptyIniciativa(),
    nombre: propuesta,
    beneficioEsperado: pasos,
    recursosRequeridos: problemas ? `Motivación: ${problemas.slice(0, 500)}` : '',
  }

  const alcanceParts = [procesos, problemas].filter(Boolean)

  return {
    ...base,
    participantes: simple.participantes.trim(),
    objetivoSesion: analisis,
    alcance: alcanceParts.length > 0 ? alcanceParts.join('\n\n') : analisis,
    procesosEvaluados: [procesoRow],
    iniciativasPropuestas: [iniciativa],
    proyectosAprobados: propuesta,
    responsables: base.facilitador.trim(),
    accionesInmediatas: pasos,
  }
}

export function createMinutaSimpleBase(
  reunionFecha: string,
  facilitador: string,
): HelpdeskMinutaDiagnostico {
  const dateInput = reunionFechaToInputDate(reunionFecha)
  const fecha = dateInput ? inputDateToDisplay(dateInput) : reunionFecha
  return {
    fecha,
    facilitador: facilitador.trim() || 'Facilitador',
    participantes: '',
    objetivoSesion: '',
    alcance: '',
    procesosEvaluados: [emptyProcesoEvaluado()],
    iniciativasPropuestas: [emptyIniciativa()],
    proyectosAprobados: '',
    responsables: '',
    accionesInmediatas: '',
  }
}

export function minutaInicialCompleta(reunion: {
  minutaDiagnostico?: HelpdeskMinutaDiagnostico | null
}): boolean {
  const m = reunion.minutaDiagnostico
  if (!m) return false
  return Boolean(
    m.objetivoSesion?.trim() ||
      m.procesosEvaluados?.[0]?.problemasIdentificados?.trim() ||
      m.accionesInmediatas?.trim(),
  )
}

export function minutaSimpleSummary(simple: HelpdeskMinutaSimple): string {
  const t =
    simple.analisisConversacion.trim() ||
    simple.problemasDetectados.trim() ||
    simple.proximosPasos.trim()
  if (!t) return 'Sin minuta'
  return t.length > 100 ? `${t.slice(0, 99)}…` : t
}
