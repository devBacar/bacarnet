/** Conversión de los textos del CSV a valores de Bacarnet. Sin floats para los importes. */

const FECHA_RE = /^(\d{4})-(\d{2})-(\d{2})/

/** "1234.5600" → 123456. "" → null. Redondea al centavo (mitad hacia arriba). */
export function aCentavos(texto: string | undefined): number | null {
  const t = (texto ?? '').trim()
  if (t === '') return null
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(t)
  if (!m) return null
  const signo = m[1] ? -1 : 1
  const entero = Number(m[2])
  const dec = (m[3] ?? '').padEnd(3, '0')
  let centavos = entero * 100 + Number(dec.slice(0, 2))
  if (Number(dec[2]) >= 5) centavos += 1
  return signo * centavos
}

export function aEntero(texto: string | undefined): number | null {
  const t = (texto ?? '').trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isInteger(n) ? n : null
}

export function aBool(texto: string | undefined): boolean {
  const t = (texto ?? '').trim().toLowerCase()
  return t === '1' || t === 'true'
}

export function aTexto(texto: string | undefined): string | null {
  const t = (texto ?? '').trim()
  return t === '' ? null : t
}

/** AAAA-MM-DD o null. */
export function aFecha(texto: string | undefined): string | null {
  const m = FECHA_RE.exec((texto ?? '').trim())
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** Fechas que no pueden ser reales (ej. vencimiento 2120 por error de carga). */
export function fechaImposible(fecha: string | null): boolean {
  if (!fecha) return false
  const anio = Number(fecha.slice(0, 4))
  return anio < 2000 || anio > 2060
}

/** CUIT con solo dígitos (11) o null. */
export function aCuit(texto: string | undefined): string | null {
  const d = (texto ?? '').replace(/\D/g, '')
  return d.length === 11 ? d : null
}

/** Últimos 8 dígitos del número de cheque, sin ceros a la izquierda. Sirve para cruzar tablas. */
export function serieCheque(numero: string | null | undefined): string {
  const d = (numero ?? '').replace(/\D/g, '')
  return d.slice(-8).replace(/^0+/, '') || '0'
}
