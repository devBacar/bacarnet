import type { FactoresCosto } from './costosEmpresa.js'

/**
 * Tres planes para bajar las horas extra (suave, medio y brusco) con las mismas cinco palancas
 * en distinta intensidad. Todo a costo empresa (ver costosEmpresa.ts) y sin las horas pactadas.
 */

export type IdPlan = 'suave' | 'medio' | 'brusco'
export type IdMedida = 'contratar' | 'vacaciones' | 'eventuales' | 'turnos' | 'feriados'

/** Datos de un área que necesitan los planes (los arma informeMensual). */
export interface InsumoPlanArea {
  cc: number
  nombre: string
  tipo: 'ausencias' | 'estructural'
  convenio: string
  horasMes: number
  /** Horas extra (50% + 100%) por mes, promedio de los 3 meses cerrados, sin horas pactadas. */
  horasExtraMes: number
  /** Horas extra que se repiten todos los meses (todas en áreas estructurales; la base fija en las demás). */
  horasHabituales: number
  proporcion100: number
  /** Valor liquidado de una hora al 50% y al 100% (sin cargas). */
  valor50: number
  valor100: number
  /** Costo empresa de una hora extra promedio del área. */
  horaExtraEmpresa: number
  /** Costo empresa de una hora en feriado. */
  horaFeriadoEmpresa: number
  horasFeriadoPorFeriado: number
  /** Costo total por mes de una persona más y parte del mes que trabaja de verdad. */
  costoPersonaMes: number
  productividad: number
  /** Horas extra por hora de ausencia por encima del umbral (áreas tipo ausencias). */
  horasExtraPorHoraAusencia: number
  /** Meses que quedan de la temporada de vacaciones: días previstos y días que el área cubre sin horas extra. */
  temporada: { mes: string; vacaciones: number; cupo: number }[]
}

export interface InsumosPlanes {
  areas: InsumoPlanArea[]
  factores: FactoresCosto
  /** Feriados de los próximos 12 meses según el calendario. */
  feriadosAnio: number
  eventuales: { personas: number; horasLibresMes: number; costoHora: number }
  /** Gasto en horas extra (con feriados) por mes, a costo empresa: total y pactadas. */
  gastoMensual: number
  pactadasMensual: number
}

export interface AreaMedida {
  cc: number
  nombre: string
  ahorroAnual: number
  personas?: number
  detalle: string
}

export interface MedidaPlan {
  id: IdMedida
  titulo: string
  explicacion: string
  ahorroAnual: number
  areas: AreaMedida[]
  /** Condición para que el ahorro se dé ("requiere acuerdo con clientes"). */
  requiere?: string
}

export interface Plan {
  id: IdPlan
  nombre: string
  descripcion: string
  ahorroAnual: number
  ahorroMensual: number
  /** Ahorro sobre el gasto que se puede reducir (sin pactadas). */
  porcentaje: number
  personasAContratar: number
  costoContratacionesMes: number
  horasMenosPorMes: number
  medidas: MedidaPlan[]
}

export interface ContratacionArea {
  cc: number
  nombre: string
  costoPersonaMes: number
  /** Lo que se paga hoy en horas extra por las horas que cubriría una persona. */
  horasExtraQueReemplaza: number
  ahorroPorPersonaMes: number
  /** Hasta cuánto pueden sumar por persona y por mes los gastos fuera de Salario para que siga conviniendo. */
  margenOtrosCostosMes: number
  puestosEquivalentes: number
  conviene: boolean
}

export interface PlanesReduccion {
  gastoMensual: number
  pactadasMensual: number
  gastoMensualReducible: number
  planes: Plan[]
  contratacion: ContratacionArea[]
  factores: FactoresCosto
  supuestos: string[]
}

export const NIVELES: Record<IdPlan, { contratar: number; vacaciones: number; eventuales: number; turnos: number; feriados: number }> = {
  suave: { contratar: 0, vacaciones: 0.5, eventuales: 0, turnos: 0.1, feriados: 0 },
  medio: { contratar: 1 / 3, vacaciones: 0.75, eventuales: 0.5, turnos: 0.25, feriados: 0.05 },
  brusco: { contratar: 2 / 3, vacaciones: 1, eventuales: 1, turnos: 0.4, feriados: 0.1 },
}

