import JSZip from 'jszip'

/** Tope de lo que puede ocupar el zip descomprimido (la exportación completa pesa ~50 MB). */
export const MAX_BYTES_DESCOMPRIMIDO = 400 * 1024 * 1024

/** Nombre que deja SIS5 en Drive: vientri_AAAAMMDD_HHMM.zip */
export const PATRON_ZIP_VIENTRI = /^vientri_\d{8}_\d{4}\.zip$/

/**
 * Lee el .zip de una exportación de Vientri y devuelve sus CSV por nombre de archivo.
 * Ignora carpetas internas (PowerShell 5 puede usar "\" como separador) y el BOM inicial.
 */
export async function leerZipVientri(datos: Uint8Array): Promise<Map<string, string>> {
  const zip = await JSZip.loadAsync(datos)
  const textos = new Map<string, string>()
  let total = 0
  for (const entrada of Object.values(zip.files)) {
    if (entrada.dir) continue
    const nombre = entrada.name.split(/[\\/]/).pop() ?? entrada.name
    if (!nombre.toLowerCase().endsWith('.csv')) continue
    if (textos.has(nombre)) throw new Error(`El zip trae dos veces ${nombre}`)
    let texto = await entrada.async('string')
    total += texto.length
    if (total > MAX_BYTES_DESCOMPRIMIDO) throw new Error('El zip descomprimido es demasiado grande')
    if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1)
    textos.set(nombre, texto)
  }
  return textos
}

/** Solo se importa si el zip más nuevo de Drive no es el último que ya se importó bien. */
export function hayQueImportar(ultimo: { archivo: string | null; ok: boolean } | null, archivo: string): boolean {
  return !ultimo || !ultimo.ok || ultimo.archivo !== archivo
}

/** Horas desde una fecha de datos de Vientri ("2026-10-19T10:55:35", hora Argentina, sin zona). */
export function horasDesdeFechaDatos(fechaDatos: string, ahora: Date = new Date()): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(fechaDatos)
  if (!m) return Number.POSITIVE_INFINITY
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0) + 3, Number(m[5] ?? 0))
  return (ahora.getTime() - utc) / 3_600_000
}
