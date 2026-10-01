import type { MedioPago, MonedaCompromiso } from './agenda.types.js'
import { textoCuota } from './compromiso-campos.js'
import type { PagoRegistradoVista } from './pago-compromiso.js'

export interface RefsPago {
  chequeId: string | null
  cajaId: string | null
  cuentaId: string | null
  transferenciaId: string | null
  movimientoId: string | null
  claseCheque: 'cartera' | 'propio' | null
  marcadoAMano: boolean
}

export interface ChequeComoSePago {
  numero: string
  banco: string | null
  propio: boolean
}

export interface DatosComoSePago {
  cheque: ChequeComoSePago | null
  cajaNombre: string | null
  bancoCuenta: string | null
  transferencia: { banco: string | null; esperandoFirma: boolean } | null
  movimiento: { fecha: string; banco: string | null } | null
}

export interface CatalogoPagos {
  cheques: Map<string, ChequeComoSePago>
  cajas: Map<string, string>
  cuentas: Map<string, string>
  transferencias: Map<string, { banco: string | null; esperandoFirma: boolean }>
  movimientos: Map<string, { fecha: string; banco: string | null }>
}

export interface FuentePago {
  id: string
  concepto: string
  proveedorONombre: string
  montoCentavos: number
  moneda: MonedaCompromiso
  estado: string
  medioPago: MedioPago
  fechaPago: string | null
  fechaVencimiento: string
  chequeId: string | null
  cuentaId: string | null
  transferenciaConfeccionadaId: string | null
  cuotaNumero: number | null
  cuotaTotal: number | null
  pagos: PagoRegistradoVista[]
}

export interface RenglonPagoHecho {
  compromisoId: string
  orden: number
  fecha: string
  proveedorONombre: string
  concepto: string
  cuota: string | null
  montoCentavos: number
  moneda: MonedaCompromiso
  medio: MedioPago
  comoSePago: string
  link: string | null
  linea: string
}

export interface LineaPagoPlanilla {
  fecha: string
  texto: string
  linea: string
}

export interface IdsPagos {
  chequeIds: string[]
  transferenciaIds: string[]
  movimientoIds: string[]
  necesitaCajas: boolean
  necesitaCuentas: boolean
}

const MEDIO_PALABRA: Record<MedioPago, string> = {
  transferencia: 'transferencia',
  cheque: 'cheque',
  efectivo: 'efectivo',
}

export function catalogoVacio(): CatalogoPagos {
  return {
    cheques: new Map(),
    cajas: new Map(),
    cuentas: new Map(),
    transferencias: new Map(),
    movimientos: new Map(),
  }
}

function idDe(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const texto = value.trim()
  return texto || null
}

/** Lee los campos nuevos. Si faltan o vienen con otro tipo, no tira el pago. */
export function leerRefsPago(raw: unknown): RefsPago {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const clase = row.claseCheque
  return {
    chequeId: idDe(row.chequeId),
    cajaId: idDe(row.cajaId),
    cuentaId: idDe(row.cuentaId),
    transferenciaId: idDe(row.transferenciaId),
    movimientoId: idDe(row.movimientoId),
    claseCheque: clase === 'cartera' || clase === 'propio' ? clase : null,
    marcadoAMano: row.marcadoAMano === true,
  }
}

function referenciaDe(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  return idDe((raw as Record<string, unknown>).referenciaId)
}

/**
 * Completa ids que los pagos viejos guardaron en otro campo:
 * la transferencia en referenciaId, el cheque del compromiso, la cuenta del compromiso.
 */
