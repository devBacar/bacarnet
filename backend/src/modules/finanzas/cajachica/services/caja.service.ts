import { randomUUID } from 'node:crypto'
import type { AuthedUser } from '../../../auth/middleware.js'
import {
  calcularDiferenciaCierre,
  calcularSaldoTeoricoCierre,
} from '../domain/cierre.calculo.js'
import type { CajaDocument, CajaMovimientoDocument, CajaMovimientoTipo } from '../domain/caja.types.js'
import {
  canAccessCaja,
  canBrowseAllCajas,
  isFinanzasCajaLider,
} from './caja.access.js'
import {
  cajaHasCierrePendienteAprobacion,
  createCajaDoc,
  createMovimientoWithSaldo,
  ejecutarCompraUsdAtomica,
  ejecutarFondeoAtomico,
  getCajaDoc,
  getCierreDoc,
  listCajaResponsableOptions,
  listCajasDocs,
  listCierresForCaja,
  listCierresPendientesDocs,
  listMovimientosForCaja,
  parseDateInput,
  reassignCajaResponsable,
  renameCajaDoc,
  saveCierreDoc,
  softDeleteCajaDoc,
  timestampFromDate,
  updateCierreDoc,
  userIsResponsableOfAnyCaja,
  userIsResponsableOfPrincipal,
} from './caja.repository.js'
import { saveCajaComprobante, signedComprobanteUrl } from './cajaComprobanteStorage.js'

function timestampToDate(ts: unknown): Date | null {
  if (!ts) return null
  if (ts instanceof Date) return Number.isNaN(ts.getTime()) ? null : ts
  if (typeof ts === 'string') {
    const parsed = new Date(ts)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (typeof ts === 'object') {
    const maybe = ts as { toDate?: () => Date; seconds?: number; _seconds?: number; nanoseconds?: number; _nanoseconds?: number }
    if (typeof maybe.toDate === 'function') {
      const parsed = maybe.toDate()
      return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null
    }
    const seconds = maybe.seconds ?? maybe._seconds
    if (typeof seconds === 'number') {
      const nanos = maybe.nanoseconds ?? maybe._nanoseconds ?? 0
      return new Date(seconds * 1000 + nanos / 1e6)
    }
  }
  return null
}

function tsToIso(ts: unknown): string | null {
  const parsed = timestampToDate(ts)
  return parsed ? parsed.toISOString() : null
}

function isCajaActiva(doc: CajaDocument): boolean {
  return doc.estado !== 'inactiva'
}

async function serializeCaja(id: string, doc: CajaDocument) {
  const bloqueadaPorCierre =
    doc.tipo === 'chica' && isCajaActiva(doc)
      ? await cajaHasCierrePendienteAprobacion(id)
      : false
  return {
    id,
    nombre: doc.nombre,
    tipo: doc.tipo,
    moneda: doc.moneda,
    cajaPadreId: doc.cajaPadreId,
    responsableUid: doc.responsableUid,
    saldoActualCentavos: doc.saldoActualCentavos,
    estado: doc.estado === 'inactiva' ? 'inactiva' : 'activa',
    bloqueadaPorCierre,
    createdAt: tsToIso(doc.createdAt),
    updatedAt: tsToIso(doc.updatedAt),
  }
}

async function serializeMovimiento(id: string, data: CajaMovimientoDocument) {
  return {
    id,
    cajaId: data.cajaId,
    tipo: data.tipo,
    concepto: data.concepto,
    montoCentavos: data.montoCentavos,
    fecha: tsToIso(data.fecha),
    comprobanteUrl: await signedComprobanteUrl(data.comprobanteStoragePath),
    categoria: data.categoria,
    esViatico: data.esViatico,
    beneficiarioEmpleado: data.beneficiarioEmpleado,
    fondeoVinculadoId: data.fondeoVinculadoId ?? null,
    operacionVinculadaId: data.operacionVinculadaId ?? data.fondeoVinculadoId ?? null,
    cotizacionCentavosPorUsd: data.cotizacionCentavosPorUsd ?? null,
    registradoPor: data.registradoPor,
    createdAt: tsToIso(data.createdAt),
  }
}

function serializeCierre(id: string, data: import('../domain/caja.types.js').CajaCierreDocument) {
  return {
    id,
    cajaId: data.cajaId,
    periodoDesde: tsToIso(data.periodoDesde),
    periodoHasta: tsToIso(data.periodoHasta),
    saldoInicial: data.saldoInicial,
    totalFondeosRecibidos: data.totalFondeosRecibidos,
    totalEgresos: data.totalEgresos,
    totalEgresosConComprobante: data.totalEgresosConComprobante,
    totalEgresosSinComprobante: data.totalEgresosSinComprobante,
    totalIngresos: data.totalIngresos,
    saldoTeorico: data.saldoTeorico,
    efectivoContado: data.efectivoContado,
    diferencia: data.diferencia,
    estado: data.estado,
    aprobadaPorUid: data.aprobadaPorUid,
    createdAt: tsToIso(data.createdAt),
  }
}

export async function assertCajasModuleAccess(user: AuthedUser): Promise<boolean> {
  if (canBrowseAllCajas(user)) return true
  return userIsResponsableOfAnyCaja(user.uid)
}

export const assertCajaChicaModuleAccess = assertCajasModuleAccess

export async function listResponsablesForLider(user: AuthedUser) {
  if (!isFinanzasCajaLider(user)) {
    throw new Error('Solo el líder de finanzas puede consultar responsables')
  }
  return listCajaResponsableOptions()
}

export async function listCajasForUser(user: AuthedUser) {
  const all = await listCajasDocs()
  const activas = all.filter((c) => isCajaActiva(c.data))
  const puedeVerTodas =
    canBrowseAllCajas(user) || (await userIsResponsableOfPrincipal(user.uid))
  const visible = puedeVerTodas
    ? activas
    : activas.filter((c) => c.data.responsableUid === user.uid && c.data.tipo === 'chica')
  const cajas = await Promise.all(visible.map(({ id, data }) => serializeCaja(id, data)))
  return cajas.sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'principal' ? -1 : 1
    if (a.moneda !== b.moneda) return a.moneda === 'ARS' ? -1 : 1
    return a.nombre.localeCompare(b.nombre, 'es')
  })
}

