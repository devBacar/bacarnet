/**
 * Importación de las inversiones en curso desde la planilla de compromisos de Finanzas.
 * Lee los grupos INVERSORES DOLARES / INVERSORES PESOS de cada hoja "Compromisos MM.AAAA",
 * sigue cada inversión hacia atrás mes a mes (historial) y la interpreta como condiciones de Bacarnet.
 * Todo puro: la hoja llega como matriz de celdas (ver celdasDeHoja en el servicio).
 */
import { sumarDias } from './fechas.js'
import type { CondicionesInversion, ConfigInversiones, MonedaInversion } from './inversion.types.js'

export interface PagoPlanilla {
  fecha: string
  montoCentavos: number
}

export interface FilaInversorPlanilla {
  hoja: string
  /** 'YYYY-MM' */
  mes: string
  /** Número de fila en Excel (1 = primera). */
  fila: number
  moneda: MonedaInversion
  concepto: string
  deudaCentavos: number | null
  importeCentavos: number | null
  cuota: { desde: number; hasta: number; total: number | null } | null
  cuotaTexto: string | null
  observacion: string | null
  pagos: PagoPlanilla[]
}

export interface HojaInversores {
  hoja: string
  mes: string
  filas: FilaInversorPlanilla[]
  avisos: string[]
}

// ── Lectura de celdas ─────────────────────────────────────────

export function normalizar(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Fecha de una celda: serial de Excel, Date o texto dd/mm/aaaa · aaaa-mm-dd. Sin zona horaria. */
export function fechaDeCelda(v: unknown): string | null {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000)
    return d.toISOString().slice(0, 10)
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Date(v.getTime() + 12 * 3600000).toISOString().slice(0, 10)
  }
  if (typeof v === 'string') {
    const iso = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
    const ar = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
    if (ar) {
      const anio = ar[3].length === 2 ? `20${ar[3]}` : ar[3]
      return `${anio}-${ar[2].padStart(2, '0')}-${ar[1].padStart(2, '0')}`
    }
  }
  return null
}