export function resolverRefsPago(input: {
  pago: unknown
  medio: MedioPago
  chequeIdCompromiso: string | null
  cuentaIdCompromiso: string | null
  transferenciaIdCompromiso: string | null
  unico: boolean
}): RefsPago {
  const explicitos = leerRefsPago(input.pago)
  const referenciaId = referenciaDe(input.pago)
  let chequeId = explicitos.chequeId
  let transferenciaId = explicitos.transferenciaId
  let movimientoId = explicitos.movimientoId
  const cuentaId = explicitos.cuentaId ?? (input.unico ? idDe(input.cuentaIdCompromiso) : null)

  if (!chequeId && input.medio === 'cheque') {
    chequeId = referenciaId ?? (input.unico ? idDe(input.chequeIdCompromiso) : null)
  }
  if (!transferenciaId && !movimientoId && input.medio === 'transferencia' && referenciaId) {
    if (explicitos.marcadoAMano) movimientoId = referenciaId
    else transferenciaId = referenciaId
  }
  if (!transferenciaId && input.medio === 'transferencia' && input.unico && !explicitos.marcadoAMano) {
    transferenciaId = idDe(input.transferenciaIdCompromiso)
  }

  return {
    chequeId,
    cajaId: explicitos.cajaId,
    cuentaId,
    transferenciaId,
    movimientoId,
    claseCheque: explicitos.claseCheque,
    marcadoAMano: explicitos.marcadoAMano,
  }
}

/** Si el id no es una transferencia pero sí un débito, era un "ya lo pagué". */
export function refsConCatalogo(medio: MedioPago, refs: RefsPago, catalogo: CatalogoPagos): RefsPago {
  let siguiente = refs
  if (
    siguiente.transferenciaId &&
    !catalogo.transferencias.has(siguiente.transferenciaId) &&
    catalogo.movimientos.has(siguiente.transferenciaId)
  ) {
    siguiente = {
      ...siguiente,
      movimientoId: siguiente.movimientoId ?? siguiente.transferenciaId,
      transferenciaId: null,
      marcadoAMano: true,
    }
  }
  if (
    !siguiente.cajaId &&
    medio === 'efectivo' &&
    !siguiente.marcadoAMano &&
    siguiente.cuentaId &&
    catalogo.cajas.has(siguiente.cuentaId)
  ) {
    siguiente = { ...siguiente, cajaId: siguiente.cuentaId }
  }
  return siguiente
}

export function transferenciaEsperaFirma(input: {
  estado: string
  tono: 'hecha' | 'pendiente' | 'enviada' | 'rechazada' | null
}): boolean {
  if (input.estado === 'efectivizada' || input.tono === 'hecha') return false
  if (input.estado === 'rechazada' || input.estado === 'cancelada' || input.tono === 'rechazada') return false
  return true
}

function nombre(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const texto = value.trim()
  return texto || null
}

export function fechaDiaMes(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  return `${match[3]}/${match[2]}`
}

export function textoComoSePago(medio: MedioPago, refs: RefsPago, datos: DatosComoSePago): string {
  if (refs.marcadoAMano) {
    let texto = `Marcado a mano · ${MEDIO_PALABRA[medio]}`
    const movimiento = datos.movimiento
    if (movimiento && (movimiento.fecha || movimiento.banco)) {
      const cuando = movimiento.fecha ? `del ${fechaDiaMes(movimiento.fecha)}` : ''
      const banco = nombre(movimiento.banco)
      if (cuando && banco) texto += ` · débito ${cuando} en ${banco}`
      else if (cuando) texto += ` · débito ${cuando}`
      else if (banco) texto += ` · débito en ${banco}`
    }
    return texto
  }

  if (medio === 'cheque' || datos.cheque || refs.chequeId) {
    const propio = datos.cheque ? datos.cheque.propio : refs.claseCheque === 'propio'
    const endosado = datos.cheque ? !datos.cheque.propio : refs.claseCheque === 'cartera'
    const numero = nombre(datos.cheque?.numero)
    const banco = nombre(datos.cheque?.banco)
    if (propio) {
      const cabeza = numero ? `Cheque propio N.º ${numero}` : 'Cheque propio'
      return banco ? `${cabeza} · ${banco}` : cabeza
    }
    if (!endosado && !numero && !banco) return 'Cheque'
    const partes = [numero ? `Cheque N.º ${numero}` : 'Cheque']
    if (banco) partes.push(banco)
    if (endosado) partes.push('endosado')
    return partes.join(' · ')
  }

  if (medio === 'efectivo' || refs.cajaId) {
    const caja = nombre(datos.cajaNombre)
    return caja ? `Efectivo · ${caja}` : 'Efectivo'
  }

  const banco = nombre(datos.transferencia?.banco) ?? nombre(datos.bancoCuenta)
  const estado = datos.transferencia?.esperandoFirma ? 'esperando firma' : 'hecha'
  const partes = ['Transferencia']
  if (banco) partes.push(banco)
  partes.push(estado)
  return partes.join(' · ')
}

