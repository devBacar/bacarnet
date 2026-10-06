import { adminDb } from '../../lib/firebase/admin.js'
import { logError, logInfo } from '../../lib/log.js'
import { ejecutarIngestaReal } from './services/ingestaRrhh.js'

const ACTOR_PROGRAMADO = 'system:rrhh-ingesta'

/** Mismo flag que usa el frontend y requireRrhh: global_settings/main.rrhhEnabled. */
async function moduloRrhhHabilitado(): Promise<boolean> {
  const snap = await adminDb().collection('global_settings').doc('main').get()
  return snap.exists && snap.get('rrhhEnabled') === true
}

/**
 * Tarea programada: procesa el último backup de Salario si todavía no se procesó.
 * Con el módulo apagado no procesa nada (sueldos y licencias solo se leen con RRHH habilitado).
 * La ingesta manual del super admin funciona igual, para probar antes de habilitarlo.
 */
export async function runScheduledIngestaRrhh(): Promise<void> {
  if (!(await moduloRrhhHabilitado())) {
    logInfo('[rrhh/ingesta] módulo RRHH apagado: no se procesa el backup')
    return
  }
  const resultado = await ejecutarIngestaReal({ origen: 'programada', actorUid: ACTOR_PROGRAMADO })
  if (resultado.estado === 'error' || resultado.estado === 'sin_backup') {
    logError('[rrhh/ingesta] no se pudo procesar el backup de Salario', new Error(resultado.mensaje ?? resultado.estado))
    return
  }
  if (resultado.backupAtrasado) {
    logError(
      '[rrhh/ingesta] el último backup de Salario tiene más de 14 horas',
      new Error(`Último archivo: ${resultado.archivo ?? 'desconocido'}`),
    )
  }
  logInfo('[rrhh/ingesta] corrida programada', { estado: resultado.estado, archivo: resultado.archivo })
}
