/** Campos que identifican una fila del banco para reaplicar categoría, nota y detalle de caja tras un reemplazo. */
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
  /** Respaldo cuando cambia solo el texto (p. ej. "NO INFORMADO" del día → texto real al otro día). */
  huellaSinDescripcion?: string
  categoriaId: string | null
  nota: string | null
  /** Solo se conserva si la cargó una persona. El resto se vuelve a calcular. */
  contraparteNombre?: string | null
  contraparteCuit?: string | null
  contraparteOrigen?: 'manual' | null
  /**
   * Palabra de la planilla de caja. Solo se conserva si la cargó una persona
   * (`manual`). La sugerida se vuelve a calcular.
   */
  detalleCaja?: string | null
  detalleCajaOrigen?: 'manual' | null
}

function parte(value: unknown): string {
  if (value == null) return ''
  return String(value)
}

export function huellaMovimiento(row: HuellaMovimientoInput): string {
  return huellaCon(row, parte(row.descripcion))
}

export function huellaMovimientoSinDescripcion(row: HuellaMovimientoInput): string {
  return huellaCon(row, '')
}

function huellaCon(row: HuellaMovimientoInput, descripcion: string): string {
  return [
    parte(row.fechaProceso),
    parte(row.tipo),
    parte(row.montoCentavos),
    descripcion,
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
 * Las anotaciones que no encuentran su fila exacta se prueban ignorando la descripción
 * (mismo día, monto, tipo y códigos), para no perder lo categorizado cuando el banco
 * reemplaza el texto provisorio del día en curso.
 */
export function emparejarAnotaciones<T extends HuellaMovimientoInput>(
  filas: T[],
  anotaciones: AnotacionMovimiento[],
): Array<
  T & {
    categoriaId: string | null
    nota: string | null
    contraparteNombre: string | null
    contraparteCuit: string | null
    contraparteOrigen: 'manual' | null
    detalleCaja: string | null
    detalleCajaOrigen: 'manual' | null
  }
> {
  const colas = new Map<string, AnotacionMovimiento[]>()
  for (const anotacion of anotaciones) {
    const cola = colas.get(anotacion.huella) ?? []
    cola.push(anotacion)
    colas.set(anotacion.huella, cola)
  }

  const asignadas: Array<AnotacionMovimiento | undefined> = filas.map((fila) =>
    colas.get(huellaMovimiento(fila))?.shift(),
  )

  const sobrantes = new Map<string, AnotacionMovimiento[]>()
  for (const cola of colas.values()) {
    for (const anotacion of cola) {
      if (!anotacion.huellaSinDescripcion) continue
      const lista = sobrantes.get(anotacion.huellaSinDescripcion) ?? []
      lista.push(anotacion)
      sobrantes.set(anotacion.huellaSinDescripcion, lista)
    }
  }

  return filas.map((fila, i) => {
    const anotacion = asignadas[i] ?? sobrantes.get(huellaMovimientoSinDescripcion(fila))?.shift()
    const manual = anotacion?.contraparteOrigen === 'manual'
    const detalleManual =
      anotacion?.detalleCajaOrigen === 'manual' && anotacion.detalleCaja?.trim()
        ? anotacion.detalleCaja.trim()
        : null
    return {
      ...fila,
      categoriaId: anotacion?.categoriaId ?? null,
      nota: anotacion?.nota ?? null,
      contraparteNombre: manual ? (anotacion?.contraparteNombre ?? null) : null,
      contraparteCuit: manual ? (anotacion?.contraparteCuit ?? null) : null,
      contraparteOrigen: manual ? 'manual' : null,
      detalleCaja: detalleManual,
      detalleCajaOrigen: detalleManual ? 'manual' : null,
    }
  })
}
