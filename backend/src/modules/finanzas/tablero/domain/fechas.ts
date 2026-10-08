export function esMes(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) return false
  const month = Number(value.slice(5, 7))
  return month >= 1 && month <= 12
}

export function mesDeFecha(ymd: string): string {
  return ymd.slice(0, 7)
}

export function inicioMes(mes: string): string {
  return `${mes}-01`
}

/** Último día del mes calendario (AAAA-MM-DD). */
export function ultimoDiaMes(mes: string): string {
  const year = Number(mes.slice(0, 4))
  const month = Number(mes.slice(5, 7))
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${mes}-${String(last).padStart(2, '0')}`
}

export function sumarMeses(mes: string, delta: number): string {
  const year = Number(mes.slice(0, 4))
  const month = Number(mes.slice(5, 7))
  const date = new Date(Date.UTC(year, month - 1 + delta, 1))
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** `cantidad` meses calendario que terminan en `hastaMes`, del más viejo al más nuevo. */
export function mesesHasta(hastaMes: string, cantidad: number): string[] {
  const meses: string[] = []
  for (let i = cantidad - 1; i >= 0; i -= 1) meses.push(sumarMeses(hastaMes, -i))
  return meses
}

/** El mes anterior al de `hoy` (AAAA-MM-DD). En cualquier día de octubre, septiembre ya cerró. */
export function ultimoMesCompleto(hoy: string): string {
  return sumarMeses(mesDeFecha(hoy), -1)
}