async function canReadCajaForUser(user: AuthedUser, responsableUid: string): Promise<boolean> {
  if (canAccessCaja(user, responsableUid)) return true
  return userIsResponsableOfPrincipal(user.uid)
}

export async function createCajaForLider(user: AuthedUser, body: Record<string, unknown>) {
  if (!isFinanzasCajaLider(user)) {
    throw new Error('Solo el líder de finanzas puede crear cajas')
  }
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
  const responsableUid =
    typeof body.responsableUid === 'string' ? body.responsableUid.trim() : ''
  const tipoRaw = body.tipo
  const tipo = tipoRaw === 'principal' || tipoRaw === 'chica' ? tipoRaw : null
  const monedaRaw = body.moneda
  const moneda = monedaRaw === 'USD' || monedaRaw === 'ARS' ? monedaRaw : 'ARS'
  const cajaPadreId =
    typeof body.cajaPadreId === 'string' && body.cajaPadreId.trim()
      ? body.cajaPadreId.trim()
      : null

  if (!nombre || !responsableUid || !tipo) {
    throw new Error('Nombre, tipo y responsable son obligatorios')
  }

  const id = randomUUID()
  await createCajaDoc({
    id,
    nombre,
    tipo,
    moneda,
    cajaPadreId: tipo === 'chica' ? cajaPadreId : null,
    responsableUid,
    createdBy: user.uid,
  })
  const doc = await getCajaDoc(id)
  if (!doc) throw new Error('No se pudo leer la caja creada')
  return serializeCaja(id, doc)
}

export async function softDeleteCaja(user: AuthedUser, cajaId: string) {
  if (!isFinanzasCajaLider(user)) {
    throw new Error('Solo el líder de finanzas puede eliminar cajas')
  }
  const caja = await getCajaDoc(cajaId)
  if (!caja) throw new Error('Caja no encontrada')
  if (!isCajaActiva(caja)) throw new Error('La caja ya está inactiva')
  if (caja.tipo === 'principal') {
    throw new Error('Las cajas principales no se pueden eliminar')
  }
  if (caja.saldoActualCentavos !== 0) {
    throw new Error('Solo se puede eliminar una caja con saldo $0')
  }
  if (await cajaHasCierrePendienteAprobacion(cajaId)) {
    throw new Error('No se puede eliminar: hay un cierre pendiente de aprobación')
  }
  await softDeleteCajaDoc(cajaId)
  const updated = await getCajaDoc(cajaId)
  if (!updated) throw new Error('Caja no encontrada')
  return serializeCaja(cajaId, updated)
}

