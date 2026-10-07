import {
  FieldPath,
  FieldValue,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { CHEQUES_COLLECTION } from '../../cheques/services/cheques.repository.js'
import {
  openInterbankingInfoSession,
  type InterbankingInfoSession,
} from '../../movimientos/adapters/interbanking-movimientos.js'
import { listCategoriaMovimientoDocuments } from '../../movimientos/services/categorias-movimientos.repository.js'
import { movimientosBancariosCollection } from '../../movimientos/services/movimientos.repository.js'
import { transferenciasIbPorDia } from '../adapters/cache-transferencias-ib.js'
import { fetchTransferenciasIb } from '../adapters/fetch-transferencias-ib.js'
import type { ChequeParaContraparte } from '../domain/fuente-cheque.js'
import type { ContraparteGuardada, ContraparteOrigen } from '../domain/contraparte.types.js'
import { contraparteDesdeBanco } from '../domain/fuente-banco.js'
import type { ItemAgenda } from '../domain/fuente-agenda.js'
import {
  movimientoPuedeVenirDeInterbanking,
  type TransferenciaIbRecibida,
} from '../domain/fuente-interbanking.js'
import type { IdentidadDestino, TransferenciaParaContraparte } from '../domain/fuente-transferencia.js'
import { cuitOnceDigitos, nombreContraparteLimpio, soloDigitos } from '../domain/normalizar.js'
import {
  resolverLote,
  type ContextoContraparte,
  type MovimientoParaContraparte,
} from '../domain/resolver-lote.js'

export const FINANZAS_CONTRAPARTES_COLLECTION = 'finanzasContrapartes'
const TRANSFERENCIAS_COLLECTION = 'transferenciasConfeccionadas'
const DESTINATARIOS_COLLECTION = 'finanzasDestinatarios'
const COMPROMISOS_COLLECTION = 'compromisosPago'
const COBROS_COLLECTION = 'cobrosEsperados'
const WRITE_CHUNK = 400
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const RANGO_ORIGEN: Record<ContraparteOrigen, number> = {
  manual: 5,
  banco: 4,
  transferencia: 3,
  agenda: 2,
  cheque: 2,
  interbanking: 1,
  directorio: 0,
  categoria: 0,
}

export interface ResultadoEnriquecimiento {
  revisados: number
  actualizados: number
  sinContraparte: number
  porOrigen: Record<string, number>
  directorioActualizados: number
}

export async function enriquecerContrapartes(input: {
  desde?: string
  hasta?: string
  cuentaId?: string
  simular?: boolean
  session?: InterbankingInfoSession
} = {}): Promise<ResultadoEnriquecimiento> {
  const desde = input.desde?.trim() || undefined
  const hasta = input.hasta?.trim() || undefined
  const cuentaId = input.cuentaId?.trim() || undefined
  if (desde && !ISO_DATE.test(desde)) throw new Error('desde tiene que ser AAAA-MM-DD')
  if (hasta && !ISO_DATE.test(hasta)) throw new Error('hasta tiene que ser AAAA-MM-DD')
  if (desde && hasta && desde > hasta) throw new Error('desde no puede ser posterior a hasta')

  const movimientos = (await listarMovimientos()).filter((mov) => {
    if (cuentaId && mov.cuentaId !== cuentaId) return false
    if (desde && mov.fechaProceso < desde) return false
    if (hasta && mov.fechaProceso > hasta) return false
    return true
  })

  const ctx = await cargarContexto(movimientos, input.session)
  const resultados = resolverLote(movimientos, ctx)
  const porId = new Map(resultados.map((resultado) => [resultado.id, resultado]))

  const cambios: Array<{ id: string; contraparte: ContraparteGuardada }> = []
  const porOrigen: Record<string, number> = {}
  let sinContraparte = 0
  for (const mov of movimientos) {
    const resultado = porId.get(mov.id)
    if (!resultado) continue
    if (!resultado.contraparte.nombre) sinContraparte += 1
    if (!cambio(mov, resultado.contraparte)) continue
    cambios.push({ id: mov.id, contraparte: resultado.contraparte })
    const origen = resultado.contraparte.origen ?? 'sin_origen'
    porOrigen[origen] = (porOrigen[origen] ?? 0) + 1
  }

  await guardarMovimientos(cambios, input.simular === true)
  const aportes = resultados.flatMap((resultado) =>
    resultado.aportaDirectorio ? [resultado.aportaDirectorio] : [],
  )
  const directorioActualizados = await sumarAlDirectorio(aportes, input.simular === true)

  return {
    revisados: movimientos.length,
    actualizados: cambios.length,
    sinContraparte,
    porOrigen,
    directorioActualizados,
  }
}

/** Guarda el nombre en el directorio y lo copia a otros movimientos con ese CUIT que no sean manuales. */
export async function propagarContraparteManual(input: {
  exceptoMovimientoId: string
  nombre: string
  cuit: string
}): Promise<number> {
  await sumarAlDirectorio([{ cuit: input.cuit, nombre: input.nombre, origen: 'manual' }], false)
  const movimientos = await listarMovimientos()
  const cambios: Array<{ id: string; contraparte: ContraparteGuardada }> = []
  for (const mov of movimientos) {
    if (mov.id === input.exceptoMovimientoId) continue
    if (mov.contraparteOrigen === 'manual') continue
    const cuit = cuitOnceDigitos(mov.customerCuit) ?? cuitOnceDigitos(mov.contraparteCuit)
    if (cuit !== input.cuit) continue
    if (
      nombreContraparteLimpio(mov.contraparteNombre) === input.nombre &&
      cuitOnceDigitos(mov.contraparteCuit) === input.cuit &&
      mov.contraparteOrigen === 'directorio'
    ) {
      continue
    }
    cambios.push({
      id: mov.id,
      contraparte: { nombre: input.nombre, cuit: input.cuit, origen: 'directorio' },
    })
  }
  await guardarMovimientos(cambios, false)
  return cambios.length
}

function cambio(mov: MovimientoParaContraparte, contraparte: ContraparteGuardada): boolean {
  return (
    nombreContraparteLimpio(mov.contraparteNombre) !== contraparte.nombre ||
    cuitOnceDigitos(mov.contraparteCuit) !== contraparte.cuit ||
    (mov.contraparteOrigen ?? null) !== contraparte.origen
  )
}

async function listarMovimientos(): Promise<MovimientoParaContraparte[]> {
  const filas: MovimientoParaContraparte[] = []
  let cursor: QueryDocumentSnapshot | null = null
  for (;;) {
    let query = movimientosBancariosCollection().orderBy(FieldPath.documentId()).limit(WRITE_CHUNK)
    if (cursor) query = query.startAfter(cursor)
    const snap = await query.get()
    if (snap.empty) break
    for (const doc of snap.docs) filas.push(mapMovimiento(doc.id, doc.data()))
    cursor = snap.docs[snap.docs.length - 1] ?? null
    if (snap.size < WRITE_CHUNK) break
  }
  return filas
}

async function guardarMovimientos(
  cambios: Array<{ id: string; contraparte: ContraparteGuardada }>,
  simular: boolean,
): Promise<void> {
  if (simular || cambios.length === 0) return
  const db = adminDb()
  const col = movimientosBancariosCollection()
  for (let i = 0; i < cambios.length; i += WRITE_CHUNK) {
    const slice = cambios.slice(i, i + WRITE_CHUNK)
    const batch = db.batch()
    for (const cambioFila of slice) {
      batch.update(col.doc(cambioFila.id), {
        contraparteNombre: cambioFila.contraparte.nombre,
        contraparteCuit: cambioFila.contraparte.cuit,
        contraparteOrigen: cambioFila.contraparte.origen,
      })
    }
    await batch.commit()
  }
}

async function sumarAlDirectorio(
  aportes: Array<{ cuit: string; nombre: string; origen: ContraparteOrigen }>,
  simular: boolean,
): Promise<number> {
  const agrupados = new Map<string, { nombre: string; origen: ContraparteOrigen; veces: number }>()
  for (const aporte of aportes) {
    const prev = agrupados.get(aporte.cuit)
    if (!prev) {
      agrupados.set(aporte.cuit, { nombre: aporte.nombre, origen: aporte.origen, veces: 1 })
      continue
    }
    prev.veces += 1
    if (RANGO_ORIGEN[aporte.origen] >= RANGO_ORIGEN[prev.origen]) {
      prev.nombre = aporte.nombre
      prev.origen = aporte.origen
    }
  }
  if (simular || agrupados.size === 0) return agrupados.size

  const db = adminDb()
  for (const [cuit, entrada] of agrupados) {
    const ref = db.collection(FINANZAS_CONTRAPARTES_COLLECTION).doc(cuit)
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const ahora = FieldValue.serverTimestamp()
      if (snap.exists && snap.get('origen') === 'manual' && entrada.origen !== 'manual') {
        tx.set(
          ref,
          { veces: FieldValue.increment(entrada.veces), actualizadoAt: ahora },
          { merge: true },
        )
        return
      }
      tx.set(
        ref,
        {
          cuit,
          nombre: entrada.nombre,
          origen: entrada.origen,
          veces: FieldValue.increment(entrada.veces),
          actualizadoAt: ahora,
        },
        { merge: true },
      )
    })
  }
  return agrupados.size
}

