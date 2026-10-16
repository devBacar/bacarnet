/** Procesa una carpeta de exportación de Vientri ya leída (nombre → texto). Sin Firestore: se puede testear. */
import { armarCheques, COLUMNAS_CHEQUES, COLUMNAS_CHEQUES_PROPIOS, type ResultadoCheques } from './cheques.js'
import { armarPendientes, COLUMNAS_COMPROBANTES } from './comprobantes.js'
import { ARCHIVOS_REQUERIDOS, leerControl, verificarArchivo, type ControlCorrida, type ResultadoControl } from './control.js'
import { CsvError, exigirColumnas, leerCsv, type TablaCsv } from './csv.js'
import { COLUMNAS_PERSONAS, indicePersonas, mapearPersona } from './personas.js'
import type { VientriChequeDoc, VientriPendienteDoc, VientriPersonaDoc } from './tipos.js'
import { aEntero, aTexto } from './valores.js'

export interface ResultadoProcesamiento {
  control: ControlCorrida
  verificacion: ResultadoControl[]
  personas: VientriPersonaDoc[]
  cheques: VientriChequeDoc[]
  pendientes: VientriPendienteDoc[]
  resumenCheques: ResultadoCheques['resumen']
  tiposComprobante: Array<Record<string, string>>
}

export class CarpetaInvalidaError extends Error {
  constructor(message: string, readonly verificacion: ResultadoControl[] = []) {
    super(message)
  }
}

export function procesarCarpeta(textos: Map<string, string>): ResultadoProcesamiento {
  const textoControl = textos.get('_control.csv')
  if (!textoControl) throw new CarpetaInvalidaError('Falta _control.csv: la exportación no terminó')
  const control = leerControl(leerCsv(textoControl))
  if (!/^\d{4}-\d{2}-\d{2}/.test(control.fechaDatos)) {
    throw new CarpetaInvalidaError(`_control.csv tiene una fecha de datos inválida: "${control.fechaDatos}"`)
  }

  const tablas = new Map<string, TablaCsv>()
  const verificacion: ResultadoControl[] = []
  for (const archivo of ARCHIVOS_REQUERIDOS) {
    const texto = textos.get(archivo)
    if (texto === undefined) {
      verificacion.push({ archivo, ok: false, filasEsperadas: -1, filasLeidas: 0, detalle: 'Falta el archivo' })
      continue
    }
    try {
      const tabla = leerCsv(texto)
      tablas.set(archivo, tabla)
      verificacion.push(verificarArchivo(control.archivos.find((a) => a.archivo === archivo), tabla))
    } catch (err) {
      const detalle = err instanceof Error ? err.message : String(err)
      verificacion.push({ archivo, ok: false, filasEsperadas: -1, filasLeidas: 0, detalle })
    }
  }
  const malos = verificacion.filter((v) => !v.ok)
  if (malos.length > 0) {
    throw new CarpetaInvalidaError(
      `La exportación no pasó el control: ${malos.map((m) => `${m.archivo} (${m.detalle})`).join('; ')}`,
      verificacion,
    )
  }

  const t = (n: string) => tablas.get(n) as TablaCsv
  try {
    exigirColumnas(t('personas.csv'), 'personas.csv', COLUMNAS_PERSONAS)
    exigirColumnas(t('cheques.csv'), 'cheques.csv', COLUMNAS_CHEQUES)
    exigirColumnas(t('cheques_propios.csv'), 'cheques_propios.csv', COLUMNAS_CHEQUES_PROPIOS)
    exigirColumnas(t('comprobantes.csv'), 'comprobantes.csv', COLUMNAS_COMPROBANTES)
  } catch (err) {
    if (err instanceof CsvError) throw new CarpetaInvalidaError(err.message, verificacion)
    throw err
  }

  const personas = t('personas.csv').filas.map(mapearPersona).filter((p): p is VientriPersonaDoc => p !== null)
  const indice = indicePersonas(personas)

  const bancos = new Map<number, string>()
  for (const f of t('bancos.csv').filas) {
    const id = aEntero(f.vientri_id)
    const nombre = aTexto(f.abreviatura) ?? aTexto(f.nombre)
    if (id !== null && nombre) bancos.set(id, nombre)
  }
  const monedas = new Map<number, string>()
  for (const f of t('cotizaciones.csv').filas) {
    const id = aEntero(f.id_divisa)
    const simbolo = aTexto(f.simbolo)
    if (id !== null && simbolo) monedas.set(id, simbolo)
  }

  const { cheques, resumen } = armarCheques(t('cheques.csv').filas, t('cheques_propios.csv').filas, { personas: indice, bancos })
  const pendientes = armarPendientes(t('comprobantes.csv').filas, indice, monedas)
  const tipos = textos.get('tipos_comprobante.csv')
  const tiposComprobante = tipos ? leerCsv(tipos).filas : []

  return { control, verificacion, personas, cheques, pendientes, resumenCheques: resumen, tiposComprobante }
}
