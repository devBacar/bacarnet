import type { CopsSnapshot } from './tipos.js'

export type ResultadoValidacion = { ok: true; data: CopsSnapshot } | { ok: false; error: string }

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function str(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

type PersonalHoy = NonNullable<CopsSnapshot['rrhh']>['personalHoy']

function validarPersonalHoy(v: unknown): PersonalHoy | null {
  if (!esObjeto(v)) return null
  const keys = ['M', 'T', 'N', 'D12', 'N12', 'RET', 'otros'] as const
  for (const k of keys) {
    if (!num(v[k])) return null
  }
  return {
    M: v.M as number,
    T: v.T as number,
    N: v.N as number,
    D12: v.D12 as number,
    N12: v.N12 as number,
    RET: v.RET as number,
    otros: v.otros as number,
  }
}

/**
 * Valida la forma mínima del snapshot. `rrhh` y `liquidacion` son opcionales:
 * si vienen mal formados se descartan (no rompen la página).
 */
export function validarSnapshot(raw: unknown): ResultadoValidacion {
  if (!esObjeto(raw)) return { ok: false, error: 'La respuesta de COPS no es un objeto' }

  if (!str(raw.empresaId)) return { ok: false, error: 'COPS: falta empresaId' }
  if (!str(raw.empresaNombre)) return { ok: false, error: 'COPS: falta empresaNombre' }
  if (!str(raw.timestamp)) return { ok: false, error: 'COPS: falta timestamp' }
  if (!num(raw.objetivos)) return { ok: false, error: 'COPS: falta objetivos' }

  if (!esObjeto(raw.clientes) || !num(raw.clientes.activos) || !num(raw.clientes.total)) {
    return { ok: false, error: 'COPS: falta clientes (activos, total)' }
  }
  if (!esObjeto(raw.empleados) || !num(raw.empleados.activos)) {
    return { ok: false, error: 'COPS: falta empleados.activos' }
  }
  if (!esObjeto(raw.sla) || !num(raw.sla.contratos) || !num(raw.sla.horasMes)) {
    return { ok: false, error: 'COPS: falta sla (contratos, horasMes)' }
  }

  if (!esObjeto(raw.operacionHoy)) return { ok: false, error: 'COPS: falta operacionHoy' }
  const op = raw.operacionHoy
  for (const k of ['enServicio', 'deFranco', 'ausentes', 'vacantes', 'novedades'] as const) {
    if (!num(op[k])) return { ok: false, error: `COPS: falta operacionHoy.${k}` }
  }

  if (!esObjeto(raw.planificacion)) return { ok: false, error: 'COPS: falta planificacion' }
  const pl = raw.planificacion
  if (!str(pl.proximoMes)) return { ok: false, error: 'COPS: falta planificacion.proximoMes' }
  if (!num(pl.objetivosPublicados) || !num(pl.objetivosTotal) || !num(pl.pctPublicado)) {
    return { ok: false, error: 'COPS: falta planificacion (publicados, total, pct)' }
  }

  const data: CopsSnapshot = {
    empresaId: raw.empresaId,
    empresaNombre: raw.empresaNombre,
    timestamp: raw.timestamp,
    clientes: { activos: raw.clientes.activos, total: raw.clientes.total },
    objetivos: raw.objetivos,
    empleados: { activos: raw.empleados.activos },
    sla: { contratos: raw.sla.contratos, horasMes: raw.sla.horasMes },
    operacionHoy: {
      enServicio: op.enServicio as number,
      deFranco: op.deFranco as number,
      ausentes: op.ausentes as number,
      vacantes: op.vacantes as number,
      novedades: op.novedades as number,
    },
    planificacion: {
      proximoMes: pl.proximoMes,
      objetivosPublicados: pl.objetivosPublicados,
      objetivosTotal: pl.objetivosTotal,
      pctPublicado: pl.pctPublicado,
    },
  }

  if (esObjeto(raw.rrhh)) {
    const personal = validarPersonalHoy(raw.rrhh.personalHoy)
    if (personal && num(raw.rrhh.licenciasHoy) && num(raw.rrhh.ausenciasMes)) {
      data.rrhh = {
        personalHoy: personal,
        licenciasHoy: raw.rrhh.licenciasHoy,
        ausenciasMes: raw.rrhh.ausenciasMes,
      }
    }
  }

  if (esObjeto(raw.liquidacion)) {
    const liq = raw.liquidacion
    if (str(liq.periodoActual) && str(liq.cicloStart) && str(liq.cicloEnd) && num(liq.ftCiclo)) {
      data.liquidacion = {
        periodoActual: liq.periodoActual,
        cicloStart: liq.cicloStart,
        cicloEnd: liq.cicloEnd,
        ftCiclo: liq.ftCiclo,
      }
    }
  }

  return { ok: true, data }
}
