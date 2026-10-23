import type { BaseDias, ConfigInversiones, InversorDatos, Penalidad, TipoPersona } from './inversion.types.js'

/** Error con mensaje para mostrar tal cual en pantalla. */
export class ErrorValidacion extends Error {}

/** No existe lo que se pidió (404). */
export class NoEncontrado extends Error {}

function texto(valor: unknown, max = 300): string | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor !== 'string') throw new ErrorValidacion('Hay un dato que no es texto.')
  const limpio = valor.trim()
  if (!limpio) return null
  if (limpio.length > max) throw new ErrorValidacion(`Un dato es demasiado largo (máximo ${max} letras).`)
  return limpio
}

function soloDigitos(valor: unknown, nombre: string, largos: number[]): string | null {
  const t = texto(valor, 40)
  if (t === null) return null
  const digitos = t.replace(/\D/g, '')
  if (!largos.includes(digitos.length)) {
    throw new ErrorValidacion(`El ${nombre} tiene que tener ${largos.join(' u ')} números.`)
  }
  return digitos
}

/** Todos los datos son opcionales menos el nombre (Ley 25.326: se pide lo mínimo). */
export function validarInversorDatos(raw: unknown): InversorDatos {
  if (!raw || typeof raw !== 'object') throw new ErrorValidacion('Faltan los datos del inversor.')
  const r = raw as Record<string, unknown>
  const nombre = texto(r.nombre, 150)
  if (!nombre) throw new ErrorValidacion('Poné el nombre del inversor.')
  const tipo = r.tipoPersona
  if (tipo !== null && tipo !== undefined && tipo !== 'humana' && tipo !== 'juridica') {
    throw new ErrorValidacion('El tipo de persona tiene que ser humana o jurídica.')
  }
  const email = texto(r.email, 150)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorValidacion('El email no es válido.')
  return {
    nombre,
    tipoPersona: (tipo ?? null) as TipoPersona | null,
    cuit: soloDigitos(r.cuit, 'CUIT', [11]),
    dni: soloDigitos(r.dni, 'DNI', [7, 8]),
    email,
    telefono: texto(r.telefono, 50),
    domicilio: texto(r.domicilio, 200),
    cbuArs: soloDigitos(r.cbuArs, 'CBU', [22]),
    cuentaUsd: texto(r.cuentaUsd, 100),
    observaciones: texto(r.observaciones, 1000),
  }
}

const BASES: BaseDias[] = [365, 360, '360_reales', 'reales']

function porcentaje(valor: unknown, nombre: string): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > 100) {
    throw new ErrorValidacion(`${nombre} tiene que ser un porcentaje entre 0 y 100.`)
  }
  return valor
}

function centavos(valor: unknown, nombre: string): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0) {
    throw new ErrorValidacion(`${nombre} tiene que ser un monto positivo.`)
  }
  return valor
}

export function validarPenalidad(raw: unknown): Penalidad {
  if (!raw || typeof raw !== 'object') throw new ErrorValidacion('Falta la penalidad por precancelar.')
  const r = raw as Record<string, unknown>
  const tope = r.topeIntereses === true ? { topeIntereses: true } : {}
  switch (r.tipo) {
    case 'ninguna':
      return { tipo: 'ninguna' }
    case 'porcentaje_interes':
    case 'porcentaje_capital': {
      const valorPct = porcentaje(r.valorPct, 'La penalidad')
      if (valorPct === null) throw new ErrorValidacion('Poné el porcentaje de la penalidad.')
      return { tipo: r.tipo, valorPct, ...tope }
    }
    case 'monto_fijo': {
      const montoCentavos = centavos(r.montoCentavos, 'La penalidad')
      if (montoCentavos === null) throw new ErrorValidacion('Poné el monto de la penalidad.')
      return { tipo: 'monto_fijo', montoCentavos, ...tope }
    }
    default:
      throw new ErrorValidacion('El tipo de penalidad no es válido.')
  }
}

function entero(valor: unknown, nombre: string, min: number, max: number): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < min || valor > max) {
    throw new ErrorValidacion(`${nombre} tiene que ser un número entre ${min} y ${max}.`)
  }
  return valor
}

/** Valida lo que manda la pantalla de Configuración. `ultimoNumero` nunca viene de afuera. */
export function validarConfig(raw: unknown, actual: ConfigInversiones): ConfigInversiones {
  if (!raw || typeof raw !== 'object') throw new ErrorValidacion('Falta la configuración.')
  const r = raw as Record<string, unknown>
  if (!BASES.includes(r.baseDiasDefault as BaseDias)) throw new ErrorValidacion('La base de días no es válida.')
  const rg = (r.retencionGanancias ?? {}) as Record<string, unknown>
  const retencionGanancias = {
    activa: rg.activa === true,
    alicuotaInscriptoPct: porcentaje(rg.alicuotaInscriptoPct, 'La alícuota para inscriptos'),
    alicuotaNoInscriptoPct: porcentaje(rg.alicuotaNoInscriptoPct, 'La alícuota para no inscriptos'),
    minimoNoSujetoCentavos: centavos(rg.minimoNoSujetoCentavos, 'El mínimo no sujeto'),
  }
  if (
    retencionGanancias.activa &&
    (retencionGanancias.alicuotaInscriptoPct === null || retencionGanancias.alicuotaNoInscriptoPct === null)
  ) {
    throw new ErrorValidacion('Para activar la retención de Ganancias cargá las dos alícuotas.')
  }
  return {
    baseDiasDefault: r.baseDiasDefault as BaseDias,
    horizonteMesesSinVencimiento: entero(r.horizonteMesesSinVencimiento, 'Los meses hacia adelante', 1, 60),
    penalidadDefault: validarPenalidad(r.penalidadDefault),
    diasAvisoPorVencer: entero(r.diasAvisoPorVencer, 'Los días de aviso', 0, 365),
    retencionGanancias,
    ultimoNumero: actual.ultimoNumero,
  }
}

/** Config guardada + valores por defecto para campos que se agregaron después. */
export function configConDefaults(guardada: Partial<ConfigInversiones> | undefined, defaults: ConfigInversiones): ConfigInversiones {
  return {
    ...defaults,
    ...(guardada ?? {}),
    retencionGanancias: { ...defaults.retencionGanancias, ...(guardada?.retencionGanancias ?? {}) },
  }
}

/** "INV-0007" */
export function numeroInversion(n: number): string {
  return `INV-${String(n).padStart(4, '0')}`
}
