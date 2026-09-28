import {
  fetchMovimientosAnterioresCompleto,
  listCuentasCorrientesArs,
  openInterbankingInfoSession,
  type CuentaCorrienteObjetivo,
  type InterbankingInfoSession,
} from '../adapters/interbanking-movimientos.js'
import { mapInterbankingMovement } from '../domain/movimiento-bancario.map.js'
import {
  countMovimientosBancarios,
  getMovimientosSyncEstado,
  replaceMovimientosRango,
} from './movimientos.repository.js'

const TZ = 'America/Argentina/Buenos_Aires'
const DIAS_HISTORIA_INICIAL = 90

export type MovimientosSyncModo = 'inicial' | 'incremental' | 'al_dia'

export interface MovimientosSyncCuentaResult {
  cuentaId: string
  bancoNombre: string
  bancoNumero: string
  modo: MovimientosSyncModo
  desde: string | null
  hasta: string | null
  requestsAlBanco: number
  traidos: number
  eliminados: number
  insertados: number
  enFirestore: number
  ultimaFechaSincronizada: string
}

export interface MovimientosSyncResult {
  hoy: string
  traidos: number
  insertados: number
  eliminados: number
  enFirestore: number
  cuentas: MovimientosSyncCuentaResult[]
}

function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map((part) => Number(part))
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function hoyArgentina(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: TZ })
}

/** `anteriores` no incluye el día en curso: el tope siempre es ayer. */
export function ventanaInicial(now = new Date()): { dateSince: string; dateUntil: string } {
  const hoy = hoyArgentina(now)
  return {
    dateSince: addIsoDays(hoy, -DIAS_HISTORIA_INICIAL),
    dateUntil: addIsoDays(hoy, -1),
  }
}

/**
 * Decide qué tramo pedir para una cuenta.
 * - Sin marca de agua: carga inicial de 90 días.
 * - Con marca de agua: desde ese mismo día (se reemplaza entero) hasta ayer.
 * - Si la marca ya es ayer, no hay nada nuevo que pedir.
 */
export function planificarRango(input: {
  ultimaFechaSincronizada: string | null
  now?: Date
}): { modo: MovimientosSyncModo; desde: string | null; hasta: string | null } {
  const { dateSince, dateUntil } = ventanaInicial(input.now)
  if (!input.ultimaFechaSincronizada) {
    return { modo: 'inicial', desde: dateSince, hasta: dateUntil }
  }
  if (input.ultimaFechaSincronizada >= dateUntil) {
    return { modo: 'al_dia', desde: null, hasta: null }
  }
  return { modo: 'incremental', desde: input.ultimaFechaSincronizada, hasta: dateUntil }
}

async function syncCuenta(input: {
  session: InterbankingInfoSession
  cuenta: CuentaCorrienteObjetivo
  actorUid: string
  now: Date
}): Promise<MovimientosSyncCuentaResult> {
  const estado = await getMovimientosSyncEstado(input.cuenta.cuentaId)
  const plan = planificarRango({
    ultimaFechaSincronizada: estado?.ultimaFechaSincronizada ?? null,
    now: input.now,
  })

  const base = {
    cuentaId: input.cuenta.cuentaId,
    bancoNombre: input.cuenta.bancoNombre,
    bancoNumero: input.cuenta.bancoNumero,
    modo: plan.modo,
    desde: plan.desde,
    hasta: plan.hasta,
  }

  if (plan.modo === 'al_dia' || !plan.desde || !plan.hasta) {
    return {
      ...base,
      requestsAlBanco: 0,
      traidos: 0,
      eliminados: 0,
      insertados: 0,
      enFirestore: await countMovimientosBancarios(input.cuenta.cuentaId),
      ultimaFechaSincronizada: estado?.ultimaFechaSincronizada ?? '',
    }
  }

  const fetched = await fetchMovimientosAnterioresCompleto({
    session: input.session,
    cuenta: input.cuenta,
    dateSince: plan.desde,
    dateUntil: plan.hasta,
  })
  const rows = fetched.rows.map((row) =>
    mapInterbankingMovement({
      row,
      cuentaId: input.cuenta.cuentaId,
      bancoNombre: input.cuenta.bancoNombre,
      bancoNumero: input.cuenta.bancoNumero,
      numeroCuenta: input.cuenta.numeroCuenta,
    }),
  )

  const write = await replaceMovimientosRango({
    cuenta: input.cuenta,
    desde: plan.desde,
    hasta: plan.hasta,
    rows,
    syncedBy: input.actorUid,
    primeraFechaCargada: estado?.primeraFechaCargada ?? plan.desde,
  })

  return {
    ...base,
    requestsAlBanco: fetched.requests,
    traidos: rows.length,
    eliminados: write.eliminados,
    insertados: write.insertados,
    enFirestore: await countMovimientosBancarios(input.cuenta.cuentaId),
    ultimaFechaSincronizada: plan.hasta,
  }
}

export async function syncMovimientosBancarios(input: { actorUid: string }): Promise<MovimientosSyncResult> {
  const now = new Date()
  const session = await openInterbankingInfoSession()
  const cuentas = await listCuentasCorrientesArs(session)
  if (cuentas.length === 0) {
    throw new Error('Interbanking no devolvió cuentas corrientes en ARS para Patagonia, Julio o Córdoba')
  }

  const porCuenta: MovimientosSyncCuentaResult[] = []
  for (const cuenta of cuentas) {
    if (porCuenta.length > 0) await new Promise((resolve) => setTimeout(resolve, 1000))
    porCuenta.push(await syncCuenta({ session, cuenta, actorUid: input.actorUid, now }))
  }

  return {
    hoy: hoyArgentina(now),
    traidos: porCuenta.reduce((acc, c) => acc + c.traidos, 0),
    insertados: porCuenta.reduce((acc, c) => acc + c.insertados, 0),
    eliminados: porCuenta.reduce((acc, c) => acc + c.eliminados, 0),
    enFirestore: await countMovimientosBancarios(),
    cuentas: porCuenta,
  }
}
