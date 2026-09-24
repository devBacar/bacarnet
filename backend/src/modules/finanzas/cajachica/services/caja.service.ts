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
  ejecutarFondeoAtomico,
  getCajaDoc,
  getCierreDoc,
  listCajasDocs,
  listCierresForCaja,
  listCierresPendientesDocs,
  listMovimientosForCaja,
  parseDateInput,
  reassignCajaResponsable,
  saveCierreDoc,
  softDeleteCajaDoc,
  timestampFromDate,
  updateCierreDoc,
  userIsResponsableOfAnyCaja,
} from './caja.repository.js'
import { saveCajaComprobante, signedComprobanteUrl } from './cajaComprobanteStorage.js'

function tsToIso(ts: { toDate?: () => Date } | null | undefined): string | null {
  if (!ts || typeof ts.toDate !== 'function') return null
  return ts.toDate().toISOString()
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
    fondeoVinculadoId: data.fondeoVinculadoId,
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

export async function listCajasForUser(user: AuthedUser) {
  const all = await listCajasDocs()
  const activas = all.filter((c) => isCajaActiva(c.data))
  const visible = canBrowseAllCajas(user)
    ? activas
    : activas.filter((c) => c.data.responsableUid === user.uid && c.data.tipo === 'chica')
  return Promise.all(visible.map(({ id, data }) => serializeCaja(id, data)))
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

export async function fondearCajaChica(
  user: AuthedUser,
  principalId: string,
  body: Record<string, unknown>,
) {
  if (!isFinanzasCajaLider(user)) {
    throw new Error('Solo el líder de finanzas puede fondear cajas chicas')
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

export async function listMovimientos(user: AuthedUser, cajaId: string) {
  const caja = await getCajaDoc(cajaId)
  if (!caja) throw new Error('Caja no encontrada')
  if (!canAccessCaja(user, caja.responsableUid)) {
    throw new Error('No tenés acceso a esta caja')
  }
  const rows = await listMovimientosForCaja(cajaId)
  return Promise.all(rows.map(({ id, data }) => serializeMovimiento(id, data)))
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
  if (!canAccessCaja(input.user, caja.responsableUid)) {
    throw new Error('No tenés acceso a esta caja')
  }
  if (caja.tipo === 'chica' && (await cajaHasCierrePendienteAprobacion(input.cajaId))) {
    throw new Error('La caja está cerrada esperando aprobación; no se pueden cargar movimientos')
  }
  if (caja.tipo === 'principal' && !isFinanzasCajaLider(input.user)) {
    throw new Error('Los movimientos en caja principal solo los registra el líder de finanzas')
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
  if (!canAccessCaja(user, caja.responsableUid)) {
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