async function cargarContexto(
  movimientos: MovimientoParaContraparte[],
  session: InterbankingInfoSession | undefined,
): Promise<ContextoContraparte> {
  const [transferenciasRaw, destinatariosRaw, compromisosRaw, cobrosRaw, directorioRaw, categoriasRaw, chequesRaw] =
    await Promise.all([
      adminDb().collection(TRANSFERENCIAS_COLLECTION).get(),
      adminDb().collection(DESTINATARIOS_COLLECTION).get(),
      adminDb().collection(COMPROMISOS_COLLECTION).get(),
      adminDb().collection(COBROS_COLLECTION).get(),
      adminDb().collection(FINANZAS_CONTRAPARTES_COLLECTION).get(),
      listCategoriaMovimientoDocuments(),
      adminDb().collection(CHEQUES_COLLECTION).get(),
    ])

  const transferencias: TransferenciaParaContraparte[] = []
  for (const doc of transferenciasRaw.docs) {
    const mapeada = mapTransferencia(doc.id, doc.data())
    if (mapeada) transferencias.push(mapeada)
  }

  const destinatariosPorCbu = new Map<string, IdentidadDestino>()
  for (const doc of destinatariosRaw.docs) {
    const mapeado = mapDestinatario(doc.id, doc.data())
    if (mapeado) destinatariosPorCbu.set(mapeado.cbu, { nombre: mapeado.nombre, cuit: mapeado.cuit })
  }

  const proveedoresPorCompromiso = new Map<string, IdentidadDestino>()
  const agenda: ItemAgenda[] = []
  for (const doc of compromisosRaw.docs) {
    const data = doc.data()
    const identidad = {
      nombre: nombreContraparteLimpio(data.proveedorONombre),
      cuit: cuitOnceDigitos(data.cuit ?? data.proveedorCuit),
    }
    proveedoresPorCompromiso.set(doc.id, identidad)
    const item = mapCompromiso(doc.id, data, identidad)
    if (item) agenda.push(item)
  }
  for (const doc of cobrosRaw.docs) {
    const item = mapCobro(doc.id, doc.data())
    if (item) agenda.push(item)
  }

  const directorio = new Map<string, { nombre: string; origen: ContraparteOrigen | null }>()
  for (const doc of directorioRaw.docs) {
    const nombre = nombreContraparteLimpio(doc.get('nombre'))
    if (!nombre) continue
    const origen = doc.get('origen')
    directorio.set(doc.id, {
      nombre,
      origen: esOrigenGuardado(origen) ? origen : null,
    })
  }

  const categorias = new Map<string, { nombre: string; grupo: string | null }>()
  for (const categoria of categoriasRaw) {
    categorias.set(categoria.id, {
      nombre: typeof categoria.data.nombre === 'string' ? categoria.data.nombre : '',
      grupo: typeof categoria.data.grupo === 'string' && categoria.data.grupo ? categoria.data.grupo : null,
    })
  }

  const cheques: ChequeParaContraparte[] = []
  for (const doc of chequesRaw.docs) {
    const cheque = mapCheque(doc.id, doc.data())
    if (cheque) cheques.push(cheque)
  }

  return {
    transferencias,
    destinatariosPorCbu,
    proveedoresPorCompromiso,
    agenda,
    cheques,
    transferenciasIb: await cargarInterbanking(movimientos, session),
    directorio,
    categorias,
  }
}

