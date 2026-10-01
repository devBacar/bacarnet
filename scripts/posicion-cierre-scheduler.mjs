/**
 * Scheduler local de Finanzas en el emulador (infra de PC-N8N).
 *
 * 1. Cierre de posición, lun-vie 15:00 ART. En producción lo dispara Cloud
 *    Scheduler (cerrarPosicionBancariaDiaria). Acá se hace el POST equivalente.
 * 2. Lun-vie a las :00 y a las :30, de 08:00 a 18:00: primero actualiza los
 *    saldos (syncCuentasFromProvider, que también guarda el cierre diario del
 *    banco) y después los movimientos. En producción lo hace
 *    sincronizarFinanzasCada30Min. El endpoint pide sesión de usuario, así que
 *    el proceso local llama a los servicios directo, contra el emulador.
 *
 * `anteriores` llega hasta ayer. En la misma corrida se pide `movement-type=dia`
 * para el día de hoy, así el extracto del día se actualiza durante la jornada.
 *
 * Env:
 *   GCLOUD_PROJECT (default bacar-web)
 *   FIRESTORE_EMULATOR_HOST (default 127.0.0.1:8080)
 *   BACARNET_FUNCTIONS_EMULATOR_HOST (default 127.0.0.1:5001)
 *   BACARNET_CIERRE_HORA / BACARNET_CIERRE_MINUTO (default 15:00)
 *   BACARNET_CIERRE_AHORA=1 dispara el cierre al arrancar
 *   BACARNET_SYNC_AHORA=1 dispara saldos y movimientos al arrancar
 *   BACARNET_SYNC_SALIR=1 termina el proceso cuando ese sync manual termina
 */

import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const project = process.env.GCLOUD_PROJECT?.trim() || 'bacar-web'
process.env.GCLOUD_PROJECT = project
process.env.FIRESTORE_EMULATOR_HOST =
  process.env.FIRESTORE_EMULATOR_HOST?.trim() || '127.0.0.1:8080'

const functionsHost =
  process.env.BACARNET_FUNCTIONS_EMULATOR_HOST?.trim() || '127.0.0.1:5001'
const hora = Number.parseInt(process.env.BACARNET_CIERRE_HORA ?? '15', 10)
const minuto = Number.parseInt(process.env.BACARNET_CIERRE_MINUTO ?? '0', 10)
const SYNC_DESDE_HORA = 8
const SYNC_HASTA_HORA = 18
const TZ = 'America/Argentina/Buenos_Aires'
const TICK_MS = 30_000
const ACTOR_SYNC = 'system:finanzas-sync-30min'

// El emulador agrega el sufijo `-0` al nombre de las funciones programadas.
const url =
  `http://${functionsHost}/${project}/southamerica-east1/cerrarPosicionBancariaDiaria-0`

const partesEnArgentina = (date) => {
  const partes = {}
  for (const p of new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)) {
    if (p.type !== 'literal') partes[p.type] = p.value
  }
  return partes
}

const fechaIdArgentina = (partes) =>
  `${partes.year}-${partes.month}-${partes.day}`

let ultimoDisparoFechaId = null
let ultimoSlotSync = null
let syncEnCurso = false
let syncCuentas = null
let syncMovimientos = null
let adminListo = false

async function asegurarAdmin() {
  if (adminListo) return
  const require = createRequire(resolve(ROOT, 'backend_clean/package.json'))
  const { getApps, initializeApp } = require('firebase-admin/app')
  if (getApps().length === 0) {
    initializeApp({ projectId: project })
  }
  adminListo = true
}

async function cargarSyncCuentas() {
  if (syncCuentas) return syncCuentas
  await asegurarAdmin()
  const href = pathToFileURL(
    resolve(ROOT, 'backend_clean/lib/modules/finanzas/services/cuentas.service.js'),
  ).href
  const modulo = await import(href)
  syncCuentas = modulo.syncCuentasFromProvider
  return syncCuentas
}

async function cargarSyncMovimientos() {
  if (syncMovimientos) return syncMovimientos
  await asegurarAdmin()
  const href = pathToFileURL(
    resolve(
      ROOT,
      'backend_clean/lib/modules/finanzas/movimientos/services/movimientos.service.js',
    ),
  ).href
  const modulo = await import(href)
  syncMovimientos = modulo.syncMovimientosBancarios
  return syncMovimientos
}

