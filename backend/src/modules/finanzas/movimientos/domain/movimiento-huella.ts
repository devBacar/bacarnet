/** Campos que identifican una fila del banco para reaplicar categoría y nota tras un reemplazo. */
export interface HuellaMovimientoInput {
  fechaProceso?: unknown
  tipo?: unknown
  montoCentavos?: unknown
  descripcion?: unknown
  operationCodeBank?: unknown
  operationCodeIb?: unknown
  voucherNumber?: unknown
  correlativeNumber?: unknown
  depositorDescription?: unknown
  customerCuit?: unknown
}

export interface AnotacionMovimiento {
  huella: string
  categoriaId: string | null
  nota: string | null
}

function parte(value: unknown): string {
  if (value == null) return ''
  return String(value)
}

export function huellaMovimiento(row: HuellaMovimientoInput): string {
  return [
    parte(row.fechaProceso),
    parte(row.tipo),
    parte(row.montoCentavos),
    parte(row.descripcion),
    parte(row.operationCodeBank),
    parte(row.operationCodeIb),
    parte(row.voucherNumber),
    parte(row.correlativeNumber),
    parte(row.depositorDescription),
    parte(row.customerCuit),
  ].join('\u001f')
}

/**
 * Reparte anotaciones sobre filas nuevas con la misma huella.
 * Si hay dos filas idénticas y una sola anotación, se la queda la primera.
 */
export function emparejarAnotaciones<T extends HuellaMovimientoInput>(
  filas: T[],
  anotaciones: AnotacionMovimiento[],
): Array<T & { categoriaId: string | null; nota: string | null }> {
  const colas = new Map<string, AnotacionMovimiento[]>()
  for (const anotacion of anotaciones) {
    const cola = colas.get(anotacion.huella) ?? []
    cola.push(anotacion)
    colas.set(anotacion.huella, cola)
  }

  return filas.map((fila) => {
    const cola = colas.get(huellaMovimiento(fila))
    const anotacion = cola?.shift()
    return {
      ...fila,
      categoriaId: anotacion?.categoriaId ?? null,
      nota: anotacion?.nota ?? null,
    }
  })
}