const NOMBRES: Record<IdPlan, { nombre: string; descripcion: string }> = {
  suave: {
    nombre: 'Plan suave',
    descripcion: 'Sin contratar a nadie. Ordenar las vacaciones y armar mejor algunos turnos.',
  },
  medio: {
    nombre: 'Plan medio',
    descripcion: 'Lo del plan suave más fuerte, y tomar personal fijo donde conviene (1 de cada 3 puestos que hoy se cubren con horas extra).',
  },
  brusco: {
    nombre: 'Plan brusco',
    descripcion: 'Todas las medidas al máximo razonable: 2 de cada 3 puestos con personal fijo, turnos rearmados y feriados con dotación mínima.',
  },
}

/** Horas laborables por día corrido de ausencia (5 de cada 7 días, 8 h). */
const HORAS_POR_DIA = (5 / 7) * 8
/** Un área entra en la medida de contratar si sus horas extra habituales equivalen al menos a esto por mes. */
const HORAS_MINIMAS_CONTRATAR = 300

const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

function contratacionDe(a: InsumoPlanArea): ContratacionArea {
  const horasPersona = a.horasMes * a.productividad
  const reemplaza = horasPersona * a.horaExtraEmpresa
  const ahorro = reemplaza - a.costoPersonaMes
  return {
    cc: a.cc,
    nombre: a.nombre,
    costoPersonaMes: a.costoPersonaMes,
    horasExtraQueReemplaza: reemplaza,
    ahorroPorPersonaMes: ahorro,
    margenOtrosCostosMes: Math.max(0, ahorro),
    puestosEquivalentes: horasPersona > 0 ? a.horasHabituales / horasPersona : 0,
    conviene: ahorro > 0 && a.costoPersonaMes > 0,
  }
}

function personas(n: number): string {
  return `${n} ${n === 1 ? 'persona' : 'personas'}`
}

