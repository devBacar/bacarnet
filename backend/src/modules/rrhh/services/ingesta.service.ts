import type { Readable } from 'node:stream'
import { leerDumpMysql } from '../domain/sqlDumpParser.js'
import { AcumuladorSalario, type ResultadoResumen } from '../domain/resumenMensual.js'
import type { BackupSalario } from './backupsDrive.js'
import type { ConteoEscritura, InfoIngestaGuardada } from './rrhh.repository.js'

/** Meses de historia que se guardan (24 = dos años). */
export const MESES_HISTORIA = 24
/** Si el último backup tiene más de estas horas, se avisa: Salario sube uno a las 14 h y otro a las 20:30 h. */
export const HORAS_ATRASO_BACKUP = 14
/** Si una tabla de liquidaciones trae menos de esta proporción de las filas de la última ingesta buena, se aborta. */
export const PROPORCION_MINIMA_FILAS = 0.8
/** Una ingesta "en curso" más vieja que esto se considera caída y se puede volver a tomar. */
export const VENCIMIENTO_EN_CURSO_MS = 40 * 60 * 1000

export type OrigenIngesta = 'programada' | 'manual'

export type EstadoIngesta = 'ok' | 'ya_procesado' | 'en_curso' | 'sin_backup' | 'error'

export interface DatosInicioIngesta {
  origen: OrigenIngesta
  actorUid: string
  archivo: string
  fileId: string
  md5: string | null
  bytes: number
  backupCreado: string
  backupAtrasado: boolean
  inicio: Date
}

export interface DatosFinIngesta {
  estado: 'ok' | 'error'
  fin: Date
  duracionMs: number
  mensaje?: string
  encabezado?: string
  filasPorTabla?: Record<string, number>
  meses?: string[]
  ultimoMes?: string | null
  escritura?: ConteoEscritura
  anomalias?: number
}

export interface RegistroIngestas {
  /** Marca la ingesta como en curso, salvo que ya esté hecha o la esté haciendo otra corrida. */
  tomar(
    id: string,
    datos: DatosInicioIngesta,
    opciones: { forzar: boolean; vencimientoMs: number },
  ): Promise<'tomada' | 'ya_procesado' | 'en_curso'>
  terminar(id: string, datos: DatosFinIngesta): Promise<void>
  registrarSinBackup(datos: { origen: OrigenIngesta; actorUid: string; fecha: Date }): Promise<void>
}

export interface UltimaIngestaOk {
  ultimoMes: string | null
  filasPorTabla: Record<string, number>
}

export interface DependenciasIngesta {
  /** Última ingesta guardada bien, para no pisar historia buena con un backup incompleto. */
  ultimaIngestaOk(): Promise<UltimaIngestaOk | null>
  buscarUltimoBackup(): Promise<BackupSalario | null>
  abrirBackup(fileId: string): Promise<Readable>
  guardarResultado(resultado: ResultadoResumen, info: InfoIngestaGuardada): Promise<ConteoEscritura>
  registro: RegistroIngestas
  ahora(): Date
  log?: (mensaje: string, extra?: Record<string, unknown>) => void
}

export interface ResultadoIngesta {
  estado: EstadoIngesta
  ingestaId?: string
  archivo?: string
  backupAtrasado?: boolean
  ultimoMes?: string | null
  escritura?: ConteoEscritura
  mensaje?: string
}

const RE_TABLA_LIQ = /^liq(\d{4})$/

/**
 * Controles antes de escribir: el guardado reemplaza los datos y borra lo que no vino,
 * así que un backup cortado o incompleto no puede pisar la historia buena.
 * Devuelve el motivo para abortar, o null si se puede guardar.
 */
export function motivoParaNoGuardar(
  actual: { completo: boolean; ultimoMes: string | null; filasPorTabla: Record<string, number> },
  anterior: UltimaIngestaOk | null,
  anioDesde: number,
): string | null {
  if (!actual.completo) {
    return 'El backup está incompleto: no termina con "-- Dump completed". No se guardó nada.'
  }
  if (!actual.ultimoMes) {
    return 'El backup no trae liquidaciones mensuales en el período esperado. No se guardó nada.'
  }
  if (!anterior) return null
  if (anterior.ultimoMes && actual.ultimoMes < anterior.ultimoMes) {
    return `El backup llega hasta ${actual.ultimoMes} y la última ingesta buena llegaba hasta ${anterior.ultimoMes}. No se guardó nada.`
  }
  for (const [tabla, filasAntes] of Object.entries(anterior.filasPorTabla)) {
    const liq = RE_TABLA_LIQ.exec(tabla)
    if (!liq || Number(liq[1]) < anioDesde || filasAntes <= 0) continue
    const filasAhora = actual.filasPorTabla[tabla] ?? 0
    if (filasAhora < filasAntes * PROPORCION_MINIMA_FILAS) {
      return `La tabla ${tabla} trae ${filasAhora} filas y la última ingesta buena tenía ${filasAntes}. No se guardó nada.`
    }
  }
  return null
}

