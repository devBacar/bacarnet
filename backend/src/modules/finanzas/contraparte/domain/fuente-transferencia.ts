import { fechaEnRangoHabil } from './dias-habiles.js'
import { cuitOnceDigitos, nombreContraparteLimpio, soloDigitos } from './normalizar.js'

export interface TransferenciaParaContraparte {
  id: string
  cuentaDebitoId: string
  montoCentavos: number
  /** Día de la transferencia, YYYY-MM-DD. */
  fecha: string
  estado: string | null
  destinoNombre: string | null
  destinoCuit: string | null
  cuentaCreditoCbu: string | null
  compromisoPagoId: string | null
}

export interface IdentidadDestino {
  nombre: string | null
  cuit: string | null
}

const ESTADOS_DESCARTADOS = new Set(['rechazada', 'cancelada'])

export function transferenciasCandidatas(
  mov: { tipo: string; cuentaId: string; montoCentavos: number; fechaProceso: string },
  transferencias: readonly TransferenciaParaContraparte[],
): TransferenciaParaContraparte[] {
  if (mov.tipo !== 'debito') return []
  return transferencias.filter((transferencia) => {
    if (transferencia.estado && ESTADOS_DESCARTADOS.has(transferencia.estado)) return false
    if (transferencia.cuentaDebitoId !== mov.cuentaId) return false
    if (transferencia.montoCentavos !== mov.montoCentavos) return false
    return fechaEnRangoHabil(mov.fechaProceso, transferencia.fecha, 0, 5)
  })
}

/**
 * Nombre del que cobró: el destino guardado en la transferencia, si no está
 * el de la agenda `finanzasDestinatarios` (por CBU), si no el proveedor del compromiso.
 * Los campos que todavía no existen en documentos viejos se tratan como vacíos.
 */
export function identidadDeTransferencia(
  transferencia: TransferenciaParaContraparte,
  destinatariosPorCbu: ReadonlyMap<string, IdentidadDestino>,
  proveedoresPorCompromiso: ReadonlyMap<string, IdentidadDestino>,
): IdentidadDestino {
  const cbu = soloDigitos(transferencia.cuentaCreditoCbu)
  const destinatario = cbu ? destinatariosPorCbu.get(cbu) : undefined
  const proveedor = transferencia.compromisoPagoId
    ? proveedoresPorCompromiso.get(transferencia.compromisoPagoId)
    : undefined
  return {
    nombre:
      nombreContraparteLimpio(transferencia.destinoNombre) ??
      nombreContraparteLimpio(destinatario?.nombre) ??
      nombreContraparteLimpio(proveedor?.nombre),
    cuit:
      cuitOnceDigitos(transferencia.destinoCuit) ??
      cuitOnceDigitos(destinatario?.cuit) ??
      cuitOnceDigitos(proveedor?.cuit),
  }
}