async function cargarInterbanking(
  movimientos: MovimientoParaContraparte[],
  session: InterbankingInfoSession | undefined,
): Promise<TransferenciaIbRecibida[]> {
  const fechas = movimientos
    .filter(
      (mov) =>
        mov.contraparteOrigen !== 'manual' &&
        !contraparteDesdeBanco(mov) &&
        movimientoPuedeVenirDeInterbanking(mov),
    )
    .map((mov) => mov.fechaProceso)
    .filter((fecha) => ISO_DATE.test(fecha))
    .sort()
  const desde = fechas[0]
  const hasta = fechas[fechas.length - 1]
  if (!desde || !hasta) return []

  try {
    const sesion = session ?? (await openInterbankingInfoSession())
    return await transferenciasIbPorDia({
      desde,
      hasta,
      hoy: hoyArgentina(),
      fetchRango: (desdeRango, hastaRango) =>
        fetchTransferenciasIb({ session: sesion, desde: desdeRango, hasta: hastaRango }),
    })
  } catch (err) {
    console.error('[finanzas/contraparte] No se pudieron leer las transferencias de Interbanking', err)
    return []
  }
}

function voucherComoTexto(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(Math.abs(value)))
  if (typeof value === 'string' && value.trim()) return value.trim()
  return null
}

