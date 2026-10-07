const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function numero(v: number): string {
  return nf.format(v)
}

export function numero1(v: number): string {
  return nf1.format(v)
}

/** $ 1,6 mil M · $ 58,4 M · $ 9.783 */
export function pesosCorto(v: number): string {
  const a = Math.abs(v)
  // Miles de millones en millones ("$ 1.865 M"): "mil M" se presta a confusión.
  if (a >= 1e9) return `$ ${nf.format(v / 1e6)} M`
  if (a >= 1e6) return `$ ${nf1.format(v / 1e6)} M`
  return `$ ${nf.format(v)}`
}

export function nombreMes(mes: string): string {
  return MESES[Number(mes.slice(4, 6)) - 1] ?? mes
}

/** "sep-26" */
export function mesCorto(mes: string): string {
  return `${nombreMes(mes).slice(0, 3)}-${mes.slice(2, 4)}`
}

/** "Septiembre 2026" */
export function mesLargo(mes: string): string {
  const n = nombreMes(mes)
  return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${mes.slice(0, 4)}`
}

export function fechaHora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "del 26 al 25" o "del 1 a fin de mes", según el corte de liquidación del convenio. */
export function textoCorte(corte: 'ciclo26' | 'calendario'): string {
  return corte === 'ciclo26' ? 'del 26 al 25' : 'del 1 a fin de mes'
}

/** "26/08 al 25/09" o "1/09 al 30/09": días que cubre la liquidación del mes AAAAMM. */
export function rangoLiquidacion(mes: string, corte: 'ciclo26' | 'calendario'): string {
  const anio = Number(mes.slice(0, 4))
  const m = Number(mes.slice(4, 6))
  const dd = (x: number) => String(x).padStart(2, '0')
  if (corte === 'ciclo26') return `26/${dd(m === 1 ? 12 : m - 1)} al 25/${dd(m)}`
  const ultimo = new Date(Date.UTC(anio, m, 0)).getUTCDate()
  return `1/${dd(m)} al ${ultimo}/${dd(m)}`
}

/** Aclaración del corte de un mes liquidado, para poner debajo del título. */
export function aclaracionCorte(mes: string): string {
  return `SUVICO y Camioneros: del ${rangoLiquidacion(mes, 'ciclo26')} · Comercio, Bancarios y Fuera de convenio: del ${rangoLiquidacion(mes, 'calendario')}`
}