export async function changeCajaResponsable(
  user: AuthedUser,
  cajaId: string,
  body: Record<string, unknown>,
) {
  if (!isFinanzasCajaLider(user)) {
    throw new Error('Solo el líder de finanzas puede cambiar el responsable')
  }
  const caja = await getCajaDoc(cajaId)
  if (!caja) throw new Error('Caja no encontrada')
  const responsableNuevoUid =
    typeof body.responsableUid === 'string' ? body.responsableUid.trim() : ''
  if (!responsableNuevoUid) throw new Error('responsableUid requerido')
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim() || null : null

  await reassignCajaResponsable({
    cajaId,
    responsableNuevoUid,
    motivo,
    registradoPor: user.uid,
  })
  const updated = await getCajaDoc(cajaId)
  if (!updated) throw new Error('Caja no encontrada')
  return serializeCaja(cajaId, updated)
}

export async function renameCaja(
  user: AuthedUser,
  cajaId: string,
  body: Record<string, unknown>,
) {
  if (!isFinanzasCajaLider(user)) {
    throw new Error('Solo el líder de finanzas puede editar cajas')
  }
  const caja = await getCajaDoc(cajaId)
  if (!caja) throw new Error('Caja no encontrada')
  if (!isCajaActiva(caja)) throw new Error('La caja está inactiva')
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
  if (nombre.length < 3) throw new Error('El nombre debe tener al menos 3 caracteres')
  if (nombre.length > 80) throw new Error('El nombre no puede superar 80 caracteres')
  await renameCajaDoc(cajaId, nombre)
  const updated = await getCajaDoc(cajaId)
  if (!updated) throw new Error('Caja no encontrada')
  return serializeCaja(cajaId, updated)
}

export async function fondearCajaChica(
  user: AuthedUser,
  principalId: string,
  body: Record<string, unknown>,
) {
  const principal = await getCajaDoc(principalId)
  if (!principal) throw new Error('Caja principal no encontrada')
  if (
    !isFinanzasCajaLider(user) &&
    !(principal.tipo === 'principal' && principal.responsableUid === user.uid)
  ) {
    throw new Error('Solo el líder o responsable de la principal puede fondear cajas chicas')
  }
  const cajaChicaId =
    typeof body.cajaChicaId === 'string' ? body.cajaChicaId.trim() : ''
  const montoRaw = body.montoCentavos
  const montoCentavos =
    typeof montoRaw === 'number'
      ? montoRaw
      : typeof montoRaw === 'string'
        ? Number.parseInt(montoRaw, 10)
        : NaN
  const concepto =
    typeof body.concepto === 'string' && body.concepto.trim()
      ? body.concepto.trim()
      : 'Fondeo desde caja principal'

  if (!cajaChicaId) throw new Error('cajaChicaId es obligatorio')
  if (!Number.isInteger(montoCentavos) || montoCentavos <= 0) {
    throw new Error('Monto inválido')
  }

  const chica = await getCajaDoc(cajaChicaId)
  if (!chica) throw new Error('Caja chica no encontrada')
  if (!isCajaActiva(chica)) throw new Error('No se puede fondear una caja inactiva')
  if (await cajaHasCierrePendienteAprobacion(cajaChicaId)) {
    throw new Error('La caja está cerrada esperando aprobación; no se puede fondear')
  }

  const fondeoVinculadoId = randomUUID()
  await ejecutarFondeoAtomico({
    principalId,
    chicaId: cajaChicaId,
    montoCentavos,
    concepto,
    registradoPor: user.uid,
    fondeoVinculadoId,
    movimientoEnviadoId: randomUUID(),
    movimientoRecibidoId: randomUUID(),
    fecha: timestampFromDate(new Date()),
  })

  return { ok: true as const, fondeoVinculadoId, principalId, cajaChicaId, montoCentavos }
}

