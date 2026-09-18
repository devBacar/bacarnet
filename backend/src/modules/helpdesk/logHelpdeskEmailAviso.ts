import { logError } from '../../lib/log.js'
import { appendHelpdeskEmailLog } from './repository.js'
import type { HelpdeskEmailLogSource, HelpdeskEmailLogTipo } from './types.js'

export async function logHelpdeskEmailAvisoBestEffort(input: {
  tipo: HelpdeskEmailLogTipo
  destinatarios: string[]
  area: string
  areaId?: string | null
  ticketId: string | null
  source?: HelpdeskEmailLogSource
}): Promise<void> {
  const destinatarios = input.destinatarios
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (destinatarios.length === 0) return

  try {
    await appendHelpdeskEmailLog({
      tipo: input.tipo,
      destinatarios,
      area: input.area,
      areaId: input.areaId ?? null,
      ticketId: input.ticketId,
      source: input.source ?? 'bacarnet',
    })
  } catch (err) {
    logError('logHelpdeskEmailAviso falló (best effort)', err)
  }
}