function construirPlan(id: IdPlan, ins: InsumosPlanes, contratacion: ContratacionArea[]): Plan {
  const nivel = NIVELES[id]
  const medidas: MedidaPlan[] = []
  let personasTotal = 0
  let costoContrataciones = 0
  let horasMenos = 0
  const horasHabitualesRestantes = new Map<number, number>()

  // 1. Personal fijo donde las horas extra se repiten todos los meses y contratar cuesta menos.
  const contratar: AreaMedida[] = []
  for (const a of ins.areas) {
    const c = contratacion.find((x) => x.cc === a.cc)
    horasHabitualesRestantes.set(a.cc, a.horasHabituales)
    if (!c || !c.conviene || a.horasHabituales < HORAS_MINIMAS_CONTRATAR || nivel.contratar <= 0) continue
    const n = Math.floor(c.puestosEquivalentes * nivel.contratar)
    if (n <= 0) continue
    const horas = n * a.horasMes * a.productividad
    horasHabitualesRestantes.set(a.cc, Math.max(0, a.horasHabituales - horas))
    personasTotal += n
    costoContrataciones += n * a.costoPersonaMes
    horasMenos += horas
    contratar.push({
      cc: a.cc,
      nombre: a.nombre,
      personas: n,
      ahorroAnual: n * c.ahorroPorPersonaMes * 12,
      detalle: `${personas(n)}: cuestan $ ${nf1.format((n * a.costoPersonaMes) / 1e6)} M por mes y reemplazan horas extra que hoy cuestan $ ${nf1.format((n * c.horasExtraQueReemplaza) / 1e6)} M.`,
    })
  }
  if (contratar.length) {
    medidas.push({
      id: 'contratar',
      titulo: 'Tomar personal fijo',
      explicacion: 'Donde las horas extra se repiten todos los meses porque falta gente, una persona más cuesta menos que pagar esas horas como extra.',
      ahorroAnual: contratar.reduce((s, x) => s + x.ahorroAnual, 0),
      areas: contratar,
    })
  }

  // 2. Vacaciones: pasar días de los meses que el área no puede cubrir a los meses con margen.
  const vacaciones: AreaMedida[] = []
  const eventuales: AreaMedida[] = []
  let horasEventualesDisponibles = ins.eventuales.horasLibresMes * 7
  for (const a of ins.areas) {
    if (a.tipo !== 'ausencias' || a.horasExtraPorHoraAusencia <= 0 || a.temporada.length === 0) continue
    const exceso = a.temporada.reduce((s, m) => s + Math.max(0, m.vacaciones - m.cupo), 0)
    const libre = a.temporada.reduce((s, m) => s + Math.max(0, m.cupo - m.vacaciones), 0)
    const movibles = Math.min(exceso, libre) * nivel.vacaciones
    if (movibles >= 1) {
      const horas = movibles * HORAS_POR_DIA * a.horasExtraPorHoraAusencia
      horasMenos += horas / 12
      vacaciones.push({
        cc: a.cc,
        nombre: a.nombre,
        ahorroAnual: horas * a.horaExtraEmpresa,
        detalle: `Pasar ${nf.format(movibles)} días de vacaciones de los meses sin margen a los meses tranquilos de la temporada.`,
      })
    }
    // 3. Lo que no se puede mover, cubrirlo con eventuales si su hora cuesta menos.
    const sinCubrir = (exceso - Math.min(exceso, libre) * nivel.vacaciones) * HORAS_POR_DIA * a.horasExtraPorHoraAusencia
    const diferencia = a.horaExtraEmpresa - ins.eventuales.costoHora
    if (nivel.eventuales > 0 && sinCubrir > 0 && diferencia > 0 && ins.eventuales.costoHora > 0 && a.convenio === 'suvico') {
      const horas = Math.min(sinCubrir, horasEventualesDisponibles) * nivel.eventuales
      horasEventualesDisponibles -= horas
      if (horas >= 1) {
        horasMenos += horas / 12
        eventuales.push({
          cc: a.cc,
          nombre: a.nombre,
          ahorroAnual: horas * diferencia,
          detalle: `Cubrir ${nf.format(horas)} horas de vacaciones con eventuales: su hora cuesta $ ${nf.format(ins.eventuales.costoHora)} contra $ ${nf.format(a.horaExtraEmpresa)} de una hora extra.`,
        })
      }
    }
  }
  if (vacaciones.length) {
    medidas.push({
      id: 'vacaciones',
      titulo: 'Ordenar las vacaciones',
      explicacion: 'Darlas en los meses en que el área puede cubrirlas con su propia gente, y no en los meses en que hay que pagar horas extra para cubrirlas.',
      ahorroAnual: vacaciones.reduce((s, x) => s + x.ahorroAnual, 0),
      areas: vacaciones,
      requiere: 'Avisar con 30 días de anticipación (Ley 27.802).',
    })
  }
  if (eventuales.length) {
    medidas.push({
      id: 'eventuales',
      titulo: 'Cubrir vacaciones con eventuales',
      explicacion: 'Lo que no se pueda mover, cubrirlo con personal eventual en lugar de horas extra.',
      ahorroAnual: eventuales.reduce((s, x) => s + x.ahorroAnual, 0),
      areas: eventuales,
    })
  }

  // 4. Turnos: pasar horas pagadas al doble a horario con recargo del 50%.
  const turnos: AreaMedida[] = []
  for (const a of ins.areas) {
    if (a.proporcion100 <= 0.5 || a.horasExtraMes < HORAS_MINIMAS_CONTRATAR || a.valor100 <= a.valor50) continue
    const restantes = horasHabitualesRestantes.get(a.cc) ?? a.horasHabituales
    const horas = restantes * a.proporcion100 * nivel.turnos
    if (horas < 1) continue
    const ahorroMes = horas * (a.valor100 - a.valor50) * ins.factores.total
    turnos.push({
      cc: a.cc,
      nombre: a.nombre,
      ahorroAnual: ahorroMes * 12,
      detalle: `${Math.round(nivel.turnos * 100)}% de las horas al doble (${nf.format(horas)} h por mes) pasan a pagarse al 50%.`,
    })
  }
  if (turnos.length) {
    medidas.push({
      id: 'turnos',
      titulo: 'Rearmar los turnos',
      explicacion: 'Muchas horas se pagan al doble porque caen de noche, el sábado a la tarde o el domingo. Con un turno tarde dentro del horario normal y rotando los sábados, parte pasa a pagarse al 50%.',
      ahorroAnual: turnos.reduce((s, x) => s + x.ahorroAnual, 0),
      areas: turnos,
      requiere: 'Revisar con cada jefe de área qué servicios lo permiten.',
    })
  }

  // 5. Feriados: dotación mínima en cada servicio.
  const feriados: AreaMedida[] = []
  if (nivel.feriados > 0) {
    for (const a of ins.areas) {
      if (a.horasFeriadoPorFeriado < 50) continue
      const horas = a.horasFeriadoPorFeriado * ins.feriadosAnio * nivel.feriados
      horasMenos += horas / 12
      feriados.push({
        cc: a.cc,
        nombre: a.nombre,
        ahorroAnual: horas * a.horaFeriadoEmpresa,
        detalle: `${Math.round(nivel.feriados * 100)}% menos horas en los ${ins.feriadosAnio} feriados del año.`,
      })
    }
  }
  if (feriados.length) {
    medidas.push({
      id: 'feriados',
      titulo: 'Feriados con dotación mínima',
      explicacion: 'En cada feriado, cubrir solo los puestos mínimos de cada cliente.',
      ahorroAnual: feriados.reduce((s, x) => s + x.ahorroAnual, 0),
      areas: feriados,
      requiere: 'Requiere acuerdo con cada cliente.',
    })
  }

  const ahorroAnual = medidas.reduce((s, m) => s + m.ahorroAnual, 0)
  const reducible = Math.max(1, ins.gastoMensual - ins.pactadasMensual)
  return {
    id,
    ...NOMBRES[id],
    ahorroAnual,
    ahorroMensual: ahorroAnual / 12,
    porcentaje: ahorroAnual / 12 / reducible,
    personasAContratar: personasTotal,
    costoContratacionesMes: costoContrataciones,
    horasMenosPorMes: horasMenos,
    medidas: medidas.sort((x, y) => y.ahorroAnual - x.ahorroAnual),
  }
}