async function dispararSyncFinanzas(motivo) {
  if (syncEnCurso) {
    console.log('[finanzas-sync] Hay un sync en curso, se omite este disparo')
    return true
  }
  syncEnCurso = true
  console.log(`[finanzas-sync] Disparo (${motivo})`)
  let ok = true
  try {
    try {
      const sync = await cargarSyncCuentas()
      const resultado = await sync({ actorUid: ACTOR_SYNC })
      console.log(
        `[saldos-sync] Listo synced=${resultado.synced} provider=${resultado.provider}`,
      )
    } catch (err) {
      ok = false
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[saldos-sync] Falló: ${message.slice(0, 500)}`)
    }

    try {
      const sync = await cargarSyncMovimientos()
      const resultado = await sync({ actorUid: ACTOR_SYNC })
      const cuentas = (resultado.cuentas ?? [])
        .map(
          (cuenta) =>
            `${cuenta.cuentaId} ${cuenta.modo} ${cuenta.desde ?? '-'}..${cuenta.hasta ?? '-'} traidos=${cuenta.traidos} dia=${cuenta.diaInsertados ?? 0}`,
        )
        .join(' | ')
      console.log(
        `[movimientos-sync] Listo hoy=${resultado.hoy} traidos=${resultado.traidos} insertados=${resultado.insertados} autoCategorizados=${resultado.autoCategorizados} ${cuentas}`,
      )
    } catch (err) {
      if (err && err.name === 'MovimientosSyncEnCursoError') {
        console.log('[movimientos-sync] Ya se estaban trayendo los movimientos, se sigue')
      } else {
        ok = false
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[movimientos-sync] Falló: ${message.slice(0, 500)}`)
      }
    }

    // Estado real de las transferencias (solo lectura). Solo existe si el build incluye la rama de transferencias.
    try {
      const href = pathToFileURL(
        resolve(ROOT, 'backend_clean/lib/modules/finanzas/transferencias/services/actualizar-estados.service.js'),
      ).href
      const modulo = await import(href).catch(() => null)
      if (modulo?.actualizarEstadosTransferencias) {
        const resultado = await modulo.actualizarEstadosTransferencias()
        console.log(`[transferencias-estados] Listo ${JSON.stringify(resultado).slice(0, 300)}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[transferencias-estados] Falló: ${message.slice(0, 500)}`)
    }
    return ok
  } finally {
    syncEnCurso = false
  }
}

function esSlotSync(partes) {
  if (partes.weekday === 'Sat' || partes.weekday === 'Sun') return false
  const hour = Number(partes.hour)
  const minute = Number(partes.minute)
  if (hour < SYNC_DESDE_HORA || hour > SYNC_HASTA_HORA) return false
  if (hour === SYNC_HASTA_HORA && minute > 0) return false
  return minute === 0 || minute === 30
}

async function dispararCierre(motivo) {
  console.log(`[posicion-cierre] Disparo (${motivo}) → POST ${url}`)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const texto = await res.text()
    console.log(`[posicion-cierre] Respuesta ${res.status}: ${texto.slice(0, 500)}`)
    return res.ok
  } catch (err) {
    console.error(
      `[posicion-cierre] No se pudo disparar el cierre: ${err instanceof Error ? err.message : err}`,
    )
    return false
  }
}

async function tick() {
  const partes = partesEnArgentina(new Date())
  const esHabil = partes.weekday !== 'Sat' && partes.weekday !== 'Sun'
  const esLaHora =
    Number(partes.hour) === hora && Number(partes.minute) === minuto
  const fechaId = fechaIdArgentina(partes)
  if (esHabil && esLaHora && ultimoDisparoFechaId !== fechaId) {
    // Se marca antes del POST para no duplicar si la captura tarda más que un tick.
    ultimoDisparoFechaId = fechaId
    const ok = await dispararCierre(`${fechaId} ${partes.hour}:${partes.minute} ART`)
    if (!ok) ultimoDisparoFechaId = null
  }

  if (!esSlotSync(partes)) return
  const slot = `${fechaId} ${partes.hour}:${partes.minute}`
  if (ultimoSlotSync === slot) return
  ultimoSlotSync = slot
  const okSync = await dispararSyncFinanzas(slot)
  if (!okSync) ultimoSlotSync = null
}

console.log(
  `[posicion-cierre] Programado lun-vie ${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')} ${TZ} → ${url}`,
)
console.log(
  `[finanzas-sync] Programado lun-vie a las :00 y :30, ${String(SYNC_DESDE_HORA).padStart(2, '0')}:00–${String(SYNC_HASTA_HORA).padStart(2, '0')}:00 ${TZ} (primero saldos, después movimientos)`,
)

if (process.env.BACARNET_CIERRE_AHORA === '1') {
  void dispararCierre('BACARNET_CIERRE_AHORA')
}

if (process.env.BACARNET_SYNC_AHORA === '1') {
  void dispararSyncFinanzas('BACARNET_SYNC_AHORA').then((ok) => {
    if (process.env.BACARNET_SYNC_SALIR === '1') process.exit(ok ? 0 : 1)
  })
}

setInterval(() => void tick(), TICK_MS)