export async function comprarUsdDesdePrincipal(input: {
  user: AuthedUser
  cajaArsId: string
  body: Record<string, unknown>
  comprobante?: { fileName: string; mimeType: string; buffer: Buffer } | null
}) {
  const cajaArs = await getCajaDoc(input.cajaArsId)
  if (!cajaArs) throw new Error('Caja principal ARS no encontrada')
  if (!isCajaActiva(cajaArs)) throw new Error('La caja está inactiva')
  if (cajaArs.tipo !== 'principal' || cajaArs.moneda !== 'ARS') {
    throw new Error('La compra de USD debe registrarse desde una caja principal ARS')
  }
  if (
    !isFinanzasCajaLider(input.user) &&
    cajaArs.responsableUid !== input.user.uid
  ) {
    throw new Error('Solo el líder o responsable de la principal ARS puede comprar USD')
  }

  const parsePositiveInteger = (value: unknown): number => {
    if (typeof value === 'number') return value
    if (typeof value === 'string' && value.trim()) return Number.parseInt(value, 10)
    return NaN
  }
  const cotizacionCentavosPorUsd = parsePositiveInteger(input.body.cotizacionCentavosPorUsd)
  const montoUsdCentavos = parsePositiveInteger(input.body.montoUsdCentavos)
  if (!Number.isSafeInteger(cotizacionCentavosPorUsd) || cotizacionCentavosPorUsd <= 0) {
    throw new Error('Cotización inválida')
  }
  if (!Number.isSafeInteger(montoUsdCentavos) || montoUsdCentavos <= 0) {
    throw new Error('Cantidad de dólares inválida')
  }
  const producto = cotizacionCentavosPorUsd * montoUsdCentavos
  if (!Number.isSafeInteger(producto)) throw new Error('El monto de la operación es demasiado grande')
  const montoPesosCentavos = Math.round(producto / 100)
  if (montoPesosCentavos <= 0) throw new Error('Monto en pesos inválido')

  const cajas = await listCajasDocs()
  const cajaUsd = cajas.find(
    ({ data }) =>
      data.tipo === 'principal' &&
      data.moneda === 'USD' &&
      isCajaActiva(data),
  )
  if (!cajaUsd) throw new Error('No existe una caja principal USD activa')

  let comprobanteStoragePath: string | null = null
  if (input.comprobante && input.comprobante.buffer.length > 0) {
    comprobanteStoragePath = await saveCajaComprobante(
      input.cajaArsId,
      input.comprobante.fileName,
      input.comprobante.mimeType,
      input.comprobante.buffer,
    )
  }

  const operacionVinculadaId = randomUUID()
  const cotizacion = (cotizacionCentavosPorUsd / 100).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const concepto = `Compra USD · TC $${cotizacion}`
  await ejecutarCompraUsdAtomica({
    cajaArsId: input.cajaArsId,
    cajaUsdId: cajaUsd.id,
    montoPesosCentavos,
    montoUsdCentavos,
    cotizacionCentavosPorUsd,
    concepto,
    comprobanteStoragePath,
    registradoPor: input.user.uid,
    operacionVinculadaId,
    movimientoArsId: randomUUID(),
    movimientoUsdId: randomUUID(),
    fecha: timestampFromDate(new Date()),
  })

  return {
    ok: true as const,
    operacionVinculadaId,
    cajaArsId: input.cajaArsId,
    cajaUsdId: cajaUsd.id,
    montoPesosCentavos,
    montoUsdCentavos,
    cotizacionCentavosPorUsd,
  }
}

const RETENCION_MOVIMIENTOS_ANIOS = 2

function parseFiltroFecha(value: string | undefined, finDelDia: boolean): Date | undefined {
  if (!value?.trim()) return undefined
  const raw = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const iso = `${raw}T${finDelDia ? '23:59:59.999' : '00:00:00.000'}-03:00`
    const parsed = new Date(iso)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed
  }
  return parseDateInput(raw)
}

