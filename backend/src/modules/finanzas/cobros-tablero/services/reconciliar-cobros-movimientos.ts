/**
 * Cruza créditos bancarios recientes (cada 30 min, junto al sync de movimientos) contra facturas
 * pendientes de cobro de Vientri, por CUIT exacto + monto exacto (ver domain/matching-bancario.ts).
 * Corre ANTES de que Vientri traiga su propia `aplicaciones.csv` (una vez por día): el tablero de
 * Cobros ya puede mostrar "cobrado hoy" sin esperar a mañana. No reparte pagos parciales entre varias
 * facturas ni matchea sin CUIT: ante la duda, no toca el movimiento.
 */
import { candidatosDeCobro } from '../domain/matching-bancario.js'
import { cargarPendientesCobrar } from './cobros-tablero.repository.js'
import { listCreditosSinReservar, vincularCobroConMovimiento } from './cobros-bancarios.repository.js'

/** Créditos de más de esta cantidad de días no se revisan: una factura pendiente de hace meses que de
 * golpe cobra un crédito viejo sin explicar es más probable que sea un dato con fecha mal cargada que
 * un cobro real pasando desapercibido; además mantiene la consulta acotada en cada corrida de 30 min. */
const VENTANA_DIAS = 14

export interface ReconciliacionCobrosResultado {
  revisados: number
  vinculados: number
  sinCandidato: number
  multiples: number
}

function sumarDiasIso(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + dias))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export async function reconciliarCobrosConMovimientos(): Promise<ReconciliacionCobrosResultado> {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const desde = sumarDiasIso(hoy, -VENTANA_DIAS)

  const [movimientos, pendientes] = await Promise.all([listCreditosSinReservar(desde), cargarPendientesCobrar('ARS')])

  const resultado: ReconciliacionCobrosResultado = { revisados: movimientos.length, vinculados: 0, sinCandidato: 0, multiples: 0 }
  if (movimientos.length === 0 || pendientes.length === 0) return resultado

  // Dentro de esta misma corrida, una factura ya asignada a un movimiento no se vuelve a ofrecer a otro.
  const ocupadas = new Set<string>()

  for (const mov of movimientos) {
    const disponibles = pendientes.filter((p) => !ocupadas.has(p.clave))
    const candidatos = candidatosDeCobro(
      {
        id: mov.id,
        montoCentavos: mov.data.montoCentavos,
        contraparteCuit: mov.data.contraparteCuit ?? null,
        customerCuit: mov.data.customerCuit ?? null,
      },
      disponibles,
    )

    if (candidatos.length === 0) {
      resultado.sinCandidato += 1
      continue
    }
    if (candidatos.length > 1) {
      resultado.multiples += 1
      continue
    }

    const pendiente = candidatos[0]
    const vinculado = await vincularCobroConMovimiento({ movimientoId: mov.id, pendiente })
    if (!vinculado) continue // otra corrida concurrente ya lo tomó
    ocupadas.add(pendiente.clave)
    resultado.vinculados += 1
  }

  return resultado
}
