import { CONVENIOS, convenioDeEsquema, type Convenio } from './convenios.js'
import { excluidas, type ResultadoResumen } from './resumenMensual.js'
import { unidadDeArea, type UnidadNegocio } from './evolucion.js'

/**
 * Costos de personal mes a mes según la liquidación mensual de Salario: lo que se pagó (bruto, descuentos, neto)
 * y lo que le cuesta a la empresa (contribuciones, provisiones). Por área, empresa y convenio, sin nombres.
 * La liquidación de un mes se paga a principios del mes siguiente.
 */

export interface FilaCostoNomina {
  mes: string
  /** Centro de costo; -1 agrupa áreas con menos de 3 personas en el mes (para no mostrar sueldos individuales). */
  cc: number
  empresa: number
  convenio: Convenio
  personas: number
  /** Remunerativo, no remunerativo, descuentos y neto del recibo. */
  rem: number
  norem: number
  desc: number
  neto: number
  /** Contribuciones patronales y provisiones (aguinaldo y despidos) que calcula Salario. */
  contrib: number
  prov: number
  /** Costo laboral: el concepto COSTOS de Salario (desde jun-26); antes, remunerativo + no remunerativo + contribuciones. */
  costoLaboral: number
  /** Adelantos de sueldo y viáticos pagados durante el mes (incluidos en los descuentos). */
  adelantos: number
  /** Horas extra, feriados y compensatorias liquidados (incluidos en el remunerativo). */
  extras: number
}

export interface CostosNomina {
  meses: string[]
  filas: FilaCostoNomina[]
  /** Todas las áreas que aparecen en los costos (también las que no tienen horas extra). */
  areas: { cc: number; nombre: string; unidad: UnidadNegocio }[]
  empresas: { id: number; nombre: string }[]
  convenios: { id: Convenio; nombre: string }[]
  notas: string[]
}

export const AREA_AGRUPADA = -1
const MINIMO_PERSONAS_AREA = 3

/** Una persona en un mes, con sus importes. Solo perfil RRHH (se guarda aparte, un documento por mes). */
export interface PersonaCosto {
  legajo: number
  nombre: string
  /** Centro de costo real y el que se usa en los filtros (-1 si el área se agrupó en "Otras áreas"). */
  cc: number
  ccFiltro: number
  convenio: Convenio
  empresa: number
  rem: number
  norem: number
  neto: number
  costoLaboral: number
  extras: number
  /** Horas extra del mes: al 50%, al 100%, en feriado y compensatorias. */
  he50: number
  he100: number
  fer: number
  comp: number
}