export function construirPlanes(ins: InsumosPlanes): PlanesReduccion {
  const contratacion = ins.areas
    .filter((a) => a.horasHabituales >= HORAS_MINIMAS_CONTRATAR && a.costoPersonaMes > 0)
    .map(contratacionDe)
  const f = ins.factores
  const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')}%`
  return {
    gastoMensual: ins.gastoMensual,
    pactadasMensual: ins.pactadasMensual,
    gastoMensualReducible: ins.gastoMensual - ins.pactadasMensual,
    planes: (['suave', 'medio', 'brusco'] as IdPlan[]).map((id) => construirPlan(id, ins, contratacion)),
    contratacion,
    factores: f,
    supuestos: [
      `Cada $ 100 de horas extra le cuestan a la empresa $ ${(f.total * 100).toFixed(0)}: contribuciones ${pct(f.contribuciones)}, provisiones de aguinaldo y despidos ${pct(f.provisiones)}, contribuciones del aguinaldo ${pct(f.cargasAguinaldo)} y mayor pago de vacaciones ${pct(f.vacaciones)} (art. 155 LCT, ${nf.format(f.diasVacacionesPromedio)} días promedio).${f.medido ? ` Tasas medidas en los recibos de ${f.mesBase.slice(4, 6)}/${f.mesBase.slice(0, 4)}.` : ' No se pudieron medir en este backup: se usan las de sep-26.'}`,
      'El costo de una persona más es el costo laboral completo de Salario (remunerativo, no remunerativo, contribuciones y provisiones), promedio de las personas del área sin sus horas extra. Incluye antigüedad, así que para una persona nueva es algo menor.',
      'Una persona nueva no trabaja todo el mes: se descuentan las vacaciones y licencias promedio del área.',
      'No incluye gastos que no pasan por Salario (uniforme, capacitación, selección, exámenes, equipamiento). En cada área se indica hasta cuánto pueden sumar por persona para que contratar siga conviniendo.',
      'No incluye las horas pactadas (acuerdos individuales), que no se pueden reducir.',
      'Los importes están a valores del último mes liquidado. Si hay aumentos de sueldo, el ahorro sube en la misma proporción.',
    ],
  }
}