export function linkDePago(medio: MedioPago, refs: RefsPago): string | null {
  if (refs.chequeId || medio === 'cheque') return '/finanzas/cheques'
  if (refs.cajaId) return '/finanzas/cajas'
  if (refs.transferenciaId || (medio === 'transferencia' && !refs.marcadoAMano)) return '/finanzas/transferencias'
  if (refs.movimientoId) return '/finanzas/movimientos'
  if (medio === 'efectivo') return '/finanzas/cajas'
  if (medio === 'transferencia') return '/finanzas/transferencias'
  return null
}

export function lineaPagoPlanilla(fecha: string, texto: string): string {
  const detalle = texto ? texto.charAt(0).toLocaleLowerCase('es-AR') + texto.slice(1) : texto
  return `Pagado el ${fechaDiaMes(fecha)} con ${detalle}`
}

function datosDe(refs: RefsPago, catalogo: CatalogoPagos): DatosComoSePago {
  return {
    cheque: refs.chequeId ? (catalogo.cheques.get(refs.chequeId) ?? null) : null,
    cajaNombre: refs.cajaId ? (catalogo.cajas.get(refs.cajaId) ?? null) : null,
    bancoCuenta: refs.cuentaId ? (catalogo.cuentas.get(refs.cuentaId) ?? null) : null,
    transferencia: refs.transferenciaId ? (catalogo.transferencias.get(refs.transferenciaId) ?? null) : null,
    movimiento: refs.movimientoId ? (catalogo.movimientos.get(refs.movimientoId) ?? null) : null,
  }
}

interface UnidadPago {
  fecha: string
  montoCentavos: number
  medio: MedioPago
  pago: unknown
  orden: number
  unico: boolean
}

function unidadesDe(fuente: FuentePago): UnidadPago[] {
  if (fuente.pagos.length > 0) {
    return fuente.pagos.map((pago, orden) => ({
      fecha: pago.fecha,
      montoCentavos: pago.montoCentavos,
      medio: pago.medio,
      pago,
      orden,
      unico: fuente.pagos.length === 1,
    }))
  }
  if (fuente.estado !== 'pagado') return []
  const fecha = fuente.fechaPago ?? fuente.fechaVencimiento
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return []
  if (!Number.isInteger(fuente.montoCentavos) || fuente.montoCentavos <= 0) return []
  return [
    {
      fecha,
      montoCentavos: fuente.montoCentavos,
      medio: fuente.medioPago,
      pago: null,
      orden: 0,
      unico: true,
    },
  ]
}

function refsDeUnidad(fuente: FuentePago, unidad: UnidadPago): RefsPago {
  return resolverRefsPago({
    pago: unidad.pago,
    medio: unidad.medio,
    chequeIdCompromiso: fuente.chequeId,
    cuentaIdCompromiso: fuente.cuentaId,
    transferenciaIdCompromiso: fuente.transferenciaConfeccionadaId,
    unico: unidad.unico,
  })
}

export function recolectarIds(fuentes: readonly FuentePago[]): IdsPagos {
  const chequeIds = new Set<string>()
  const transferenciaIds = new Set<string>()
  const movimientoIds = new Set<string>()
  let necesitaCajas = false
  let necesitaCuentas = false
  for (const fuente of fuentes) {
    for (const unidad of unidadesDe(fuente)) {
      const refs = refsDeUnidad(fuente, unidad)
      if (refs.chequeId) chequeIds.add(refs.chequeId)
      if (refs.cajaId || unidad.medio === 'efectivo') necesitaCajas = true
      if (refs.transferenciaId) transferenciaIds.add(refs.transferenciaId)
      if (refs.movimientoId) movimientoIds.add(refs.movimientoId)
      if (refs.cuentaId || refs.transferenciaId || unidad.medio === 'transferencia') necesitaCuentas = true
    }
  }
  return {
    chequeIds: [...chequeIds],
    transferenciaIds: [...transferenciaIds],
    movimientoIds: [...movimientoIds],
    necesitaCajas,
    necesitaCuentas,
  }
}

