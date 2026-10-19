/**
 * Qué parte de Vientri le sirve a Finanzas.
 * - Cheques: los que vencen (fecha de pago) desde hace 12 meses en adelante. Un cheque se deposita dentro de
 *   los 30 días de su fecha de pago y la acción contra el firmante prescribe al año (Ley 24.452).
 * - Compromisos (facturas con saldo): los que vencen desde hace 12 meses en adelante.
 * - Los cheques más viejos que en Vientri siguen "abiertos" (en cartera o sin debitar) no se muestran:
 *   van a un listado para que Administración los corrija en Vientri.
 */
import type { VientriChequeDoc, VientriPendienteDoc } from './tipos.js'

export const MESES_VENTANA = 12
export const DIAS_PARA_DEPOSITAR = 30

const ESTADOS_ABIERTOS = new Set(['en_cartera', 'pendiente_debito'])

/** "2026-10-19..." menos n meses → "2025-10-19". Si el día no existe en ese mes, usa el último. */
export function restarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number)
  const total = a * 12 + (m - 1) - meses
  const anio = Math.floor(total / 12)
  const mes = (total % 12) + 1
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  return `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`
}

export function restarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10)
}

export interface ChequeParaLimpiar {
  clave: string
  direccion: VientriChequeDoc['direccion']
  numero: string
  bancoNombre: string | null
  montoCentavos: number
  fechaVencimiento: string | null
  estadoVientri: string
  librador: string | null
  motivo: string
}

export interface ResultadoVentana {
  desde: string
  cheques: VientriChequeDoc[]
  pendientes: VientriPendienteDoc[]
  limpieza: ChequeParaLimpiar[]
  fuera: { cheques: number; pendientes: number }
}

const fechaValida = (f: string | null): f is string => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f)

export function aplicarVentana(
  cheques: VientriChequeDoc[],
  pendientes: VientriPendienteDoc[],
  fechaDatos: string,
): ResultadoVentana {
  const desde = restarMeses(fechaDatos, MESES_VENTANA)
  const limiteDeposito = restarDias(fechaDatos, DIAS_PARA_DEPOSITAR)
  const limpieza: ChequeParaLimpiar[] = []
  const chequesDentro: VientriChequeDoc[] = []

  for (const c of cheques) {
    // Sin fecha válida no se puede ubicar: se muestra (ya viene marcado para revisar).
    if (!fechaValida(c.fechaVencimiento) || c.fechaVencimiento >= desde) {
      if (
        c.direccion === 'recibido' &&
        c.estado === 'en_cartera' &&
        fechaValida(c.fechaVencimiento) &&
        c.fechaVencimiento < limiteDeposito
      ) {
        chequesDentro.push({
          ...c,
          revisar: [...c.revisar, `Vencido para depositar: pasaron más de ${DIAS_PARA_DEPOSITAR} días de la fecha de pago`],
        })
      } else {
        chequesDentro.push(c)
      }
      continue
    }
    if (ESTADOS_ABIERTOS.has(c.estado) && !c.baja) {
      limpieza.push({
        clave: c.clave,
        direccion: c.direccion,
        numero: c.numero,
        bancoNombre: c.bancoNombre,
        montoCentavos: c.montoCentavos,
        fechaVencimiento: c.fechaVencimiento,
        estadoVientri: c.estadoVientri,
        librador: c.librador?.nombre ?? null,
        motivo:
          c.estado === 'en_cartera'
            ? 'Figura en cartera pero venció hace más de un año'
            : 'Figura sin debitar pero venció hace más de un año',
      })
    }
  }

  const pendientesDentro = pendientes.filter((p) => {
    const f = p.fechaVencimiento ?? p.fecha
    return !fechaValida(f) || f >= desde
  })

  limpieza.sort((a, b) => String(a.fechaVencimiento).localeCompare(String(b.fechaVencimiento)))
  return {
    desde,
    cheques: chequesDentro,
    pendientes: pendientesDentro,
    limpieza,
    fuera: { cheques: cheques.length - chequesDentro.length, pendientes: pendientes.length - pendientesDentro.length },
  }
}