export function construirCostosNomina(resultado: ResultadoResumen, nombreArea: (cc: number) => string = (cc) => `Centro de costo ${cc}`): CostosNomina & { personasPorMes: Record<string, PersonaCosto[]> } {
  const personasPorMes: Record<string, PersonaCosto[]> = {}
  // Personas por área y mes, para agrupar las áreas chicas.
  const dotacion = new Map<string, number>()
  for (const r of resultado.centrosCosto) dotacion.set(`${r.mes}|${r.cc}`, r.dotacion)

  const filas = new Map<string, FilaCostoNomina>()
  for (const p of resultado.personas) {
    const convenio = convenioDeEsquema(resultado.catalogos.esquemasLiquidacion[p.esquemaLiquidacion])
    for (const [mes, m] of Object.entries(p.meses)) {
      if (m.totales.rem <= 0 && m.totales.norem <= 0) continue
      const chica = (dotacion.get(`${mes}|${m.cc}`) ?? 0) < MINIMO_PERSONAS_AREA || m.cc <= 0
      const cc = chica ? AREA_AGRUPADA : m.cc
      const empresa = m.empresa ?? 1
      const clave = `${mes}|${cc}|${empresa}|${convenio}`
      const f = filas.get(clave) ?? {
        mes,
        cc,
        empresa,
        convenio,
        personas: 0,
        rem: 0,
        norem: 0,
        desc: 0,
        neto: 0,
        contrib: 0,
        prov: 0,
        costoLaboral: 0,
        adelantos: 0,
        extras: 0,
      }
      f.personas += 1
      f.rem += m.totales.rem
      f.norem += m.totales.norem
      f.desc += m.totales.desc
      f.neto += m.totales.neto
      // Con el concepto COSTOS (desde jun-26), las contribuciones son COSTOS − remunerativo − no remunerativo: el total
      // (TCTR) de Salario a veces suma de más (por ejemplo, con gratificaciones no remunerativas en una baja).
      const contrib = m.totales.costo > 0 ? m.totales.costo - m.totales.rem - m.totales.norem : m.totales.contrib
      f.contrib += contrib
      f.prov += m.totales.prov
      f.costoLaboral += m.totales.costo > 0 ? m.totales.costo : m.totales.rem + m.totales.norem + m.totales.contrib
      f.adelantos += m.totales.adelantos
      const extras = m.horas.he50.monto + m.horas.he100.monto + m.horas.fer.monto + m.horas.comp.monto
      const costo = m.totales.costo > 0 ? m.totales.costo : m.totales.rem + m.totales.norem + m.totales.contrib
      f.extras += extras
      filas.set(clave, f)
      ;(personasPorMes[mes] ??= []).push({
        legajo: p.legajo,
        nombre: p.nombre.trim(),
        cc: m.cc,
        ccFiltro: cc,
        convenio,
        empresa,
        rem: m.totales.rem,
        norem: m.totales.norem,
        neto: m.totales.neto,
        costoLaboral: costo,
        extras: Math.round(extras * 100) / 100,
        he50: m.horas.he50.hs,
        he100: m.horas.he100.hs,
        fer: m.horas.fer.hs,
        comp: m.horas.comp.hs,
      })
    }
  }
  const redondeo = (x: number) => Math.round(x * 100) / 100
  const lista = [...filas.values()]
    .map((f) => ({
      ...f,
      rem: redondeo(f.rem),
      norem: redondeo(f.norem),
      desc: redondeo(f.desc),
      neto: redondeo(f.neto),
      contrib: redondeo(f.contrib),
      prov: redondeo(f.prov),
      costoLaboral: redondeo(f.costoLaboral),
      adelantos: redondeo(f.adelantos),
      extras: redondeo(f.extras),
    }))
    .sort((a, b) => (a.mes === b.mes ? a.cc - b.cc : a.mes < b.mes ? -1 : 1))

  const empresas = [...new Set(lista.map((f) => f.empresa))]
    .sort((a, b) => a - b)
    .map((id) => ({ id, nombre: resultado.catalogos.empresas?.[id] ?? `Empresa ${id}` }))
  const orden: Convenio[] = ['suvico', 'camioneros', 'bancarios', 'comercio', 'fuera']
  for (const lista of Object.values(personasPorMes)) lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const ccs = [...new Set(lista.map((f) => f.cc).filter((cc) => cc > 0))]
  return {
    meses: [...new Set(lista.map((f) => f.mes))].sort(),
    filas: lista,
    areas: ccs
      .map((cc) => ({ cc, nombre: nombreArea(cc), unidad: unidadDeArea(resultado.catalogos.centrosCosto[cc]) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    personasPorMes,
    empresas,
    convenios: orden.filter((c) => lista.some((f) => f.convenio === c)).map((c) => ({ id: c, nombre: CONVENIOS[c].nombre })),
    notas: [
      ...excluidas(resultado),
      'Liquidación mensual de Salario (la única que trae sueldos del mes). Cada mes se paga a principios del mes siguiente: la de septiembre, en octubre.',
      'Neto = remunerativo + no remunerativo − descuentos. Los descuentos incluyen aportes (van a ARCA con el F.931), cuota sindical, Ganancias, mutuales y los adelantos que ya se pagaron durante el mes.',
      'Contribuciones patronales: desde junio de 2026, costo laboral menos remunerativo y no remunerativo (el total de contribuciones de Salario suma de más en algunos recibos con pagos no remunerativos grandes, como gratificaciones por baja).',
      'Costo laboral = el concepto "Costo laboral" de Salario (remunerativo + no remunerativo + contribuciones patronales); antes de junio de 2026, que Salario no lo calculaba, se suma igual. Las provisiones de aguinaldo y despidos se muestran aparte: no se pagan en el mes.',
      'El aguinaldo se liquida aparte (en junio y diciembre) y no está sumado acá; sus contribuciones aparecen en la liquidación mensual siguiente, por eso esos meses dan más altos.',
      'Las áreas con menos de 3 personas en el mes van juntas en "Otras áreas", para no mostrar sueldos individuales.',
      'Importes en pesos de cada mes, sin ajustar por inflación.',
    ],
  }
}