export async function listMovimientos(
  user: AuthedUser,
  cajaId: string,
  filters: { desde?: string; hasta?: string; tipo?: string; q?: string } = {},
) {
  const caja = await getCajaDoc(cajaId)
  if (!caja) throw new Error('Caja no encontrada')
  if (!(await canReadCajaForUser(user, caja.responsableUid))) {
    throw new Error('No tenés acceso a esta caja')
  }
  const rows = await listMovimientosForCaja(cajaId)
  let saldo = caja.saldoActualCentavos
  const conSaldo = rows.map((row) => {
    const saldoPosteriorCentavos = saldo
    const signo =
      row.data.tipo === 'ingreso' || row.data.tipo === 'fondeo_recibido' ? 1 : -1
    saldo -= signo * row.data.montoCentavos
    return { ...row, saldoPosteriorCentavos }
  })

  const desde = parseFiltroFecha(filters.desde, false)
  const hasta = parseFiltroFecha(filters.hasta, true)
  const tipo = filters.tipo?.trim()
  const q = filters.q?.trim().toLocaleLowerCase('es')
  const filtrados = conSaldo.filter(({ data }) => {
    const fecha = timestampToDate(data.fecha)
    if (desde && fecha && fecha.getTime() < desde.getTime()) return false
    if (hasta && fecha && fecha.getTime() > hasta.getTime()) return false
    if (tipo === 'ingreso' && data.tipo !== 'ingreso' && data.tipo !== 'fondeo_recibido') {
      return false
    }
    if (tipo === 'egreso' && data.tipo !== 'egreso' && data.tipo !== 'fondeo_enviado') {
      return false
    }
    if (tipo === 'fondeo' && data.tipo !== 'fondeo_recibido' && data.tipo !== 'fondeo_enviado') {
      return false
    }
    if (q) {
      const haystack = `${data.concepto} ${data.categoria ?? ''} ${data.beneficiarioEmpleado ?? ''}`.toLocaleLowerCase(
        'es',
      )
      if (!haystack.includes(q)) return false
    }
    return true
  })

  const movimientos = await Promise.all(
    filtrados.map(async ({ id, data, saldoPosteriorCentavos }) => ({
      ...(await serializeMovimiento(id, data)),
      saldoPosteriorCentavos,
    })),
  )
  return {
    movimientos,
    totalSinFiltro: rows.length,
    retencionAnios: RETENCION_MOVIMIENTOS_ANIOS,
  }
}

export async function registerMovimiento(input: {
  user: AuthedUser
  cajaId: string
  body: Record<string, unknown>
  comprobante?: { fileName: string; mimeType: string; buffer: Buffer } | null
}) {
  const caja = await getCajaDoc(input.cajaId)
  if (!caja) throw new Error('Caja no encontrada')
  if (!isCajaActiva(caja)) throw new Error('La caja está inactiva')
  if (!(await canReadCajaForUser(input.user, caja.responsableUid))) {
    throw new Error('No tenés acceso a esta caja')
  }
  if (caja.tipo === 'chica' && (await cajaHasCierrePendienteAprobacion(input.cajaId))) {
    throw new Error('La caja está cerrada esperando aprobación; no se pueden cargar movimientos')
  }
  if (
    caja.tipo === 'principal' &&
    !isFinanzasCajaLider(input.user) &&
    caja.responsableUid !== input.user.uid
  ) {
    throw new Error('Los movimientos en caja principal solo los registra su responsable o el líder')
  }
  if (
    caja.tipo === 'chica' &&
    !isFinanzasCajaLider(input.user) &&
    caja.responsableUid !== input.user.uid
  ) {
    throw new Error('No tenés acceso a esta caja')
  }

  const tipoRaw = input.body.tipo
  const tipo: CajaMovimientoTipo =
    tipoRaw === 'ingreso' || tipoRaw === 'egreso' ? tipoRaw : 'egreso'

  if (caja.tipo === 'chica' && tipo === 'ingreso') {
    throw new Error(
      'Una caja chica no admite ingresos libres; el dinero entra solo por fondeo desde la principal',
    )
  }

  const concepto = typeof input.body.concepto === 'string' ? input.body.concepto.trim() : ''
  const montoRaw = input.body.montoCentavos
  const montoCentavos =
    typeof montoRaw === 'number'
      ? montoRaw
      : typeof montoRaw === 'string' && montoRaw.trim()
        ? Number.parseInt(montoRaw, 10)
        : NaN
  const fecha = parseDateInput(input.body.fecha) ?? new Date()
  const categoria =
    typeof input.body.categoria === 'string' ? input.body.categoria.trim() || null : null
  const esViatico =
    input.body.esViatico === true || input.body.esViatico === 'true' || input.body.esViatico === '1'
  const beneficiarioEmpleado =
    typeof input.body.beneficiarioEmpleado === 'string'
      ? input.body.beneficiarioEmpleado.trim() || null
      : null

  if (!concepto) throw new Error('Concepto obligatorio')
  if (typeof montoCentavos !== 'number' || !Number.isInteger(montoCentavos) || montoCentavos <= 0) {
    throw new Error('Monto inválido')
  }
  if (esViatico && !beneficiarioEmpleado) {
    throw new Error('Indicá para quién es el viático')
  }

  let comprobanteStoragePath: string | null = null
  if (input.comprobante && input.comprobante.buffer.length > 0) {
    comprobanteStoragePath = await saveCajaComprobante(
      input.cajaId,
      input.comprobante.fileName,
      input.comprobante.mimeType,
      input.comprobante.buffer,
    )
  }

  const movimientoId = randomUUID()
  const doc: Omit<CajaMovimientoDocument, 'createdAt'> = {
    cajaId: input.cajaId,
    tipo,
    concepto,
    montoCentavos,
    fecha: timestampFromDate(fecha),
    comprobanteStoragePath,
    categoria: esViatico ? 'viatico' : categoria,
    esViatico,
    beneficiarioEmpleado: esViatico ? beneficiarioEmpleado : null,
    fondeoVinculadoId: null,
    operacionVinculadaId: null,
    cotizacionCentavosPorUsd: null,
    registradoPor: input.user.uid,
  }

  await createMovimientoWithSaldo({ movimientoId, doc })
  return serializeMovimiento(movimientoId, { ...doc, createdAt: timestampFromDate(new Date()) })
}

