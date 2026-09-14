export type HelpdeskMinutaImpacto = 'Alto' | 'Medio' | 'Bajo'
export type HelpdeskMinutaFactibilidad = 'Alta' | 'Media' | 'Baja'
export type HelpdeskMinutaUrgenciaIniciativa = 'Crítico' | 'Deseable' | 'Posponible'
export type HelpdeskMinutaVeredicto = 'Viable' | 'Viable con condiciones' | 'No viable'

export interface HelpdeskMinutaProcesoEvaluado {
  procesoEvaluado: string
  descripcionBreve: string
  problemasIdentificados: string
  metricasActuales: string
}

export interface HelpdeskMinutaIniciativa {
  nombre: string
  beneficioEsperado: string
  recursosRequeridos: string
  impactoEstimado: HelpdeskMinutaImpacto
  factibilidad: HelpdeskMinutaFactibilidad
  costoEsfuerzo: HelpdeskMinutaImpacto
  urgencia: HelpdeskMinutaUrgenciaIniciativa
  veredicto: HelpdeskMinutaVeredicto
}

export interface HelpdeskMinutaDiagnostico {
  fecha: string
  facilitador: string
  participantes: string
  objetivoSesion: string
  alcance: string
  procesosEvaluados: HelpdeskMinutaProcesoEvaluado[]
  iniciativasPropuestas: HelpdeskMinutaIniciativa[]
  proyectosAprobados: string
  responsables: string
  accionesInmediatas: string
  fechaSeguimiento?: string
  generadoPorIA?: boolean
  autorNombre?: string
  updatedAt?: string | null
}

export function emptyProcesoEvaluado(): HelpdeskMinutaProcesoEvaluado {
  return {
    procesoEvaluado: '',
    descripcionBreve: '',
    problemasIdentificados: '',
    metricasActuales: '',
  }
}

export function emptyIniciativa(): HelpdeskMinutaIniciativa {
  return {
    nombre: '',
    beneficioEsperado: '',
    recursosRequeridos: '',
    impactoEstimado: 'Medio',
    factibilidad: 'Media',
    costoEsfuerzo: 'Medio',
    urgencia: 'Deseable',
    veredicto: 'Viable',
  }
}

/** Convierte DD/MM/YYYY → yyyy-MM-dd para input date. */
export function reunionFechaToInputDate(fecha: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(fecha.trim())
  if (!match) return ''
  const [, dd, mm, yyyy] = match
  return `${yyyy}-${mm}-${dd}`
}

export function inputDateToDisplay(fechaInput: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaInput.trim())
  if (!match) return fechaInput
  const [, yyyy, mm, dd] = match
  return `${dd}/${mm}/${yyyy}`
}
