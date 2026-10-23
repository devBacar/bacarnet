import { capitalEsperadoCentavos, ingresadoCentavos } from './agenda-plan.js'
import { validarTipoCambio } from './condiciones.js'
import { esYmd } from './fechas.js'
import type { ChequeRecibido, Cuota, IngresoRegistrado, InversionDocumentBase, MedioIngreso, TipoCambioPactado } from './inversion.types.js'
import { ErrorValidacion } from './validar.js'

export interface IngresoPedido {
  clave: string
  medio: MedioIngreso
  fecha: string
  montoCentavos: number
  cuentaId: string | null
  movimientoId: string | null
  cajaId: string | null
  cheque: ChequeRecibido | null
  nota: string | null
}

function textoOpcional(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

function validarCheque(raw: unknown): ChequeRecibido {
  if (!raw || typeof raw !== 'object') throw new ErrorValidacion('Faltan los datos del cheque.')
  const r = raw as Record<string, unknown>
  const numero = textoOpcional(r.numero, 30)
  const emisor = textoOpcional(r.emisor, 150)
  if (r.tipo !== 'echeq' && r.tipo !== 'fisico') throw new ErrorValidacion('Elegí si es echeq o cheque físico.')
  if (!numero) throw new ErrorValidacion('Poné el número del cheque.')
  if (!emisor) throw new ErrorValidacion('Poné quién emite el cheque.')
  if (!esYmd(r.fechaPago)) throw new ErrorValidacion('Poné la fecha de pago del cheque.')
  return { tipo: r.tipo, numero, bancoEmisor: textoOpcional(r.bancoEmisor, 100), fechaPago: r.fechaPago, emisor, emisorCuit: textoOpcional(r.emisorCuit, 20) }
}

export function validarIngreso(raw: unknown): IngresoPedido {
  if (!raw || typeof raw !== 'object') throw new ErrorValidacion('Faltan los datos del ingreso.')
  const r = raw as Record<string, unknown>
  if (typeof r.clave !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(r.clave)) {
    throw new ErrorValidacion('Falta la clave de la carga. Volvé a abrir el formulario.')
  }
  if (r.medio !== 'transferencia' && r.medio !== 'efectivo' && r.medio !== 'cheque') throw new ErrorValidacion('Elegí cómo entró la plata.')
  if (typeof r.montoCentavos !== 'number' || !Number.isInteger(r.montoCentavos) || r.montoCentavos <= 0) {
    throw new ErrorValidacion('Poné el monto que entró.')
  }
  const cheque = r.medio === 'cheque' ? validarCheque(r.cheque) : null
  const fecha = cheque ? cheque.fechaPago : r.fecha
  if (!esYmd(fecha)) throw new ErrorValidacion('Poné la fecha en que entró.')
  const cajaId = r.medio === 'efectivo' ? textoOpcional(r.cajaId, 100) : null
  if (r.medio === 'efectivo' && !cajaId) throw new ErrorValidacion('Elegí la caja donde entra el efectivo.')
  return {
    clave: r.clave,
    medio: r.medio,
    fecha,
    montoCentavos: r.montoCentavos,
    cuentaId: r.medio === 'transferencia' ? textoOpcional(r.cuentaId, 100) : null,
    movimientoId: r.medio === 'transferencia' ? textoOpcional(r.movimientoId, 200) : null,
    cajaId,
    cheque,
    nota: textoOpcional(r.nota, 1000),
  }
}

/** Lo que todavía no entró del capital. */
export function faltaIngresar(inv: InversionDocumentBase): number {
  return Math.max(0, capitalEsperadoCentavos(inv) - ingresadoCentavos(inv.ingresos))
}

/**
 * Agrega el ingreso a la inversión. Si ya hay uno con la misma clave devuelve la inversión sin cambios
 * (doble clic o reintento). Solo en vigentes y sin pasarse del capital.
 */
export function aplicarIngreso(
  inv: InversionDocumentBase,
  pedido: IngresoPedido,
  quien: { uid: string; nombre: string | null; ahoraIso: string },
  cajaMovimientoId: string | null,
): { data: InversionDocumentBase; nuevo: boolean } {
  if (inv.ingresos.some((i) => i.id === pedido.clave)) return { data: inv, nuevo: false }
  if (inv.estado !== 'vigente') throw new ErrorValidacion('El ingreso se registra cuando la inversión ya está aprobada.')
  const falta = faltaIngresar(inv)
  if (pedido.montoCentavos > falta) {
    throw new ErrorValidacion(falta === 0 ? 'Ya entró todo el capital de esta inversión.' : 'El monto es mayor a lo que falta que entre del capital.')
  }
  const ingreso: IngresoRegistrado = {
    id: pedido.clave,
    medio: pedido.medio,
    fecha: pedido.fecha,
    montoCentavos: pedido.montoCentavos,
    cuentaId: pedido.cuentaId,
    cajaId: pedido.cajaId,
    chequeId: null,
    movimientoId: pedido.movimientoId,
    cajaMovimientoId,
    cheque: pedido.cheque,
    nota: pedido.nota,
    registradoPor: quien.uid,
    registradoPorNombre: quien.nombre,
    registradoAt: quien.ahoraIso,
  }
  return { data: { ...inv, ingresos: [...inv.ingresos, ingreso] }, nuevo: true }
}

/**
 * Cuota en USD que se paga en pesos (o vuelve a dólares con null).
 * Sube la versión del cronograma para que la Agenda se actualice; una cuota con pagos no cambia (ver agenda-plan).
 */
export function aplicarCuotaEnPesos(inv: InversionDocumentBase, numero: number, rawTipoCambio: unknown): InversionDocumentBase {
  if (inv.moneda !== 'USD') throw new ErrorValidacion('Solo las inversiones en dólares se pueden pagar en pesos.')
  if (inv.estado !== 'vigente') throw new ErrorValidacion('Solo se cambia en inversiones vigentes.')
  const cuota = inv.cronograma.find((c) => c.numero === numero)
  if (!cuota || cuota.anulada) throw new ErrorValidacion('No encontré esa cuota.')
  const tipoCambio: TipoCambioPactado | null = validarTipoCambio(rawTipoCambio)
  return {
    ...inv,
    cronograma: inv.cronograma.map((c) => (c.numero === numero ? { ...c, enPesos: tipoCambio } : c)),
    versionCronograma: inv.versionCronograma + 1,
  }
}

/**
 * Inversión sin vencimiento: si el cronograma ya no llega al horizonte, se agregan las cuotas que faltan.
 * Las cuotas que ya estaban quedan igual (incluida la marca de pago en pesos). null = no hace falta extender.
 */
export function extenderSinVencimiento(inv: InversionDocumentBase, regenerado: readonly Cuota[]): InversionDocumentBase | null {
  if (!inv.sinVencimiento || inv.estado !== 'vigente' || regenerado.length <= inv.cronograma.length) return null
  const nuevas = regenerado.filter((c) => !inv.cronograma.some((v) => v.numero === c.numero))
  return { ...inv, cronograma: [...inv.cronograma, ...nuevas], versionCronograma: inv.versionCronograma + 1 }
}