function movimientoEnPeriodo(mov: CajaMovimientoDocument, desde: Date, hasta: Date): boolean {
  const f = mov.fecha.toDate()
  return f.getTime() >= desde.getTime() && f.getTime() <= hasta.getTime()
}

function computePeriodTotals(movimientos: CajaMovimientoDocument[], desde: Date, hasta: Date) {
  let totalFondeosRecibidos = 0
  let totalIngresos = 0
  let totalEgresos = 0
  let totalEgresosConComprobante = 0
  let totalEgresosSinComprobante = 0

  for (const mov of movimientos) {
    if (!movimientoEnPeriodo(mov, desde, hasta)) continue
    if (mov.tipo === 'fondeo_recibido') totalFondeosRecibidos += mov.montoCentavos
    else if (mov.tipo === 'ingreso') totalIngresos += mov.montoCentavos
    else if (mov.tipo === 'egreso') {
      totalEgresos += mov.montoCentavos
      if (mov.comprobanteStoragePath) totalEgresosConComprobante += mov.montoCentavos
      else totalEgresosSinComprobante += mov.montoCentavos
    }
  }

  return {
    totalFondeosRecibidos,
    totalIngresos,
    totalEgresos,
    totalEgresosConComprobante,
    totalEgresosSinComprobante,
  }
}

async function resolveSaldoInicialPeriodo(cajaId: string, periodoDesde: Date): Promise<number> {
  const cierres = await listCierresForCaja(cajaId)
  const cerrados = cierres
    .filter((r) => r.data.estado === 'cerrada' || r.data.estado === 'aprobada')
    .sort((a, b) => (b.data.periodoHasta.toMillis?.() ?? 0) - (a.data.periodoHasta.toMillis?.() ?? 0))

  if (cerrados.length > 0) {
    const last = cerrados[0]!.data
    return last.efectivoContado ?? last.saldoTeorico
  }

  const caja = await getCajaDoc(cajaId)
  if (!caja) throw new Error('Caja no encontrada')
  const movs = await listMovimientosForCaja(cajaId)
  let saldo = caja.saldoActualCentavos
  for (const { data } of movs) {
    if (data.fecha.toDate().getTime() >= periodoDesde.getTime()) {
      const sign = data.tipo === 'ingreso' || data.tipo === 'fondeo_recibido' ? -1 : 1
      saldo += sign * data.montoCentavos
    }
  }
  return saldo
}

export async function listCierres(user: AuthedUser, cajaId: string) {
  const caja = await getCajaDoc(cajaId)
  if (!caja) throw new Error('Caja no encontrada')
  if (!(await canReadCajaForUser(user, caja.responsableUid))) {
    throw new Error('No tenés acceso a esta caja')
  }
  const rows = await listCierresForCaja(cajaId)
  return rows.map(({ id, data }) => serializeCierre(id, data))
}