/** Monto de una celda en unidades (número o texto "1.234,56"). null si no es un monto. */
export function montoDeCelda(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v !== 'string') return null
  const t = v.trim().replace(/[$\s]|US\$/g, '')
  if (!/^-?[\d.]+(,\d+)?$/.test(t)) return null
  const n = Number(t.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const aCentavos = (n: number | null): number | null => (n === null ? null : Math.round(n * 100))

/** "41-42 de 67", "5 de 6", "5 y 6 de 18", "13/14 de 20", "14/15/16 de 20", "27 de .." */
export function leerCuota(v: unknown): FilaInversorPlanilla['cuota'] {
  if (typeof v !== 'string') return null
  const m = v.match(/(\d+(?:\s*[-y/]\s*\d+)*)\s*de\s*(\d+)?/i)
  if (!m) return null
  const numeros = m[1].split(/\s*[-y/]\s*/).map(Number)
  return { desde: numeros[0], hasta: numeros.at(-1)!, total: m[2] ? Number(m[2]) : null }
}

/** 'Compromisos 10.2026' → '2026-10' */
export function mesDeHoja(nombre: string): string | null {
  const m = nombre.trim().match(/^Compromisos (\d{2})\.(\d{4})$/i)
  return m ? `${m[2]}-${m[1]}` : null
}

interface Columnas {
  concepto: number
  deuda: number
  importe: number
  cuota: number
  observacion: number
  dias: Array<{ col: number; fecha: string }>
}

function columnasDe(encabezado: readonly unknown[]): Columnas | null {
  const buscar = (...nombres: string[]) => encabezado.findIndex((c) => nombres.some((n) => normalizar(c).startsWith(n)))
  const cols = {
    concepto: buscar('concepto'),
    deuda: buscar('deuda'),
    importe: buscar('importe a pagar', 'monto cuota'),
    cuota: buscar('cuota', 'n cuota', 'ncuota'),
    observacion: buscar('observacion', 'descripcion'),
  }
  if (Object.values(cols).some((i) => i < 0)) return null
  const dias: Columnas['dias'] = []
  let pendientesFinde: number[] = []
  for (let col = cols.observacion + 1; col < encabezado.length; col++) {
    const h = encabezado[col]
    const texto = normalizar(h)
    if (texto.startsWith('acumulado') || texto.startsWith('diferencia')) break
    const fecha = fechaDeCelda(h)
    if (fecha) {
      // "Finde" sin fecha: si viene antes del primer día, es el sábado anterior; si no, el día siguiente al último.
      for (const f of pendientesFinde) dias.push({ col: f, fecha: sumarDias(fecha, -2) })
      pendientesFinde = []
      dias.push({ col, fecha })
    } else if (texto.startsWith('finde')) {
      const ultimo = dias.at(-1)
      if (ultimo) dias.push({ col, fecha: sumarDias(ultimo.fecha, 1) })
      else pendientesFinde.push(col)
    }
  }
  return { ...cols, dias }
}

/** Filas de los grupos de inversores de una hoja. Las filas SUBTOTALES no se toman. */
export function leerInversoresDeHoja(celdas: readonly (readonly unknown[])[], hoja: string): HojaInversores {
  const avisos: string[] = []
  const mes = mesDeHoja(hoja)
  if (!mes) return { hoja, mes: '', filas: [], avisos: [`La hoja "${hoja}" no tiene el nombre "Compromisos MM.AAAA".`] }
  const cols = columnasDe(celdas[1] ?? [])
  if (!cols) return { hoja, mes, filas: [], avisos: [`En "${hoja}" no encontré los encabezados (CONCEPTO, DEUDA, IMPORTE, CUOTA, OBSERVACION).`] }
  const filas: FilaInversorPlanilla[] = []
  let moneda: MonedaInversion | null = null
  for (let i = 2; i < celdas.length; i++) {
    const r = celdas[i] ?? []
    const concepto = String(r[cols.concepto] ?? '').trim()
    if (!concepto) continue
    const n = normalizar(concepto)
    if (n.startsWith('inversores dolares')) { moneda = 'USD'; continue }
    if (n.startsWith('inversores pesos')) { moneda = 'ARS'; continue }
    if (n.startsWith('subtotal')) {
      if (moneda === 'ARS') break
      moneda = null
      continue
    }
    if (!moneda) continue
    const cuotaTexto = typeof r[cols.cuota] === 'string' ? String(r[cols.cuota]).trim() || null : null
    filas.push({
      hoja,
      mes,
      fila: i + 1,
      moneda,
      concepto,
      deudaCentavos: aCentavos(montoDeCelda(r[cols.deuda])),
      importeCentavos: aCentavos(montoDeCelda(r[cols.importe])),
      cuota: leerCuota(cuotaTexto),
      cuotaTexto,
      observacion: typeof r[cols.observacion] === 'string' ? String(r[cols.observacion]).trim() || null : null,
      pagos: cols.dias
        .map(({ col, fecha }) => ({ fecha, montoCentavos: aCentavos(montoDeCelda(r[col])) ?? 0 }))
        .filter((p) => p.montoCentavos > 0),
    })
  }
  return { hoja, mes, filas, avisos }
}

// ── Historial: seguir cada inversión hacia atrás ──────────────

export interface Cadena {
  /** De la más vieja a la del último mes. */
  meses: FilaInversorPlanilla[]
  revisar: string[]
}

function palabras(nombre: string): string[] {
  return normalizar(nombre).split(' ').filter((p) => p.length > 1)
}

/** Qué tan parecido es el nombre: 3 = mismas palabras, 2 = una contiene a la otra, 1 = mismo apellido (primera palabra). */
function parecido(a: string, b: string): number {
  const pa = palabras(a)
  const pb = palabras(b)
  if (pa.length === 0 || pb.length === 0) return 0
  if (pa.join(' ') === pb.join(' ')) return 3
  const sa = new Set(pa)
  const sb = new Set(pb)
  if (pa.every((p) => sb.has(p)) || pb.every((p) => sa.has(p))) return 2
  return pa[0] === pb[0] ? 1 : 0
}

/**
 * La cuota del mes anterior encaja con la de este. En la planilla la numeración se repite o se pisa
 * ("41 de 67" → "41-42 de 67" cuando una cuota se termina de pagar al mes siguiente), así que alcanza con
 * que el total sea el mismo y que no retroceda ni salte más de 2. Si cambió el total, es otro acuerdo.
 */
function cuotaEncaja(antes: FilaInversorPlanilla, ahora: FilaInversorPlanilla): boolean | null {
  if (!antes.cuota || !ahora.cuota) return null
  if (antes.cuota.total && ahora.cuota.total && antes.cuota.total !== ahora.cuota.total) return false
  return antes.cuota.desde <= ahora.cuota.desde && ahora.cuota.desde - antes.cuota.hasta <= 2
}

function puntaje(antes: FilaInversorPlanilla, ahora: FilaInversorPlanilla): number {
  if (antes.moneda !== ahora.moneda) return 0
  const nombre = parecido(antes.concepto, ahora.concepto)
  if (nombre === 0) return 0
  const cuota = cuotaEncaja(antes, ahora)
  if (cuota === false) return 0
  return nombre * 10 + (cuota ? 5 : 0) + (normalizar(antes.observacion) === normalizar(ahora.observacion) ? 1 : 0)
}

/**
 * Para cada fila de la última hoja, busca la misma inversión en los meses anteriores.
 * Se corta cuando un mes no aparece (si vuelve a aparecer después, es otra inversión).
 * Cada fila de un mes se usa para una sola cadena.
 */
export function encadenar(hojas: readonly HojaInversores[]): Cadena[] {
  const ordenadas = [...hojas].filter((h) => h.mes).sort((a, b) => a.mes.localeCompare(b.mes))
  const ultima = ordenadas.at(-1)
  if (!ultima) return []
  const cadenas: Cadena[] = ultima.filas.map((f) => ({ meses: [f], revisar: [] }))
  for (let i = ordenadas.length - 2; i >= 0; i--) {
    const usadas = new Set<number>()
    for (const cadena of cadenas) {
      const ahora = cadena.meses[0]
      if (ahora.mes !== ordenadas[i + 1].mes) continue // la cadena ya se cortó
      const candidatos = ordenadas[i].filas
        .map((f, idx) => ({ f, idx, p: puntaje(f, ahora) }))
        .filter((c) => c.p > 0 && !usadas.has(c.idx))
        .sort((a, b) => b.p - a.p)
      const mejor = candidatos[0]
      if (!mejor) continue
      if (candidatos[1] && candidatos[1].p === mejor.p) {
        cadena.revisar.push(`En ${ordenadas[i].mes} hay más de una fila parecida a "${ahora.concepto}": revisá el historial.`)
      }
      if (mejor.p < 20) cadena.revisar.push(`En ${ordenadas[i].mes} el nombre era "${mejor.f.concepto}".`)
      usadas.add(mejor.idx)
      cadena.meses.unshift(mejor.f)
    }
  }
  return cadenas
}

// ── Interpretación ────────────────────────────────────────────

export interface Interpretacion {
  condiciones: CondicionesInversion | null
  cuotasPagadas: number
  texto: string
  avisos: string[]
  errores: string[]
}

function porcentaje(obs: string | null): number | null {
  // "0,75%", o "Cobra 1,5" / "Capitaliza 1,25" aunque falte el signo.
  const m = (obs ?? '').match(/(\d+(?:[.,]\d+)?)\s*%/) ?? (obs ?? '').match(/(?:cobra|capitaliza)\s+(\d+(?:[.,]\d+)?)/i)
  if (!m) return null
  const n = Number(m[1].replace(',', '.'))
  return Number.isFinite(n) && n > 0 && n < 50 ? n : null
}

function monto(c: number, moneda: MonedaInversion): string {
  const s = (c / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${moneda === 'USD' ? 'US$' : '$'} ${s}`
}

/** Día del primer pago del mes (las cuotas siguen ese día); si no hubo pagos, el 10. */
function diaDeCuota(f: FilaInversorPlanilla): string {
  return f.pagos[0]?.fecha ?? `${f.mes}-10`
}

/**
 * Cómo se carga en Bacarnet la inversión del último mes de la cadena.
 * Las cuotas arrancan el mes siguiente (el mes de la hoja ya entra por Compromisos del mes).
 */
export function interpretar(actual: FilaInversorPlanilla, config: ConfigInversiones): Interpretacion {
  const avisos: string[] = []
  const deuda = actual.deudaCentavos
  if (!deuda || deuda <= 0) {
    return { condiciones: null, cuotasPagadas: 0, texto: 'Sin deuda en la planilla', avisos, errores: ['La planilla no tiene deuda para esta fila.'] }
  }
  const obs = normalizar(actual.observacion)
  const pct = porcentaje(actual.observacion)
  const base = {
    moneda: actual.moneda,
    capitalCentavos: deuda,
    fechaAlta: diaDeCuota(actual),
    periodicidad: 'mensual' as const,
    fechaVencimiento: null,
    baseDias: config.baseDiasDefault,
    cuotasAMedida: null,
    devolucionEnPesos: null,
    medioIngresoPrevisto: 'transferencia' as const,
    mediosDevolucion: [actual.moneda === 'USD' ? 'transferencia_usd' : obs.includes('cheque') ? 'cheque' : 'transferencia_ars'] as CondicionesInversion['mediosDevolucion'],
    penalidadPrecancelacion: config.penalidadDefault,
  }
  const tasaMensual = (p: number) => ({ tipo: 'fija' as const, tnaPct: Math.round(p * 12 * 10000) / 10000, expresada: 'mensual' as const })
  const ok = (condiciones: CondicionesInversion, cuotasPagadas: number, texto: string): Interpretacion => ({ condiciones, cuotasPagadas, texto, avisos, errores: [] })

  if (obs.includes('cobra') && pct) {
    return ok(
      { ...base, sistema: 'americano', cantidadCuotas: 1, sinVencimiento: true, cuotasPrevias: 0, tasa: tasaMensual(pct) },
      0,
      `Paga ${pct.toLocaleString('es-AR')} % por mes sobre ${monto(deuda, actual.moneda)}, sin fecha de devolución`,
    )
  }
  if (obs.includes('capitaliza') && pct) {
    return ok(
      { ...base, sistema: 'capitaliza', cantidadCuotas: 1, sinVencimiento: true, cuotasPrevias: 0, tasa: tasaMensual(pct) },
      0,
      `El ${pct.toLocaleString('es-AR')} % por mes se suma a la deuda de ${monto(deuda, actual.moneda)}, sin fecha de devolución`,
    )
  }
  if (actual.cuota?.total) {
    const restantes = actual.cuota.total - actual.cuota.hasta
    if (restantes <= 0) {
      return { condiciones: null, cuotasPagadas: actual.cuota.hasta, texto: 'Ya pagó la última cuota', avisos, errores: ['Según la planilla ya pagó todas las cuotas.'] }
    }
    const tasa = tasaMensual(pct ?? 0)
    const conInteres = pct ? ` con ${pct.toLocaleString('es-AR')} % por mes` : ''
    if (actual.importeCentavos && actual.cuota.hasta > actual.cuota.desde) {
      avisos.push(`Este mes pagó ${actual.cuota.hasta - actual.cuota.desde + 1} cuotas juntas (${actual.cuotaTexto}).`)
    }
    return ok(
      { ...base, sistema: 'frances', cantidadCuotas: restantes, sinVencimiento: false, cuotasPrevias: actual.cuota.hasta, tasa },
      actual.cuota.hasta,
      `${restantes === 1 ? 'Le falta 1 cuota' : `Le faltan ${restantes} cuotas`} de ${actual.cuota.total}${conInteres} para devolver ${monto(deuda, actual.moneda)}`,
    )
  }
  if (actual.importeCentavos && actual.importeCentavos > 0) {
    const n = Math.min(600, Math.ceil(deuda / actual.importeCentavos))
    avisos.push(`La planilla no dice cuántas cuotas son: se toman ${n} cuotas de ${monto(actual.importeCentavos, actual.moneda)} hasta cubrir la deuda.`)
    return ok(
      { ...base, sistema: 'frances', cantidadCuotas: n, sinVencimiento: false, cuotasPrevias: 0, tasa: tasaMensual(0) },
      0,
      `${n === 1 ? '1 cuota' : `${n} cuotas iguales`} para devolver ${monto(deuda, actual.moneda)}`,
    )
  }
  return {
    condiciones: null,
    cuotasPagadas: 0,
    texto: 'No se puede deducir cómo se devuelve',
    avisos,
    errores: ['La planilla no dice cuánto se paga ni a qué tasa: el inversor se crea, pero esta inversión hay que cargarla a mano.'],
  }
}

/** Pagos de todos los meses de la cadena, para mostrar en la ficha ("pagos según planilla"). */
export function historialDe(cadena: Cadena): Array<PagoPlanilla & { mes: string }> {
  return cadena.meses.flatMap((m) => m.pagos.map((p) => ({ ...p, mes: m.mes })))
}

/** Id fijo: re-importar la misma planilla no duplica. */
export function idInversionImportada(cadena: Cadena): string {
  const primero = cadena.meses[0]
  const slug = normalizar(primero.concepto).replace(/\s+/g, '-').slice(0, 40)
  return `pla-${primero.moneda.toLowerCase()}-${slug}-${primero.mes}-f${primero.fila}`
}

/**
 * El capital de esta importación debe sumar de verdad a la Caja principal.
 * Solo si es realmente nueva: aparece por primera vez en el mes tope (un solo mes en la cadena)
 * y ese inversor no tiene ninguna inversión ya importada (así una cuota más de un inversor viejo
 * no se confunde con un inversor nuevo, aunque el id de fila sea distinto).
 */
export function capitalNuevoSumaACaja(cadena: Cadena, inversorYaImportado: boolean): boolean {
  return cadena.meses.length === 1 && !inversorYaImportado
}