export function renglonesDeCompromiso(fuente: FuentePago, catalogo: CatalogoPagos): RenglonPagoHecho[] {
  const cuota = textoCuota(fuente.cuotaNumero, fuente.cuotaTotal)
  return unidadesDe(fuente).map((unidad) => {
    const refs = refsConCatalogo(unidad.medio, refsDeUnidad(fuente, unidad), catalogo)
    const datos = datosDe(refs, catalogo)
    const comoSePago = textoComoSePago(unidad.medio, refs, datos)
    return {
      compromisoId: fuente.id,
      orden: unidad.orden,
      fecha: unidad.fecha,
      proveedorONombre: fuente.proveedorONombre,
      concepto: fuente.concepto,
      cuota,
      montoCentavos: unidad.montoCentavos,
      moneda: fuente.moneda,
      medio: unidad.medio,
      comoSePago,
      link: linkDePago(unidad.medio, refs),
      linea: lineaPagoPlanilla(unidad.fecha, comoSePago),
    }
  })
}

export function lineasPagosPlanilla(fuente: FuentePago, catalogo: CatalogoPagos): LineaPagoPlanilla[] {
  return renglonesDeCompromiso(fuente, catalogo).map((renglon) => ({
    fecha: renglon.fecha,
    texto: renglon.comoSePago,
    linea: renglon.linea,
  }))
}

export function renglonesEnRango(
  renglones: readonly RenglonPagoHecho[],
  desde: string,
  hasta: string,
): RenglonPagoHecho[] {
  return renglones.filter((renglon) => renglon.fecha >= desde && renglon.fecha <= hasta)
}

/** Los pagos de un mismo compromiso quedan juntos. El grupo más reciente va primero. */
export function ordenarRenglones(renglones: readonly RenglonPagoHecho[]): RenglonPagoHecho[] {
  const grupos = new Map<string, RenglonPagoHecho[]>()
  const orden: string[] = []
  for (const renglon of renglones) {
    const lista = grupos.get(renglon.compromisoId)
    if (lista) lista.push(renglon)
    else {
      grupos.set(renglon.compromisoId, [renglon])
      orden.push(renglon.compromisoId)
    }
  }
  const bloques = orden.map((id) => grupos.get(id) ?? [])
  bloques.sort((a, b) => {
    const ultima = (bloque: RenglonPagoHecho[]) => bloque.reduce((max, item) => (item.fecha > max ? item.fecha : max), '')
    const porFecha = ultima(b).localeCompare(ultima(a))
    if (porFecha !== 0) return porFecha
    return (a[0]?.proveedorONombre ?? '').localeCompare(b[0]?.proveedorONombre ?? '', 'es')
  })
  return bloques.flatMap((bloque) =>
    [...bloque].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden),
  )
}

export function resolverRangoPagos(input: {
  mes?: unknown
  desde?: unknown
  hasta?: unknown
}): { ok: true; desde: string; hasta: string } | { ok: false; error: string } {
  const desde = typeof input.desde === 'string' ? input.desde.trim() : ''
  const hasta = typeof input.hasta === 'string' ? input.hasta.trim() : ''
  const mes = typeof input.mes === 'string' ? input.mes.trim() : ''
  if (desde || hasta) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) {
      return { ok: false, error: 'Indicá un desde y un hasta válidos' }
    }
    return { ok: true, desde, hasta }
  }
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mes)
  if (!match) return { ok: false, error: 'Indicá el mes con formato AAAA-MM' }
  const anio = Number(match[1])
  const mesNum = Number(match[2])
  const ultimo = new Date(Date.UTC(anio, mesNum, 0)).getUTCDate()
  return {
    ok: true,
    desde: `${mes}-01`,
    hasta: `${mes}-${String(ultimo).padStart(2, '0')}`,
  }
}
