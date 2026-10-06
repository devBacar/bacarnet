import type { Readable } from 'node:stream'
import { leerDumpMysql } from '../domain/sqlDumpParser.js'
import { AcumuladorSalario, type ResultadoResumen } from '../domain/resumenMensual.js'
import type { BackupSalario } from './backupsDrive.js'
import type { ConteoEscritura, InfoIngestaGuardada } from './rrhh.repository.js'

/** Meses de historia que se guardan (24 = dos años). */
export const MESES_HISTORIA = 24
/** Si el último backup tiene más de estas horas, se avisa: Salario sube uno a las 14 h y otro a las 20:30 h. */
export const HORAS_ATRASO_BACKUP = 14
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

export interface DependenciasIngesta {
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
    const acumulador = new AcumuladorSalario({
      mesesHistoria: MESES_HISTORIA,
      anioDesde: anio - 2,
      vacacionesDesde: `${anio - 2}-01-01`,
    })
    const entrada = await deps.abrirBackup(backup.id)
    const lectura = await leerDumpMysql(entrada, {
      quiereTabla: acumulador.quiereTabla,
      onFila: acumulador.onFila,
    })
    const resultado = acumulador.resultado()
    if (!resultado.ultimoMes) {
      throw new Error('El backup no trae liquidaciones mensuales en el período esperado')
    }
    const escritura = await deps.guardarResultado(resultado, {
      ingestaId: id,
      archivo: backup.nombre,
      backupCreado: backup.creado,
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
