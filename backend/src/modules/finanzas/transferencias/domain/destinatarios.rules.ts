import { bancoNombreDesdeCbu } from './banco-por-cbu.js'

export const DESTINATARIOS_LIMITE = 50

export type DestinatarioTipo = 'terceros' | 'proveedores'

/** CC cuenta corriente, CA caja de ahorro. Los documentos viejos no tienen el campo. */
export type TipoCuentaDestinatario = 'CC' | 'CA'

export const MENSAJE_TIPO_CUENTA_INVALIDO =
  'El tipo de cuenta tiene que ser cuenta corriente o caja de ahorro'

export interface DestinatarioVista {
  id: string
  nombre: string
  cbu: string
  cuit: string | null
  alias: string | null
  bancoNombre: string | null
  tipo: DestinatarioTipo
  tipoCuenta: TipoCuentaDestinatario | null
  usos: number
  ultimoUsoAt: string | null
  sugerido: boolean
}

/** Lo que hay en Firestore: sin campo, null o cualquier otra cosa queda en null. */
export function tipoCuentaDesdeDocumento(value: unknown): TipoCuentaDestinatario | null {
  return value === 'CC' || value === 'CA' ? value : null
}

/** Alta y edición. Vacío o null se guarda como null. */
export function parseTipoCuentaAgenda(
  value: unknown,
): { ok: true; valor: TipoCuentaDestinatario | null } | { ok: false; error: string } {
  if (value == null) return { ok: true, valor: null }
  if (typeof value !== 'string') return { ok: false, error: MENSAJE_TIPO_CUENTA_INVALIDO }
  const codigo = value.trim().toUpperCase()
  if (!codigo) return { ok: true, valor: null }
  if (codigo === 'CC' || codigo === 'CA') return { ok: true, valor: codigo }
  return { ok: false, error: MENSAJE_TIPO_CUENTA_INVALIDO }
}

export interface TransferenciaParaSugerencia {
  tipo: string
  cuentaCreditoCbu: string
  destinoNombre?: string | null
  destinoCuit?: string | null
  compromisoNombre?: string | null
  fechaMs: number
}

export function siguienteUsoDestinatario(existing: { usos: number } | null): {
  usos: number
  esAlta: boolean
} {
  if (!existing) return { usos: 1, esAlta: true }
  const actual = Number.isFinite(existing.usos) && existing.usos > 0 ? Math.floor(existing.usos) : 0
  return { usos: actual + 1, esAlta: false }
}

function normalizar(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

export function filtrarDestinatarios(
  rows: DestinatarioVista[],
  q: string,
  tipo?: string,
): DestinatarioVista[] {
  const query = q.trim()
  const queryNorm = normalizar(query)
  const queryDigits = query.replace(/\D/g, '')
  return rows
    .filter((row) => !tipo || row.tipo === tipo)
    .filter((row) => {
      if (!queryNorm) return true
      if (normalizar(row.nombre).includes(queryNorm)) return true
      if (row.alias && normalizar(row.alias).includes(queryNorm)) return true
      if (queryDigits && row.cbu.includes(queryDigits)) return true
      if (queryDigits && (row.cuit ?? '').includes(queryDigits)) return true
      return false
    })
    .sort((a, b) => {
      if (b.usos !== a.usos) return b.usos - a.usos
      return (b.ultimoUsoAt ?? '').localeCompare(a.ultimoUsoAt ?? '')
    })
    .slice(0, DESTINATARIOS_LIMITE)
}

export function agruparSugerencias(rows: TransferenciaParaSugerencia[]): DestinatarioVista[] {
  const porCbu = new Map<
    string,
    {
      nombre: string
      cuit: string | null
      tipo: DestinatarioTipo
      usos: number
      fechaMs: number
    }
  >()

  for (const row of rows) {
    if (row.tipo !== 'terceros' && row.tipo !== 'proveedores') continue
    const cbu = row.cuentaCreditoCbu.replace(/\D/g, '')
    if (cbu.length !== 22) continue
    const nombre = row.destinoNombre?.trim() || row.compromisoNombre?.trim() || 'Destinatario'
    const tipo = row.tipo
    const prev = porCbu.get(cbu)
    if (!prev) {
      porCbu.set(cbu, {
        nombre,
        cuit: row.destinoCuit?.trim() || null,
        tipo,
        usos: 1,
        fechaMs: row.fechaMs,
      })
      continue
    }
    prev.usos += 1
    if (row.fechaMs >= prev.fechaMs) {
      prev.fechaMs = row.fechaMs
      prev.nombre = nombre
      prev.tipo = tipo
      if (row.destinoCuit?.trim()) prev.cuit = row.destinoCuit.trim()
    }
  }

  const vistas: DestinatarioVista[] = [...porCbu.entries()].map(([cbu, row]) => ({
    id: `sugerencia:${cbu}`,
    nombre: row.nombre,
    cbu,
    cuit: row.cuit,
    alias: null,
    bancoNombre: bancoNombreDesdeCbu(cbu),
    tipo: row.tipo,
    tipoCuenta: null,
    usos: row.usos,
    ultimoUsoAt: row.fechaMs > 0 ? new Date(row.fechaMs).toISOString() : null,
    sugerido: true,
  }))

  return filtrarDestinatarios(vistas, '')
}