function mapCheque(id: string, data: DocumentData): ChequeParaContraparte | null {
  if (data.direccion !== 'emitido' && data.direccion !== 'recibido') return null
  if (typeof data.montoCentavos !== 'number') return null
  const fechaPago = typeof data.fechaPago === 'string' ? data.fechaPago : ''
  if (!ISO_DATE.test(fechaPago)) return null
  const numero = typeof data.numero === 'string' ? data.numero.trim() : String(data.numero ?? '').trim()
  if (!numero) return null
  return {
    id,
    numero,
    direccion: data.direccion,
    montoCentavos: data.montoCentavos,
    fechaEmision: typeof data.fechaEmision === 'string' ? data.fechaEmision : '',
    fechaPago,
    emisor: typeof data.emisor === 'string' ? data.emisor : null,
    cliente: typeof data.cliente === 'string' ? data.cliente : null,
    destinatario: typeof data.destinatario === 'string' ? data.destinatario : null,
  }
}

function hoyArgentina(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

function esOrigenGuardado(value: unknown): value is ContraparteOrigen {
  return (
    value === 'manual' ||
    value === 'banco' ||
    value === 'transferencia' ||
    value === 'agenda' ||
    value === 'cheque' ||
    value === 'interbanking' ||
    value === 'directorio' ||
    value === 'categoria'
  )
}

function mapMovimiento(id: string, data: DocumentData): MovimientoParaContraparte {
  const origen = data.contraparteOrigen
  return {
    id,
    cuentaId: typeof data.cuentaId === 'string' ? data.cuentaId : '',
    bancoNombre: typeof data.bancoNombre === 'string' ? data.bancoNombre : '',
    bancoNumero: typeof data.bancoNumero === 'string' ? data.bancoNumero : '',
    numeroCuenta: typeof data.numeroCuenta === 'string' ? data.numeroCuenta : '',
    tipo: data.tipo === 'credito' ? 'credito' : 'debito',
    montoCentavos: typeof data.montoCentavos === 'number' ? data.montoCentavos : 0,
    fechaProceso: typeof data.fechaProceso === 'string' ? data.fechaProceso : '',
    descripcion: typeof data.descripcion === 'string' ? data.descripcion : '',
    codeDescriptionIb: typeof data.codeDescriptionIb === 'string' && data.codeDescriptionIb ? data.codeDescriptionIb : null,
    voucherNumber: voucherComoTexto(data.voucherNumber),
    depositorDescription:
      typeof data.depositorDescription === 'string' && data.depositorDescription ? data.depositorDescription : null,
    customerCuit: typeof data.customerCuit === 'string' && data.customerCuit ? data.customerCuit : null,
    categoriaId: typeof data.categoriaId === 'string' && data.categoriaId ? data.categoriaId : null,
    contraparteNombre: nombreContraparteLimpio(data.contraparteNombre),
    contraparteCuit: cuitOnceDigitos(data.contraparteCuit),
    contraparteOrigen: esOrigenGuardado(origen) ? origen : null,
  }
}

function mapTransferencia(id: string, data: DocumentData): TransferenciaParaContraparte | null {
  const cuentaDebitoId = typeof data.cuentaDebitoId === 'string' ? data.cuentaDebitoId : ''
  if (!cuentaDebitoId || typeof data.montoCentavos !== 'number') return null
  const fechaSolicitud =
    typeof data.fechaSolicitudInterbanking === 'string' && ISO_DATE.test(data.fechaSolicitudInterbanking.slice(0, 10))
      ? data.fechaSolicitudInterbanking.slice(0, 10)
      : null
  const fecha = fechaSolicitud ?? fechaIsoArgentina(data.fechaConfeccion)
  if (!fecha) return null
  return {
    id,
    cuentaDebitoId,
    montoCentavos: data.montoCentavos,
    fecha,
    estado: typeof data.estado === 'string' ? data.estado : null,
    destinoNombre: nombreContraparteLimpio(data.destinoNombre),
    destinoCuit: cuitOnceDigitos(data.destinoCuit),
    cuentaCreditoCbu: typeof data.cuentaCreditoCbu === 'string' ? data.cuentaCreditoCbu : null,
    compromisoPagoId: typeof data.compromisoPagoId === 'string' && data.compromisoPagoId ? data.compromisoPagoId : null,
  }
}

function mapDestinatario(
  id: string,
  data: DocumentData,
): { cbu: string; nombre: string | null; cuit: string | null } | null {
  const cbu = soloDigitos(typeof data.cbu === 'string' ? data.cbu : id)
  if (cbu.length < 6) return null
  return {
    cbu,
    nombre: nombreContraparteLimpio(data.nombre),
    cuit: cuitOnceDigitos(data.cuit),
  }
}

function mapCompromiso(id: string, data: DocumentData, identidad: IdentidadDestino): ItemAgenda | null {
  if (typeof data.montoCentavos !== 'number') return null
  const fecha = fechaIsoArgentina(data.fechaPago) ?? fechaIsoArgentina(data.fechaVencimiento)
  if (!fecha) return null
  return {
    id: `compromiso:${id}`,
    tipo: 'compromiso',
    nombre: identidad.nombre,
    cuit: identidad.cuit,
    montoCentavos: data.montoCentavos,
    fecha,
    cuentaId: typeof data.cuentaId === 'string' && data.cuentaId ? data.cuentaId : null,
    estado: typeof data.estado === 'string' ? data.estado : null,
  }
}

function mapCobro(id: string, data: DocumentData): ItemAgenda | null {
  if (typeof data.montoCentavos !== 'number') return null
  const fecha = fechaIsoArgentina(data.fechaConfirmado) ?? fechaIsoArgentina(data.fechaEsperada)
  if (!fecha) return null
  return {
    id: `cobro:${id}`,
    tipo: 'cobro',
    nombre: nombreContraparteLimpio(data.clienteONombre),
    cuit: cuitOnceDigitos(data.cuit ?? data.clienteCuit),
    montoCentavos: data.montoCentavos,
    fecha,
    cuentaId: typeof data.cuentaId === 'string' && data.cuentaId ? data.cuentaId : null,
    estado: typeof data.estado === 'string' ? data.estado : null,
  }
}

function fechaIsoArgentina(value: unknown): string | null {
  if (typeof value === 'string') {
    const texto = value.trim()
    if (ISO_DATE.test(texto.slice(0, 10))) return texto.slice(0, 10)
    const parsed = new Date(texto)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  }
  let date: Date | null = null
  if (value instanceof Date) date = value
  else if (value && typeof value === 'object') {
    const toDate = (value as { toDate?: () => Date }).toDate
    if (typeof toDate === 'function') {
      const converted = toDate.call(value)
      if (converted instanceof Date && !Number.isNaN(converted.getTime())) date = converted
    }
    if (!date) {
      const record = value as { seconds?: unknown; _seconds?: unknown }
      const sec = typeof record.seconds === 'number' ? record.seconds : record._seconds
      if (typeof sec === 'number') date = new Date(sec * 1000)
    }
  }
  if (!date || Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}
