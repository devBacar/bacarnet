const PALETA = ['#0f766e', '#1d4ed8', '#b45309', '#7c3aed', '#be123c', '#0369a1', '#3f6212', '#9a3412']

const NOMBRE_MAX = 40
const NOTA_MAX = 500
const COLOR_HEX = /^#[0-9a-fA-F]{6}$/

export function normalizarNombreCategoria(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export function claveNombreCategoria(nombre: string): string {
  return normalizarNombreCategoria(nombre).toLocaleLowerCase('es')
}

export function validarNombreCategoria(raw: string): string {
  const nombre = normalizarNombreCategoria(raw)
  if (!nombre) throw new Error('El nombre de la categoría es obligatorio')
  if (nombre.length > NOMBRE_MAX) {
    throw new Error(`El nombre de la categoría puede tener hasta ${NOMBRE_MAX} caracteres`)
  }
  return nombre
}

export function colorDesdeNombre(nombre: string): string {
  let hash = 0
  for (const char of nombre) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return PALETA[hash % PALETA.length] ?? PALETA[0]
}

export function normalizarColorCategoria(raw: unknown, nombre: string): string | null {
  if (raw == null || raw === '') return colorDesdeNombre(nombre)
  if (typeof raw !== 'string' || !COLOR_HEX.test(raw.trim())) {
    throw new Error('El color tiene que ser un hexadecimal de 6 dígitos, por ejemplo #1d4ed8')
  }
  return raw.trim().toLowerCase()
}

export function normalizarNotaMovimiento(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw !== 'string') throw new Error('La nota tiene que ser texto')
  const nota = raw.trim()
  if (!nota) return null
  if (nota.length > NOTA_MAX) throw new Error(`La nota puede tener hasta ${NOTA_MAX} caracteres`)
  return nota
}
