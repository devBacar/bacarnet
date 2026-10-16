import { aCentavos, aEntero } from './valores.js'
import type { FilaCsv, TablaCsv } from './csv.js'

export const ARCHIVOS_REQUERIDOS = [
  'personas.csv',
  'comprobantes.csv',
  'aplicaciones.csv',
  'medios_pago.csv',
  'cheques.csv',
  'cheques_propios.csv',
  'bancos.csv',
  'cuentas.csv',
  'cotizaciones.csv',
] as const

export interface ControlArchivo {
  archivo: string
  filas: number
  sumaCentavos: number | null
  maxFecsys: string | null
}

export interface ControlCorrida {
  fechaDatos: string
  modo: 'completo' | 'incremental'
  desdeFecsys: string | null
  versionContrato: string
  archivos: ControlArchivo[]
}

export function leerControl(tabla: TablaCsv): ControlCorrida {
  if (tabla.filas.length === 0) throw new Error('_control.csv no tiene filas')
  const primera = tabla.filas[0]
  const modo = primera.modo === 'incremental' ? 'incremental' : 'completo'
  return {
    fechaDatos: (primera.fecha_datos ?? '').trim(),
    modo,
    desdeFecsys: (primera.desde_fecsys ?? '').trim() || null,
    versionContrato: (primera.version_contrato ?? '').trim(),
    archivos: tabla.filas.map((f) => ({
      archivo: f.archivo,
      filas: aEntero(f.filas) ?? -1,
      sumaCentavos: aCentavos(f.suma_importe),
      maxFecsys: (f.max_fecsys ?? '').trim() || null,
    })),
  }
}

/** Columna de importe que suma el script de exportación, en el mismo orden de preferencia. */
export function columnaImporte(columnas: string[]): string | null {
  for (const c of ['total', 'importe', 'cotizacion']) if (columnas.includes(c)) return c
  return null
}

export interface ResultadoControl {
  archivo: string
  ok: boolean
  filasEsperadas: number
  filasLeidas: number
  detalle: string | null
}

/** Compara lo leído con lo que dice _control.csv: misma cantidad de filas y misma suma de importes. */
export function verificarArchivo(control: ControlArchivo | undefined, tabla: TablaCsv): ResultadoControl {
  const archivo = control?.archivo ?? '?'
  if (!control) {
    return { archivo, ok: false, filasEsperadas: -1, filasLeidas: tabla.filas.length, detalle: 'No figura en _control.csv' }
  }
  if (control.filas !== tabla.filas.length) {
    return {
      archivo,
      ok: false,
      filasEsperadas: control.filas,
      filasLeidas: tabla.filas.length,
      detalle: `Se esperaban ${control.filas} filas y se leyeron ${tabla.filas.length}`,
    }
  }
  const col = columnaImporte(tabla.columnas)
  if (col && control.sumaCentavos !== null) {
    const suma = sumarCentavos(tabla.filas, col)
    if (Math.abs(suma - control.sumaCentavos) > tabla.filas.length) {
      return {
        archivo,
        ok: false,
        filasEsperadas: control.filas,
        filasLeidas: tabla.filas.length,
        detalle: `La suma de ${col} no coincide con el control`,
      }
    }
  }
  return { archivo, ok: true, filasEsperadas: control.filas, filasLeidas: tabla.filas.length, detalle: null }
}

function sumarCentavos(filas: FilaCsv[], col: string): number {
  let s = 0
  for (const f of filas) s += aCentavos(f[col]) ?? 0
  return s
}
