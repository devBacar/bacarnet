import { randomUUID } from 'node:crypto'
import {
  fetchMovimientosAnterioresCompleto,
  fetchMovimientosDia,
  listCuentasCorrientesArs,
  openInterbankingInfoSession,
  type CuentaCorrienteObjetivo,
  type InterbankingInfoSession,
} from '../adapters/interbanking-movimientos.js'
import { mapInterbankingMovement } from '../domain/movimiento-bancario.map.js'
import { normalizarNotaMovimiento } from '../domain/categoria-movimiento.js'
import { getCategoriaMovimientoDocument } from './categorias-movimientos.repository.js'
import {
  countMovimientosBancarios,
  countMovimientosFiltrados,
  getMovimientosSyncEstado,
  liberarTurnoSyncMovimientos,
  movimientosBancariosCollection,
  pageMovimientos,
  replaceMovimientosRango,
  scanMovimientosPorTexto,
  sumMovimientosCentavos,
  toListadoItem,
  tomarTurnoSyncMovimientos,
  type MovimientoListadoItem,
} from './movimientos.repository.js'
import { cuitOnceDigitos, nombreContraparteLimpio } from '../../contraparte/domain/normalizar.js'
import {
  enriquecerContrapartes,
  propagarContraparteManual,
} from '../../contraparte/services/enriquecer-contrapartes.js'
import { reconciliarTransferenciasConMovimientos } from '../../transferencias/services/reconciliar-movimientos.js'

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
  /** Filas nuevas que entraron ya categorizadas por una regla. */
  autoCategorizados: number
  /** Movimientos del día en curso (`movement-type=dia`), reemplazados aparte. */
  diaTraidos: number
  diaInsertados: number
  diaAutoCategorizados: number
  enFirestore: number
  ultimaFechaSincronizada: string
}

export interface MovimientosSyncResult {
  hoy: string
  traidos: number
  insertados: number
  eliminados: number
  autoCategorizados: number
  enFirestore: number
  cuentas: MovimientosSyncCuentaResult[]
  reconciliacion: {
    revisadas: number
    efectivizadas: number
    sinCandidato: number
    requierenConfirmacion: number
    reservasReanudadas: number
  }
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
      autoCategorizados: 0,
      diaTraidos: 0,
      diaInsertados: 0,
      diaAutoCategorizados: 0,
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
    autoCategorizados: write.autoCategorizados,
    diaTraidos: 0,
    diaInsertados: 0,
    diaAutoCategorizados: 0,
    enFirestore: await countMovimientosBancarios(input.cuenta.cuentaId),
    ultimaFechaSincronizada: plan.hasta,
  }
}

