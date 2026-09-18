export interface HistorialEstadoInput {
  estadoAnterior: string | null
  estadoNuevo: string
  usuario: string
  nota: string | null
}

export function buildAgendaHistorialEntry(input: HistorialEstadoInput): HistorialEstadoInput {
  if (!input.usuario.trim()) {
    throw new Error('historialEstados: usuario requerido')
  }
  if (!input.estadoNuevo.trim()) {
    throw new Error('historialEstados: estadoNuevo requerido')
  }
  return {
    estadoAnterior: input.estadoAnterior,
    estadoNuevo: input.estadoNuevo.trim(),
    usuario: input.usuario.trim(),
    nota: input.nota?.trim() ? input.nota.trim() : null,
  }
}

/** Payload de historial al marcar un compromiso como pagado. */
export function buildMarcarPagadoHistorial(input: {
  estadoAnterior: string
  usuario: string
  nota: string | null
}): HistorialEstadoInput {
  return buildAgendaHistorialEntry({
    estadoAnterior: input.estadoAnterior,
    estadoNuevo: 'pagado',
    usuario: input.usuario,
    nota: input.nota,
  })
}