export async function listCierresPendientes(user: AuthedUser) {
  if (!isFinanzasCajaLider(user)) {
    throw new Error('Solo el líder de finanzas puede ver cierres pendientes')
  }
  const rows = await listCierresPendientesDocs()
  const enriched = await Promise.all(
    rows.map(async ({ id, data }) => {
      const caja = await getCajaDoc(data.cajaId)
      return {
        ...serializeCierre(id, data),
        cajaNombre: caja?.nombre ?? null,
        cajaMoneda: caja?.moneda ?? null,
        cajaPadreId: caja?.cajaPadreId ?? null,
      }
    }),
  )
  return enriched
}

export async function cerrarCaja(user: AuthedUser, cajaId: string, body: Record<string, unknown>) {
  const caja = await getCajaDoc(cajaId)
  if (!caja) throw new Error('Caja no encontrada')
  if (!isCajaActiva(caja)) throw new Error('La caja está inactiva')
  if (caja.tipo !== 'chica') {
    throw new Error('Solo las cajas chicas tienen cierre de caja')
  }
  if (!canAccessCaja(user, caja.responsableUid)) {
    throw new Error('No tenés acceso a esta caja')
  }
  if (await cajaHasCierrePendienteAprobacion(cajaId)) {
    throw new Error('Ya hay un cierre pendiente de aprobación para esta caja')
  }

  const periodoDesde = parseDateInput(body.periodoDesde)
  const periodoHasta = parseDateInput(body.periodoHasta) ?? new Date()
  if (!periodoDesde) throw new Error('periodoDesde requerido')
  if (periodoHasta.getTime() < periodoDesde.getTime()) {
    throw new Error('El fin del período no puede ser anterior al inicio')
  }

  const efectivoContado =
    typeof body.efectivoContado === 'number' && Number.isInteger(body.efectivoContado)
      ? body.efectivoContado
      : typeof body.saldoFinalConfirmadoCentavos === 'number'
        ? body.saldoFinalConfirmadoCentavos
        : null

  const saldoInicial = await resolveSaldoInicialPeriodo(cajaId, periodoDesde)
  const movRows = await listMovimientosForCaja(cajaId)
  const movs = movRows.map((m) => m.data)
  const totals = computePeriodTotals(movs, periodoDesde, periodoHasta)
  const saldoTeorico = calcularSaldoTeoricoCierre({
    saldoInicial,
    totalFondeosRecibidos: totals.totalFondeosRecibidos,
    totalIngresos: totals.totalIngresos,
    totalEgresos: totals.totalEgresos,
  })

  const diferencia =
    efectivoContado !== null ? calcularDiferenciaCierre(saldoTeorico, efectivoContado) : null
  const cerrar = body.cerrar === true || efectivoContado !== null

  const cierreId = randomUUID()
  await saveCierreDoc(cierreId, {
    cajaId,
    periodoDesde: timestampFromDate(periodoDesde),
    periodoHasta: timestampFromDate(periodoHasta),
    saldoInicial,
    totalFondeosRecibidos: totals.totalFondeosRecibidos,
    totalEgresos: totals.totalEgresos,
    totalEgresosConComprobante: totals.totalEgresosConComprobante,
    totalEgresosSinComprobante: totals.totalEgresosSinComprobante,
    totalIngresos: totals.totalIngresos,
    saldoTeorico,
    efectivoContado,
    diferencia,
    estado: cerrar ? 'cerrada' : 'borrador',
    aprobadaPorUid: null,
    createdBy: user.uid,
  })

  const saved = await getCierreDoc(cierreId)
  if (!saved) throw new Error('No se pudo leer el cierre')
  return serializeCierre(saved.id, saved.data)
}

export async function aprobarCierre(user: AuthedUser, cajaId: string, cierreId: string) {
  if (!isFinanzasCajaLider(user)) {
    throw new Error('Solo el líder de finanzas puede aprobar cierres')
  }
  const cierre = await getCierreDoc(cierreId)
  if (!cierre || cierre.data.cajaId !== cajaId) throw new Error('Cierre no encontrado')
  if (cierre.data.estado !== 'cerrada') {
    throw new Error('El cierre debe estar cerrado antes de aprobarlo')
  }

  await updateCierreDoc(cierreId, {
    estado: 'aprobada',
    aprobadaPorUid: user.uid,
  })

  const updated = await getCierreDoc(cierreId)
  if (!updated) throw new Error('Cierre no encontrado')
  return serializeCierre(updated.id, updated.data)
}
