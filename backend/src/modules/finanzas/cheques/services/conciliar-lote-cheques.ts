/**
 * Cuando el banco junta varios cheques en una sola línea del extracto (un lote), esto arma la
 * sugerencia y, solo si una persona la confirma, concilia todos juntos contra ese movimiento.
 * Nunca se aplica solo: es plata real y el algoritmo puede ser ambiguo con montos grandes.
 */
import { movimientosBancariosCollection } from '../../movimientos/services/movimientos.repository.js'
import type { MovimientoBancarioDocument } from '../../movimientos/domain/movimiento-bancario.types.js'
import type { ChequeParaContraparte } from '../../contraparte/domain/fuente-cheque.js'
import { buscarCombinacionDeCheques, type ResultadoCombinacion } from '../domain/combinacion-cheques.js'
import { listChequesSinVincular, vincularChequeConMovimiento } from './cheques.repository.js'

/**
 * Ventana angosta: el banco suele compensar un lote el mismo día o el siguiente. Una ventana más
 * ancha trae cientos de cheques pendientes (hay miles sin vincular en todo el historial) y la
 * búsqueda se vuelve inútil (siempre "demasiados candidatos").
 */
const VENTANA_DIAS = 1
/** Con hasta ~22 candidatos la búsqueda sigue siendo rápida (la poda corta la mayoría de las ramas). */
const MAX_CANDIDATOS = 22

function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + dias))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function direccionDelMovimiento(tipo: MovimientoBancarioDocument['tipo']): 'emitido' | 'recibido' {
  return tipo === 'debito' ? 'emitido' : 'recibido'
}

export interface SugerenciaLote {
  movimientoId: string
  montoCentavos: number
  resultado: ResultadoCombinacion
}

export class MovimientoNoEncontradoError extends Error {}
export class MovimientoYaConciliadoError extends Error {}

async function leerMovimiento(movimientoId: string): Promise<{ id: string; data: MovimientoBancarioDocument }> {
  const snap = await movimientosBancariosCollection().doc(movimientoId).get()
  if (!snap.exists) throw new MovimientoNoEncontradoError('No se encontró el movimiento')
  return { id: snap.id, data: snap.data() as MovimientoBancarioDocument }
}

/** Busca qué combinación de cheques pendientes podría sumar exacto este movimiento. No concilia nada. */
export async function sugerirCombinacionParaMovimiento(movimientoId: string): Promise<SugerenciaLote> {
  const mov = await leerMovimiento(movimientoId)
  if (mov.data.reservadoPorChequeId || mov.data.reservadoPorChequeIds?.length) {
    throw new MovimientoYaConciliadoError('Este movimiento ya está conciliado')
  }

  const direccion = direccionDelMovimiento(mov.data.tipo)
  const todos = await listChequesSinVincular(direccion)
  const desde = sumarDias(mov.data.fechaProceso, -VENTANA_DIAS)
  const hasta = sumarDias(mov.data.fechaProceso, VENTANA_DIAS)
  const candidatos: ChequeParaContraparte[] = todos
    .filter((c) => c.fechaPago >= desde && c.fechaPago <= hasta)
    .map((c) => ({
      id: c.id,
      numero: c.numero,
      direccion,
      montoCentavos: c.montoCentavos,
      fechaEmision: c.fechaEmision,
      fechaPago: c.fechaPago,
      emisor: c.emisor,
      cliente: c.cliente,
      destinatario: c.destinatario,
      estado: c.estado,
    }))

  const resultado = buscarCombinacionDeCheques(mov.data.montoCentavos, candidatos, { maxCheques: MAX_CANDIDATOS })
  return { movimientoId, montoCentavos: mov.data.montoCentavos, resultado }
}

/** Concilia de verdad, solo con la lista de cheques que una persona ya confirmó a mano. */
export async function conciliarLoteConMovimiento(input: { movimientoId: string; chequeIds: string[] }): Promise<void> {
  if (input.chequeIds.length === 0) throw new Error('No se eligió ningún cheque')
  const mov = await leerMovimiento(input.movimientoId)
  if (mov.data.reservadoPorChequeId || mov.data.reservadoPorChequeIds?.length) {
    throw new MovimientoYaConciliadoError('Este movimiento ya está conciliado')
  }

  const direccion = direccionDelMovimiento(mov.data.tipo)
  const fechaAcreditacion = direccion === 'recibido' ? mov.data.fechaProceso : null

  for (const chequeId of input.chequeIds) {
    await vincularChequeConMovimiento({
      chequeId,
      movimientoBancarioId: mov.id,
      movimientoCuentaId: mov.data.cuentaId,
      movimientoFecha: mov.data.fechaProceso,
      fechaAcreditacion,
    })
  }

  await movimientosBancariosCollection().doc(mov.id).update({
    reservadoPorChequeIds: input.chequeIds,
  })
}
