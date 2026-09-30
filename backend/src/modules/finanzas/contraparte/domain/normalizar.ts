const NOMBRE_MAX = 120

export function nombreContraparteLimpio(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const nombre = raw.trim().replace(/\s+/g, ' ')
  if (!nombre) return null
  return nombre.length > NOMBRE_MAX ? nombre.slice(0, NOMBRE_MAX) : nombre
}

/** 11 dígitos, o null. Acepta guiones y espacios. */
export function cuitOnceDigitos(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const digits = String(raw).replace(/\D/g, '')
  return /^\d{11}$/.test(digits) ? digits : null
}

export function soloDigitos(raw: unknown): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') return ''
  return String(raw).replace(/\D/g, '')
}

export function claveTexto(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')
}