/** Reemplaza el día de hoy sin mover la marca de agua de `anteriores`. */
async function syncDiaCuenta(input: {
  session: InterbankingInfoSession
  cuenta: CuentaCorrienteObjetivo
  actorUid: string
  fecha: string
}): Promise<{ traidos: number; insertados: number; autoCategorizados: number; requests: number }> {
  const fetched = await fetchMovimientosDia({
    session: input.session,
    cuenta: input.cuenta,
    fecha: input.fecha,
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
  const ajena = rows.find((row) => row.fechaProceso !== input.fecha)
  if (ajena) {
    throw new Error(
      `movement-type=dia de ${input.cuenta.cuentaId} trajo fecha ${ajena.fechaProceso}, se esperaba ${input.fecha}`,
    )
  }
  const write = await replaceMovimientosRango({
    cuenta: input.cuenta,
    desde: input.fecha,
    hasta: input.fecha,
    rows,
    syncedBy: input.actorUid,
    primeraFechaCargada: input.fecha,
    moverMarcaDeAgua: false,
  })
  return {
    traidos: rows.length,
    insertados: write.insertados,
    autoCategorizados: write.autoCategorizados,
    requests: fetched.requests,
  }
}

/** Ya hay otro sync de movimientos corriendo (botón o programado). */
export class MovimientosSyncEnCursoError extends Error {
  constructor() {
    super('Ya se están trayendo los movimientos del banco. Probá de nuevo en un minuto.')
    this.name = 'MovimientosSyncEnCursoError'
  }
}

/** Tope del turno: si el proceso se cae, a los 10 minutos otro puede volver a sincronizar. */
const SYNC_TURNO_MS = 10 * 60 * 1000

export async function syncMovimientosBancarios(input: { actorUid: string }): Promise<MovimientosSyncResult> {
  const token = randomUUID()
  const tomado = await tomarTurnoSyncMovimientos({
    token,
    actorUid: input.actorUid,
    duracionMs: SYNC_TURNO_MS,
  })
  if (!tomado) throw new MovimientosSyncEnCursoError()
  try {
    return await syncMovimientosConTurno(input)
  } finally {
    await liberarTurnoSyncMovimientos(token)
  }
}

async function syncMovimientosConTurno(input: { actorUid: string }): Promise<MovimientosSyncResult> {
  const now = new Date()
  const session = await openInterbankingInfoSession()
  const cuentas = await listCuentasCorrientesArs(session)
  if (cuentas.length === 0) {
    throw new Error('Interbanking no devolvió cuentas corrientes en ARS para Patagonia, Julio o Córdoba')
  }

  const hoy = hoyArgentina(now)
  const porCuenta: MovimientosSyncCuentaResult[] = []
  for (const cuenta of cuentas) {
    if (porCuenta.length > 0) await new Promise((resolve) => setTimeout(resolve, 1000))
    const historico = await syncCuenta({ session, cuenta, actorUid: input.actorUid, now })
    await new Promise((resolve) => setTimeout(resolve, 500))
    const dia = await syncDiaCuenta({ session, cuenta, actorUid: input.actorUid, fecha: hoy })
    porCuenta.push({
      ...historico,
      requestsAlBanco: historico.requestsAlBanco + dia.requests,
      diaTraidos: dia.traidos,
      diaInsertados: dia.insertados,
      diaAutoCategorizados: dia.autoCategorizados,
      enFirestore: await countMovimientosBancarios(cuenta.cuentaId),
    })
  }

  const reconciliacion = await reconciliarTransferenciasConMovimientos({ actorUid: input.actorUid })

  for (const cuenta of porCuenta) {
    const desde = cuenta.modo === 'al_dia' || !cuenta.desde ? hoy : cuenta.desde
    try {
      await enriquecerContrapartes({ cuentaId: cuenta.cuentaId, desde, hasta: hoy, session })
    } catch (err) {
      console.error('[finanzas/movimientos] No se pudieron completar las contrapartes del sync', cuenta.cuentaId, err)
    }
  }

  return {
    hoy: hoyArgentina(now),
    traidos: porCuenta.reduce((acc, c) => acc + c.traidos + c.diaTraidos, 0),
    insertados: porCuenta.reduce((acc, c) => acc + c.insertados + c.diaInsertados, 0),
    eliminados: porCuenta.reduce((acc, c) => acc + c.eliminados, 0),
    autoCategorizados: porCuenta.reduce((acc, c) => acc + c.autoCategorizados + c.diaAutoCategorizados, 0),
    enFirestore: await countMovimientosBancarios(),
    cuentas: porCuenta,
    reconciliacion,
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
export const MOVIMIENTOS_PAGE_DEFAULT = 50
export const MOVIMIENTOS_PAGE_MAX = 100

export class MovimientoAnotacionError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'MovimientoAnotacionError'
    this.status = status
  }
}

export interface MovimientosListadoQuery {
  cuentaId?: string
  desde?: string
  hasta?: string
  tipo?: string
  categoriaId?: string
  q?: string
  page?: string
  limit?: string
}

export interface MovimientosListadoResponse {
  cuentaId: string
  desde: string
  hasta: string
  tipo: 'debito' | 'credito' | null
  categoriaId: string | null
  q: string | null
  page: number
  limit: number
  total: number
  totales: {
    entradasCentavos: number
    salidasCentavos: number
    cantidad: number
  }
  movimientos: MovimientoListadoItem[]
}

function parsePositiveInt(raw: string | undefined, fallback: number, max: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) {
    throw new Error('page y limit tienen que ser enteros mayores a 0')
  }
  return Math.min(n, max)
}

export async function listMovimientosApi(query: MovimientosListadoQuery): Promise<MovimientosListadoResponse> {
  const cuentaId = query.cuentaId?.trim() ?? ''
  const desde = query.desde?.trim() ?? ''
  const hasta = query.hasta?.trim() ?? ''
  if (!cuentaId) throw new Error('cuentaId es obligatorio')
  if (!ISO_DATE.test(desde) || !ISO_DATE.test(hasta)) {
    throw new Error('desde y hasta son obligatorios, con formato AAAA-MM-DD')
  }
  if (desde > hasta) throw new Error('desde no puede ser posterior a hasta')

  const tipoRaw = query.tipo?.trim() ?? ''
  if (tipoRaw && tipoRaw !== 'debito' && tipoRaw !== 'credito') {
    throw new Error('tipo debe ser debito o credito')
  }
  const tipo: 'debito' | 'credito' | null =
    tipoRaw === 'debito' || tipoRaw === 'credito' ? tipoRaw : null
  const categoriaId = query.categoriaId?.trim() ?? ''
  if (categoriaId.length > 200) throw new Error('categoriaId inválido')
  const page = parsePositiveInt(query.page, 1, 10_000)
  const limit = parsePositiveInt(query.limit, MOVIMIENTOS_PAGE_DEFAULT, MOVIMIENTOS_PAGE_MAX)
  const q = query.q?.trim().toLocaleLowerCase('es') ?? ''
  if (q.length > 80) throw new Error('La búsqueda puede tener hasta 80 caracteres')

  const filtro = { cuentaId, desde, hasta, tipo, categoriaId: categoriaId || null }
  const offset = (page - 1) * limit

  if (q) {
    const scanned = await scanMovimientosPorTexto({ filtro, texto: q, offset, limit })
    return {
      cuentaId,
      desde,
      hasta,
      tipo,
      categoriaId: categoriaId || null,
      q,
      page,
      limit,
      total: scanned.total,
      totales: {
        entradasCentavos: scanned.entradasCentavos,
        salidasCentavos: scanned.salidasCentavos,
        cantidad: scanned.total,
      },
      movimientos: scanned.items,
    }
  }

  const [total, entradasCentavos, salidasCentavos, movimientos] = await Promise.all([
    countMovimientosFiltrados(filtro),
    sumMovimientosCentavos(filtro, 'credito'),
    sumMovimientosCentavos(filtro, 'debito'),
    pageMovimientos({ filtro, offset, limit }),
  ])

  return {
    cuentaId,
    desde,
    hasta,
    tipo,
    categoriaId: categoriaId || null,
    q: null,
    page,
    limit,
    total,
    totales: { entradasCentavos, salidasCentavos, cantidad: total },
    movimientos,
  }
}

export async function actualizarAnotacionMovimiento(input: {
  movimientoId: string
  categoriaId?: string | null
  nota?: string | null
  contraparteNombre?: string | null
  contraparteCuit?: string | null
}): Promise<MovimientoListadoItem> {
  const id = input.movimientoId.trim()
  if (!id || id === 'sync' || id === 'contrapartes') {
    throw new MovimientoAnotacionError('Id de movimiento inválido', 400)
  }
  const tieneCategoria = Object.prototype.hasOwnProperty.call(input, 'categoriaId')
  const tieneNota = Object.prototype.hasOwnProperty.call(input, 'nota')
  const tieneNombre = Object.prototype.hasOwnProperty.call(input, 'contraparteNombre')
  const tieneCuit = Object.prototype.hasOwnProperty.call(input, 'contraparteCuit')
  if (!tieneCategoria && !tieneNota && !tieneNombre && !tieneCuit) {
    throw new MovimientoAnotacionError('Indicá una categoría, una nota o de quién es el movimiento', 400)
  }

  const ref = movimientosBancariosCollection().doc(id)
  const snap = await ref.get()
  if (!snap.exists) throw new MovimientoAnotacionError('Movimiento no encontrado', 404)
  const previo = snap.data() ?? {}

  const patch: {
    categoriaId?: string | null
    nota?: string | null
    contraparteNombre?: string | null
    contraparteCuit?: string | null
    contraparteOrigen?: 'manual'
  } = {}
  if (tieneCategoria) {
    if (input.categoriaId == null || input.categoriaId === '') {
      patch.categoriaId = null
    } else {
      const categoria = await getCategoriaMovimientoDocument(input.categoriaId.trim())
      if (!categoria) throw new MovimientoAnotacionError('La categoría no existe', 404)
      patch.categoriaId = categoria.id
    }
  }
  if (tieneNota) {
    patch.nota = normalizarNotaMovimiento(input.nota)
  }
  if (tieneNombre || tieneCuit) {
    const nombreCrudo = tieneNombre ? input.contraparteNombre : previo.contraparteNombre
    const cuitCrudo = tieneCuit ? input.contraparteCuit : previo.contraparteCuit
    if (nombreCrudo != null && typeof nombreCrudo !== 'string') {
      throw new MovimientoAnotacionError('El nombre tiene que ser texto', 400)
    }
    if (cuitCrudo != null && typeof cuitCrudo !== 'string') {
      throw new MovimientoAnotacionError('El CUIT tiene que ser texto', 400)
    }
    if (typeof cuitCrudo === 'string' && cuitCrudo.trim() && !cuitOnceDigitos(cuitCrudo)) {
      throw new MovimientoAnotacionError('El CUIT tiene que tener 11 dígitos', 400)
    }
    patch.contraparteNombre = nombreContraparteLimpio(nombreCrudo)
    patch.contraparteCuit = cuitOnceDigitos(cuitCrudo)
    patch.contraparteOrigen = 'manual'
  }

  await ref.update(patch)
  if (patch.contraparteOrigen === 'manual' && patch.contraparteNombre && patch.contraparteCuit) {
    await propagarContraparteManual({
      exceptoMovimientoId: id,
      nombre: patch.contraparteNombre,
      cuit: patch.contraparteCuit,
    })
  }
  const updated = await ref.get()
  return toListadoItem(id, updated.data() ?? {})
}
