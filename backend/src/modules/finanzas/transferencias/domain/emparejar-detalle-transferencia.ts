import type { DetalleTransferenciaInterbanking } from '../adapters/interbanking-transferencias-details.js'

export interface TransferenciaParaEmparejar {
  id: string
  operationId: string
  confectionId: string | null
  cuentaDebitoCbu: string | null
  cuentaDebitoNumero: string | null
  cuentaCreditoCbu: string
  montoCentavos: number
  fechaConfeccionDia: string | null
}

export type MotivoEmparejamiento = 'id' | 'atributos' | 'ambiguo' | 'sin_coincidencia'

export interface EmparejamientoTransferencia {
  transferenciaId: string
  detalle: DetalleTransferenciaInterbanking | null
  motivo: MotivoEmparejamiento
}

function soloDigitos(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

function texto(value: string | null | undefined): string {
  return (value ?? '').trim()
}

function identificadoresDetalle(detalle: DetalleTransferenciaInterbanking): Set<string> {
  const ids = [
    detalle.transferId,
    detalle.transactionNumber,
    detalle.referenceNumber,
    detalle.paymentNumber,
    detalle.comments,
  ]
    .map(texto)
    .filter((id) => id.length > 0)
  return new Set(ids)
}

function identificadoresGuardados(transferencia: TransferenciaParaEmparejar): string[] {
  return [transferencia.operationId, transferencia.confectionId ?? '']
    .map(texto)
    .filter((id) => id.length > 0)
}

function coincidePorId(
  transferencia: TransferenciaParaEmparejar,
  detalle: DetalleTransferenciaInterbanking,
): boolean {
  const guardados = identificadoresGuardados(transferencia)
  if (guardados.length === 0) return false
  const delDetalle = identificadoresDetalle(detalle)
  return guardados.some((id) => delDetalle.has(id))
}

function coincidePorAtributos(
  transferencia: TransferenciaParaEmparejar,
  detalle: DetalleTransferenciaInterbanking,
): boolean {
  if (!transferencia.fechaConfeccionDia || transferencia.fechaConfeccionDia !== detalle.requestDate) {
    return false
  }
  if (detalle.amountCentavos == null || transferencia.montoCentavos !== detalle.amountCentavos) {
    return false
  }
  const credito = soloDigitos(transferencia.cuentaCreditoCbu)
  const creditoDetalle = soloDigitos(detalle.creditCbu)
  if (!credito || credito !== creditoDetalle) return false

  const debito = soloDigitos(transferencia.cuentaDebitoCbu)
  const debitoDetalle = soloDigitos(detalle.debitCbu)
  if (debito && debitoDetalle && debito === debitoDetalle) return true

  const numero = texto(transferencia.cuentaDebitoNumero)
  const numeroDetalle = texto(detalle.debitAccountNumber)
  return Boolean(numero && numeroDetalle && numero === numeroDetalle)
}

/**
 * Primero el identificador guardado al confeccionar (operation_id o confection_id).
 * Si no hay id, misma cuenta débito, CBU crédito, monto y fecha, y solo si hay un candidato.
 */
export function emparejarDetallesConTransferencias(
  transferencias: TransferenciaParaEmparejar[],
  detalles: DetalleTransferenciaInterbanking[],
): EmparejamientoTransferencia[] {
  const usados = new Set<number>()

  const porId = transferencias.map((transferencia) => {
    if (identificadoresGuardados(transferencia).length === 0) return null
    const indices = detalles
      .map((detalle, index) => ({ detalle, index }))
      .filter(({ detalle, index }) => !usados.has(index) && coincidePorId(transferencia, detalle))
    if (indices.length === 1) {
      usados.add(indices[0]!.index)
      return {
        transferenciaId: transferencia.id,
        detalle: indices[0]!.detalle,
        motivo: 'id' as const,
      }
    }
    if (indices.length > 1) {
      const afinados = indices.filter(({ detalle }) => coincidePorAtributos(transferencia, detalle))
      if (afinados.length === 1) {
        usados.add(afinados[0]!.index)
        return {
          transferenciaId: transferencia.id,
          detalle: afinados[0]!.detalle,
          motivo: 'id' as const,
        }
      }
      return {
        transferenciaId: transferencia.id,
        detalle: null,
        motivo: 'ambiguo' as const,
      }
    }
    return {
      transferenciaId: transferencia.id,
      detalle: null,
      motivo: 'sin_coincidencia' as const,
    }
  })

  return transferencias.map((transferencia, index) => {
    const ya = porId[index]
    if (ya) return ya
    if (identificadoresGuardados(transferencia).length > 0) {
      return {
        transferenciaId: transferencia.id,
        detalle: null,
        motivo: 'sin_coincidencia',
      }
    }

    const candidatos = detalles
      .map((detalle, detalleIndex) => ({ detalle, detalleIndex }))
      .filter(
        ({ detalle, detalleIndex }) =>
          !usados.has(detalleIndex) && coincidePorAtributos(transferencia, detalle),
      )
    const otrasSinId = transferencias.filter(
      (otra) => otra.id !== transferencia.id && identificadoresGuardados(otra).length === 0,
    )
    const otroTambien = otrasSinId.some((otra) =>
      candidatos.some(({ detalle }) => coincidePorAtributos(otra, detalle)),
    )
    if (candidatos.length === 1 && !otroTambien) {
      usados.add(candidatos[0]!.detalleIndex)
      return {
        transferenciaId: transferencia.id,
        detalle: candidatos[0]!.detalle,
        motivo: 'atributos',
      }
    }
    if (candidatos.length > 1 || otroTambien) {
      return { transferenciaId: transferencia.id, detalle: null, motivo: 'ambiguo' }
    }
    return { transferenciaId: transferencia.id, detalle: null, motivo: 'sin_coincidencia' }
  })
}
