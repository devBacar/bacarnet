/** Snapshot del dashboard COPS (campos que expone el endpoint externo). */
export interface CopsSnapshot {
  empresaId: string
  empresaNombre: string
  /** ISO o similar; el front lo muestra como HH:mm. */
  timestamp: string
  clientes: { activos: number; total: number }
  objetivos: number
  empleados: { activos: number }
  sla: { contratos: number; horasMes: number }
  operacionHoy: {
    enServicio: number
    deFranco: number
    ausentes: number
    vacantes: number
    novedades: number
  }
  planificacion: {
    proximoMes: string
    objetivosPublicados: number
    objetivosTotal: number
    /** Porcentaje 0–100. */
    pctPublicado: number
  }
  /** Opcional: puede no venir todavía en producción. */
  rrhh?: {
    personalHoy: {
      M: number
      T: number
      N: number
      D12: number
      N12: number
      RET: number
      otros: number
    }
    licenciasHoy: number
    ausenciasMes: number
  }
  /** Opcional: puede no venir todavía en producción. */
  liquidacion?: {
    periodoActual: string
    cicloStart: string
    cicloEnd: string
    ftCiclo: number
  }
}
