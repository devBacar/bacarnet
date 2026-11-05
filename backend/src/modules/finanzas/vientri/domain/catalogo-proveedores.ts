import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'

export interface ProveedorCatalogoEntrada {
  id: string
  nombre: string
  alias: string[]
  /** Nombre y alias ya normalizados. */
  claves: string[]
}

export interface SugerenciaProveedor {
  proveedorId: string
  nombre: string
}

export interface ProveedorCatalogoItem {
  id: string
  nombre: string
  alias: string[]
  cantidadCheques: number
  totalCentavos: number
}

export interface BeneficiarioSinAsignar {
  nombreNormalizado: string
  /** Cómo aparece escrito en los cheques (el más usado primero). */
  nombre: string
  variantes: string[]
  cantidadCheques: number
  totalCentavos: number
  sugerencias: SugerenciaProveedor[]
}

export interface CatalogoProveedoresFinancieros {
  proveedores: ProveedorCatalogoItem[]
  sinAsignar: BeneficiarioSinAsignar[]
}

const MAX_SUGERENCIAS = 3

function tokens(t: string): string[] {
  return t.split(' ').filter((x) => x.length >= 3)
}

function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let anterior = fila[0]!
    fila[0] = i
    for (let j = 1; j <= b.length; j++) {
      const actual = fila[j]!
      fila[j] = Math.min(fila[j]! + 1, fila[j - 1]! + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1))
      anterior = actual
    }
  }
  return fila[b.length]!
}

/** Dos nombres "se parecen" si uno contiene todas las palabras del otro ("op mana" / "mana") o difieren en una letra. */
function seParecen(beneficiario: string, clave: string): boolean {
  const tb = tokens(beneficiario)
  const tc = tokens(clave)
  if (tb.length > 0 && tc.length > 0) {
    if (tc.every((t) => tb.includes(t)) || tb.every((t) => tc.includes(t))) return true
  }
  return beneficiario.length >= 4 && clave.length >= 4 && distancia(beneficiario, clave) <= 1
}

/** Proveedores que probablemente son el mismo que este beneficiario. Es solo una ayuda: lo decide Finanzas. */
export function sugerirProveedores(
  beneficiarioNormalizado: string,
  proveedores: ProveedorCatalogoEntrada[],
): SugerenciaProveedor[] {
  return proveedores
    .filter((p) => p.claves.some((c) => seParecen(beneficiarioNormalizado, c)))
    .slice(0, MAX_SUGERENCIAS)
    .map((p) => ({ proveedorId: p.id, nombre: p.nombre }))
}

/**
 * Catálogo de proveedores con lo que tiene cada uno, y los beneficiarios de cheques ocasionales que no
 * coinciden con ningún nombre ni alias (los "dudosos" que Finanzas tiene que asignar).
 */
export function armarCatalogoProveedores(
  docs: ChequeOcasionalDoc[],
  proveedores: ProveedorCatalogoEntrada[],
): CatalogoProveedoresFinancieros {
  const items = new Map<string, ProveedorCatalogoItem>(
    proveedores.map((p) => [p.id, { id: p.id, nombre: p.nombre, alias: p.alias, cantidadCheques: 0, totalCentavos: 0 }]),
  )
  const sin = new Map<string, { variantes: Map<string, number>; cantidad: number; total: number }>()

  for (const d of docs) {
    if (d.baja) continue
    const item = d.proveedorFinancieroId ? items.get(d.proveedorFinancieroId) : undefined
    if (item) {
      item.cantidadCheques += 1
      item.totalCentavos += d.montoCentavos
      continue
    }
    if (d.beneficiarioNormalizado === '') continue
    const g = sin.get(d.beneficiarioNormalizado) ?? { variantes: new Map<string, number>(), cantidad: 0, total: 0 }
    g.variantes.set(d.beneficiario, (g.variantes.get(d.beneficiario) ?? 0) + 1)
    g.cantidad += 1
    g.total += d.montoCentavos
    sin.set(d.beneficiarioNormalizado, g)
  }

  const sinAsignar = [...sin.entries()]
    .map(([nombreNormalizado, g]): BeneficiarioSinAsignar => {
      const variantes = [...g.variantes.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n)
      return {
        nombreNormalizado,
        nombre: variantes[0] ?? nombreNormalizado,
        variantes,
        cantidadCheques: g.cantidad,
        totalCentavos: g.total,
        sugerencias: sugerirProveedores(nombreNormalizado, proveedores),
      }
    })
    .sort((a, b) => b.totalCentavos - a.totalCentavos)

  const lista = [...items.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return { proveedores: lista, sinAsignar }
}
