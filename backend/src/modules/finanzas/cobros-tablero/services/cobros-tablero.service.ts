import { calcularTableroCobros } from '../domain/calcular.js'
import type { DetalleCliente, TableroCobros } from '../domain/tipos.js'
import { cargarCobrosDelPeriodo, cargarPendientesCobrar } from './cobros-tablero.repository.js'
import { resumenCreditosSinClasificarHoy } from './cobros-bancarios.repository.js'
import { dateKeyInArgentina } from '../../agenda/domain/vencimiento.alert.js'

export async function obtenerTableroCobros(input: {
  desde: string
  hasta: string
  moneda: 'ARS' | 'USD'
}): Promise<TableroCobros> {
  const hoy = dateKeyInArgentina(new Date())
  const [pendientesCobrar, cobradas, sinClasificarHoy] = await Promise.all([
    cargarPendientesCobrar(input.moneda),
    cargarCobrosDelPeriodo({ desde: input.desde, hasta: input.hasta, moneda: input.moneda }),
    // Los movimientos bancarios que se sincronizan hoy son todos de cuentas en pesos.
    input.moneda === 'USD' ? Promise.resolve({ cantidad: 0, montoCentavos: 0 }) : resumenCreditosSinClasificarHoy(hoy),
  ])
  return calcularTableroCobros({
    pendientesCobrar,
    cobradas,
    hoy,
    periodo: { desde: input.desde, hasta: input.hasta },
    moneda: input.moneda,
    sinClasificarHoy,
  })
}

export async function obtenerDetalleCliente(input: {
  vientriId: number
  desde: string
  hasta: string
  moneda: 'ARS' | 'USD'
}): Promise<DetalleCliente> {
  const [tablero, todasCobradas] = await Promise.all([
    obtenerTableroCobros({ desde: input.desde, hasta: input.hasta, moneda: input.moneda }),
    cargarCobrosDelPeriodo({ desde: input.desde, hasta: input.hasta, moneda: input.moneda }),
  ])
  const cliente = tablero.clientes.find((c) => c.personaId === input.vientriId)
  const cobradas = todasCobradas.filter((f) => f.persona?.vientriId === input.vientriId)
  return {
    personaId: input.vientriId,
    nombre: cliente?.nombre ?? cobradas[0]?.persona?.nombre ?? 'Sin nombre en Vientri',
    impagas: cliente?.comprobantes.filter((c) => c.pendienteCentavos !== 0) ?? [],
    cobradas,
  }
}