/** Id estable por archivo y contenido: el mismo backup no se procesa dos veces. */
export function idIngesta(backup: BackupSalario): string {
  return `${backup.id}_${backup.md5 ?? backup.bytes}`
}

/**
 * Lee el último backup de Salario de Drive y actualiza los resúmenes de RRHH.
 * Idempotente: si ese archivo ya se procesó bien, no hace nada (salvo `forzar`).
 */
export async function ejecutarIngestaRrhh(
  deps: DependenciasIngesta,
  opciones: { origen: OrigenIngesta; actorUid: string; forzar?: boolean },
): Promise<ResultadoIngesta> {
  const log = deps.log ?? (() => {})
  const inicio = deps.ahora()
  const backup = await deps.buscarUltimoBackup()
  if (!backup) {
    await deps.registro.registrarSinBackup({ origen: opciones.origen, actorUid: opciones.actorUid, fecha: inicio })
    return { estado: 'sin_backup', mensaje: 'No hay backups de Salario en la carpeta de Drive.' }
  }

  const id = idIngesta(backup)
  const horasDesdeBackup = (inicio.getTime() - new Date(backup.creado).getTime()) / 3_600_000
  const backupAtrasado = horasDesdeBackup > HORAS_ATRASO_BACKUP

  const toma = await deps.registro.tomar(
    id,
    {
      origen: opciones.origen,
      actorUid: opciones.actorUid,
      archivo: backup.nombre,
      fileId: backup.id,
      md5: backup.md5,
      bytes: backup.bytes,
      backupCreado: backup.creado,
      backupAtrasado,
      inicio,
    },
    { forzar: opciones.forzar === true, vencimientoMs: VENCIMIENTO_EN_CURSO_MS },
  )
  if (toma !== 'tomada') {
    return { estado: toma, ingestaId: id, archivo: backup.nombre, backupAtrasado }
  }

  try {
    const anio = inicio.getFullYear()
    const anioDesde = anio - 2
    const acumulador = new AcumuladorSalario({
      mesesHistoria: MESES_HISTORIA,
      anioDesde,
      vacacionesDesde: `${anioDesde}-01-01`,
    })
    const entrada = await deps.abrirBackup(backup.id)
    const lectura = await leerDumpMysql(entrada, {
      quiereTabla: acumulador.quiereTabla,
      onFila: acumulador.onFila,
    })
    const resultado = acumulador.resultado()
    const motivo = motivoParaNoGuardar(
      { completo: lectura.completo, ultimoMes: resultado.ultimoMes, filasPorTabla: lectura.filasPorTabla },
      await deps.ultimaIngestaOk(),
      anioDesde,
    )
    if (motivo) throw new Error(motivo)
    const escritura = await deps.guardarResultado(resultado, {
      ingestaId: id,
      archivo: backup.nombre,
      backupCreado: backup.creado,
      filasPorTabla: lectura.filasPorTabla,
    })
    const fin = deps.ahora()
    await deps.registro.terminar(id, {
      estado: 'ok',
      fin,
      duracionMs: fin.getTime() - inicio.getTime(),
      encabezado: lectura.encabezado,
      filasPorTabla: lectura.filasPorTabla,
      meses: resultado.meses,
      ultimoMes: resultado.ultimoMes,
      escritura,
      anomalias: resultado.anomalias.length,
    })
    log('[rrhh/ingesta] backup procesado', {
      archivo: backup.nombre,
      ultimoMes: resultado.ultimoMes,
      ...escritura,
      segundos: Math.round((fin.getTime() - inicio.getTime()) / 1000),
    })
    return {
      estado: 'ok',
      ingestaId: id,
      archivo: backup.nombre,
      backupAtrasado,
      ultimoMes: resultado.ultimoMes,
      escritura,
    }
  } catch (err) {
    const fin = deps.ahora()
    const mensaje = err instanceof Error ? err.message : String(err)
    await deps.registro.terminar(id, {
      estado: 'error',
      fin,
      duracionMs: fin.getTime() - inicio.getTime(),
      mensaje,
    })
    return { estado: 'error', ingestaId: id, archivo: backup.nombre, backupAtrasado, mensaje }
  }
}
