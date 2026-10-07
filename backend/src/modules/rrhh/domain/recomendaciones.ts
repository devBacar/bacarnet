import { CONVENIOS, LIMITE_HE_ANUAL, NORMAS } from './convenios.js'
import type { AreaInforme, InformeAgregado, MesArea } from './informeMensual.js'
import { sumarMeses } from './resumenMensual.js'

export type Severidad = 'urgente' | 'alta' | 'media' | 'oportunidad'
export type Categoria = 'Dotación' | 'Horarios' | 'Límite legal' | 'Vacaciones' | 'Feriados' | 'Compensación'

export interface Recomendacion {
  id: string
  cc: number
  area: string
  /** AAAAMM al que aplica. */
  mes: string
  categoria: Categoria
  severidad: Severidad
  /** Frase principal, en negrita en la pantalla. */
  titulo: string
  detalle: string
  impacto?: { monto: number; etiqueta: string }
  regla: string
}

export interface Foco {
  severidad: Severidad
  etiqueta: string
  cc: number
  area: string
  /** Número principal, ya formateado ("43 h extra por persona/mes"). */
  cifra: string
  texto: string
  /** Para ordenar: costo mensual o impacto estimado. */
  peso: number
}

const ORDEN_SEVERIDAD: Record<Severidad, number> = { urgente: 0, alta: 1, media: 2, oportunidad: 3 }
const HORAS_POR_DIA = (5 / 7) * 8
const NOMBRES_MES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
/** Días de vacaciones sin cubrir a partir de los cuales se recomienda relevo o se marca como foco. */
const DIAS_FALTANTES_RELEVANTES = 100
/** Por encima de esto, el faltante de cobertura es un foco urgente. */
const DIAS_FALTANTES_URGENTES = 500
/** Área con al menos esta dotación recibe recomendaciones de vacaciones mes por mes. */
const DOTACION_DETALLE_MENSUAL = 100

const nf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

export function nombreMes(mes: string): string {
  return NOMBRES_MES[Number(mes.slice(4, 6)) - 1] ?? mes
}

function capital(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function pesos(v: number): string {
  const a = Math.abs(v)
  if (a >= 1e9) return `$ ${nf.format(v / 1e6)} M`
  if (a >= 1e6) return `$ ${nf1.format(v / 1e6)} M`
  return `$ ${nf.format(v)}`
}

function personas(n: number): string {
  return `${n} ${n === 1 ? 'persona' : 'personas'}`
}

/** Meses que quedan de la temporada de vacaciones (hasta abril inclusive) contando desde `actual`. */
export function mesesRestantesTemporada(actual: string): number {
  const mes = Number(actual.slice(4, 6))
  const anio = Number(actual.slice(0, 4))
  const fin = mes >= 10 ? `${anio + 1}04` : `${anio}04`
  if (mes > 4 && mes < 10) return 0
  let n = 0
  for (let m = actual; m <= fin; m = sumarMeses(m, 1)) n += 1
  return n
}

function filasProyectadas(a: AreaInforme): MesArea[] {
  return a.meses.filter((m) => m.tipo !== 'real')
}

function dotacionActual(a: AreaInforme): number {
  return [...a.meses].reverse().find((m) => m.tipo === 'real')?.dotacion ?? 0
}

/** Recomendaciones concretas por área y mes, con impacto estimado y la regla que aplica. */
export function generarRecomendaciones(inf: Omit<InformeAgregado, 'reporte'>): Recomendacion[] {
  const out: Recomendacion[] = []
  const add = (r: Omit<Recomendacion, 'id'>) => out.push({ ...r, id: `${r.cc}-${r.mes}-${r.categoria}-${out.length}` })
  const temporada = mesesRestantesTemporada(inf.actual)
  const conCargas = (monto: number) => monto * inf.factores.total
  const planMedio = inf.planes.planes.find((p) => p.id === 'medio')

  for (const a of inf.areas) {
    const md = a.modelo
    const reglas = CONVENIOS[a.convenio]
    const hcost = conCargas(md.costoHoraExtra)
    const dot = dotacionActual(a)
    const proyectadas = filasProyectadas(a)
    const base = { cc: a.cc, area: a.nombre }

    // Vacaciones en áreas donde las horas extra acompañan a las ausencias.
    if (md.tipo === 'ausencias' && md.umbralHoras > 0) {
      // Lugar que queda en el mes si salen de vacaciones como el año pasado (o lo cargado, si es más).
      const libresEsperados = (f: MesArea) => (f.cupoVacaciones ?? 0) - f.vacaciones
      const oportunidades = proyectadas.filter((f) => libresEsperados(f) > 14)
      if (dot >= DOTACION_DETALLE_MENSUAL) {
        for (const f of oportunidades) {
          const libres = libresEsperados(f)
          const pers = Math.floor(libres / 14)
          const aviso =
            f.tipo === 'actual'
              ? ' Para este mes hace falta acuerdo con el trabajador porque el aviso legal es de 30 días.'
              : f.mes === inf.prevision[0]
                ? ' Notificando esta semana se llega con el aviso de 30 días.'
                : ''
          add({
            ...base,
            mes: f.mes,
            categoria: 'Vacaciones',
            severidad: 'oportunidad',
            titulo: `${capital(nombreMes(f.mes))}: en ${a.nombre} todavía entran unos ${nf.format(libres)} días más de vacaciones (${pers === 1 ? '' : 'unas '}${personas(pers)} de 14 días) sin que suban las horas extra.`,
            detalle: `Se calcula con lo que salió el año pasado en ese mes (${nf.format(f.vacaciones)} días) y lo ya cargado en Salario (${nf.format(f.vacacionesProgramadas ?? 0)} días). Conviene usar ese lugar para adelantar vacaciones de los meses que no alcanzan.${aviso}`,
            regla: NORMAS.vacacionesAviso,
          })
        }
      } else if (oportunidades.length > 0) {
        const libres = libresEsperados(oportunidades[0])
        add({
          ...base,
          mes: oportunidades[0].mes,
          categoria: 'Vacaciones',
          severidad: 'oportunidad',
          titulo: `En ${a.nombre} se pueden dar hasta ${nf.format(libres)} días de vacaciones por mes (${Math.floor(libres / 14) === 1 ? '' : 'unas '}${personas(Math.floor(libres / 14))} de 14 días) sin que suban las horas extra`,
          detalle: `en ${oportunidades.map((f) => nombreMes(f.mes)).join(', ')}. Hoy hay ${nf.format(oportunidades.reduce((s, f) => s + (f.vacacionesProgramadas ?? 0), 0))} días cargados en esos meses.`,
          regla: NORMAS.vacacionesAviso,
        })
      }

      for (const f of proyectadas.filter((x) => x.tipo === 'prevision')) {
        const cupo = f.cupoVacaciones ?? 0
        if (f.vacaciones <= cupo * 1.15) continue
        const exceso = f.vacaciones - cupo
        const horas = exceso * HORAS_POR_DIA * md.horasExtraPorHoraAusencia
        const mover = Math.ceil(exceso / 14)
        add({
          ...base,
          mes: f.mes,
          categoria: 'Vacaciones',
          severidad: 'alta',
          titulo: `${capital(nombreMes(f.mes))}: si en ${a.nombre} salen de vacaciones como el año pasado (${nf.format(f.vacaciones)} días), faltaría personal para cubrir ${nf.format(exceso)} días.`,
          detalle: `Eso se pagaría como unas ${nf.format(horas)} horas extra. Conviene adelantar las vacaciones de ${personas(mover)} a meses más tranquilos.`,
          impacto: { monto: horas * hcost, etiqueta: 'costo en horas extra si no se mueven' },
          regla: reglas.vacaciones ?? NORMAS.vacacionesAviso,
        })
      }

      const actual = proyectadas.find((f) => f.tipo === 'actual')
      if (a.convenio === 'suvico' && a.vacaciones.libresDeVerano + a.vacaciones.debenVerano >= 20) {
        add({
          ...base,
          mes: inf.actual,
          categoria: 'Vacaciones',
          severidad: 'media',
          titulo: `${nf.format(a.vacaciones.libresDeVerano)} personas de ${a.nombre} ya tuvieron vacaciones el verano pasado.`,
          detalle: `Por convenio, este año no les toca verano: son las primeras a las que conviene darles vacaciones en primavera u otoño. Otras ${nf.format(a.vacaciones.debenVerano)} tienen que salir entre el 21/12 y el 20/3.`,
          regla: CONVENIOS.suvico.vacaciones ?? '',
        })
      }
      if (actual && temporada > 0) {
        const capacidad = (actual.cupoVacaciones ?? 0) * temporada
        const faltan = a.vacaciones.pendiente - capacidad
        const enPlan = planMedio?.medidas.find((m) => m.id === 'eventuales')?.areas.find((x) => x.cc === a.cc)
        if (faltan >= DIAS_FALTANTES_RELEVANTES && enPlan) {
          add({
            ...base,
            mes: inf.actual,
            categoria: 'Dotación',
            severidad: 'media',
            titulo: 'Cubrir con personal eventual las vacaciones que no se puedan mover.',
            detalle: `Esta temporada quedan ${nf.format(faltan)} días de vacaciones que el personal fijo no alcanza a cubrir. La hora de un eventual cuesta ${pesos(inf.eventuales.costoHora)} y una hora extra ${pesos(hcost)}, las dos con todo el costo laboral: la diferencia es chica, así que conviene primero mover vacaciones a los meses tranquilos. ${enPlan.detalle}`,
            impacto: { monto: enPlan.ahorroAnual, etiqueta: 'ahorro en la temporada (plan medio)' },
            regla: CONVENIOS.suvico.jornada,
          })
        }
      }
    }

    // Áreas donde cualquier ausencia genera horas extra (sin margen).
    if (md.tipo === 'ausencias' && md.umbralHoras === 0) {
      const actual = proyectadas.find((f) => f.tipo === 'actual')
      const porDia = HORAS_POR_DIA * md.horasExtraPorHoraAusencia
      const prog = actual?.vacacionesProgramadas ?? 0
      add({
        ...base,
        mes: inf.actual,
        categoria: 'Vacaciones',
        severidad: 'media',
        titulo: `En ${a.nombre} cada día de vacaciones genera unas ${nf1.format(porDia)} horas extra, porque no hay personal de reemplazo.`,
        detalle: `${capital(nombreMes(inf.actual))} tiene ${nf.format(prog)} días cargados (unas ${nf.format(prog * porDia)} horas extra). Conviene que no salgan más de ${personas(Math.max(1, Math.round(dot * 0.05)))} a la vez, o sumar un reemplazo fijo.`,
        impacto: { monto: prog * porDia * hcost, etiqueta: 'costo en horas extra del mes' },
        regla: reglas.vacaciones ?? NORMAS.vacacionesAviso,
      })
    }

    // Feriados en servicio continuo.
    if (md.horasFeriadoPorFeriado > 50) {
      for (const f of proyectadas.filter((x) => x.feriados > 0)) {
        add({
          ...base,
          mes: f.mes,
          categoria: 'Feriados',
          severidad: f.feriados >= 3 ? 'alta' : 'media',
          titulo: `${capital(nombreMes(f.mes))} tiene ${f.feriados} ${f.feriados === 1 ? 'feriado' : 'feriados'}${f.feriadosDetalle.length ? ` (${f.feriadosDetalle.join(', ')})` : ''}: se estiman unas ${nf.format(f.fer)} horas trabajadas en feriado en ${a.nombre}.`,
          detalle: 'Se pagan al doble. Cubrir solo los puestos mínimos de cada objetivo y verificar que el recargo se le facture al cliente.',
          impacto: { monto: conCargas(f.fer * md.costoHoraFeriado), etiqueta: 'costo del feriado' },
          regla: NORMAS.feriadoDoble,
        })
      }
    }

    // Horas extra estructurales: falta personal fijo u horarios fuera de la jornada (cálculos del plan medio).
    const contratacion = inf.planes.contratacion.find((c) => c.cc === a.cc)
    if (contratacion) {
      const enPlan = planMedio?.medidas.find((m) => m.id === 'contratar')?.areas.find((x) => x.cc === a.cc)
      if (contratacion.conviene && enPlan?.personas) {
        add({
          ...base,
          mes: inf.actual,
          categoria: 'Dotación',
          severidad: 'urgente',
          titulo: `${a.nombre}: las horas extra que se repiten todos los meses equivalen al trabajo de ${nf1.format(contratacion.puestosEquivalentes)} personas.`,
          detalle: `Tomar ${personas(enPlan.personas)} cuesta ${pesos(enPlan.personas * contratacion.costoPersonaMes)} por mes con todo el costo laboral; esas horas pagadas como extra cuestan ${pesos(enPlan.personas * contratacion.horasExtraQueReemplaza)}. Conviene mientras los gastos que no pasan por Salario (uniforme, capacitación, equipo) no superen ${pesos(contratacion.margenOtrosCostosMes)} por persona y por mes.`,
          impacto: { monto: enPlan.ahorroAnual, etiqueta: 'ahorro anual' },
          regla: reglas.jornada,
        })
      } else if (!contratacion.conviene) {
        add({
          ...base,
          mes: inf.actual,
          categoria: 'Dotación',
          severidad: 'media',
          titulo: `${a.nombre}: tomar personal fijo no baja el costo.`,
          detalle: `Una persona más cuesta ${pesos(contratacion.costoPersonaMes)} por mes y las horas extra que reemplazaría cuestan ${pesos(contratacion.horasExtraQueReemplaza)}. Conviene trabajar sobre los turnos y respetar el máximo legal.`,
          regla: reglas.jornada,
        })
      }
      const turnos = planMedio?.medidas.find((m) => m.id === 'turnos')?.areas.find((x) => x.cc === a.cc)
      if (md.proporcion100 > 0.5 && turnos) {
        add({
          ...base,
          mes: inf.actual,
          categoria: 'Horarios',
          severidad: 'alta',
          titulo: `En ${a.nombre}, ${nf.format(md.proporcion100 * 100)}% de las horas extra se pagan al doble.`,
          detalle: `Son horas de noche o de fin de semana (por convenio: ${reglas.recargo100}). ${a.convenio === 'camioneros' ? 'Armar un turno tarde dentro del horario normal para los recorridos que terminan tarde, y rotar los sábados.' : 'Rotar esos turnos dentro del horario semanal normal.'} ${turnos.detalle}`,
          impacto: { monto: turnos.ahorroAnual, etiqueta: 'ahorro anual (plan medio)' },
          regla: reglas.jornada,
        })
      }
    }

    // Límite legal.
    const { superaron, vanASuperar } = a.limite
    if (superaron + vanASuperar > 0) {
      add({
        ...base,
        mes: inf.actual,
        categoria: 'Límite legal',
        severidad: superaron > dot * 0.3 ? 'urgente' : 'alta',
        titulo: `${a.nombre}: ${superaron} ${superaron === 1 ? 'persona ya hizo' : 'personas ya hicieron'} más de las ${LIMITE_HE_ANUAL} horas extra por año que permite la ley${vanASuperar ? `, y ${vanASuperar} más van a pasarlas antes de diciembre` : ''}.`,
        detalle: 'No asignarles más horas extra este año y repartirlas entre compañeros que todavía tienen margen.',
        regla: NORMAS.limiteHorasExtra,
      })
    }

    // Banco de horas para las horas al 50%.
    if (md.base3 > 300 && 1 - md.proporcion100 > 0.4) {
      add({
        ...base,
        mes: inf.actual,
        categoria: 'Compensación',
        severidad: 'media',
        titulo: `${a.nombre}: ofrecer devolver parte de las horas extra comunes con días francos en lugar de pagarlas.`,
        detalle: 'Se usa en los meses más tranquilos, tiene que ser voluntario y por escrito. Baja lo que se paga sin dejar puestos sin cubrir.',
        regla: NORMAS.bancoDeHoras,
      })
    }
  }

  return out.sort(
    (x, y) =>
      ORDEN_SEVERIDAD[x.severidad] - ORDEN_SEVERIDAD[y.severidad] || (y.impacto?.monto ?? 0) - (x.impacto?.monto ?? 0),
  )
}

/** Los focos más graves de la empresa, para el encabezado del informe. */
export function generarFocos(inf: Omit<InformeAgregado, 'reporte'>, maximo = 4): Foco[] {
  const conCargas = (monto: number) => monto * inf.factores.total
  const focos: Foco[] = []
  const temporada = mesesRestantesTemporada(inf.actual)

  for (const a of inf.areas) {
    const dot = dotacionActual(a)
    if (dot <= 0) continue
    const md = a.modelo
    const porPersona = md.base3 / dot
    const costoMes = conCargas(md.base3 * md.costoHoraExtra)
    if (md.tipo === 'estructural' && (porPersona >= 30 || a.limite.superaron > dot * 0.3)) {
      focos.push({
        severidad: 'urgente',
        etiqueta: porPersona >= 80 ? 'Sobrecarga extrema' : 'Estructural + riesgo legal',
        cc: a.cc,
        area: a.nombre,
        cifra: `${nf.format(porPersona)} h extra por persona/mes`,
        texto: `${nf.format(md.proporcion100 * 100)}% se paga al 100% (${CONVENIOS[a.convenio].recargo100}). ${a.limite.superaron} de ${dot} personas ya pasaron las ${LIMITE_HE_ANUAL} h anuales. No depende de ausencias: equivale a ${nf1.format(md.base3 / a.horasMes)} puestos de jornada completa. Costo: ${pesos(costoMes)}/mes con cargas.`,
        peso: costoMes,
      })
    }
    const actual = a.meses.find((m) => m.tipo === 'actual')
    if (md.tipo === 'ausencias' && md.umbralHoras > 0 && actual && temporada > 0) {
      const capacidad = (actual.cupoVacaciones ?? 0) * temporada
      const faltan = a.vacaciones.pendiente - capacidad
      if (faltan >= DIAS_FALTANTES_RELEVANTES) {
        const eventuales =
          a.convenio === 'suvico' && inf.eventuales.personas > 0
            ? ` Hay ${inf.eventuales.personas} eventuales que en el último mes trabajaron ${nf.format(inf.eventuales.horas / inf.eventuales.personas)} h cada uno.`
            : ''
        focos.push({
          severidad: faltan >= DIAS_FALTANTES_URGENTES ? 'urgente' : 'alta',
          etiqueta: 'Cobertura de vacaciones',
          cc: a.cc,
          area: a.nombre,
          cifra: `${nf.format(faltan)} días sin cubrir`,
          texto: `Quedan ${nf.format(a.vacaciones.pendiente)} días de vacaciones ${a.vacaciones.anio} por otorgar y el área absorbe sin horas extra ~${nf.format(actual.cupoVacaciones ?? 0)} días por mes (${nf.format(capacidad)} en la temporada). Lo que falta se paga como hora extra.${eventuales}`,
          peso: faltan * HORAS_POR_DIA * md.horasExtraPorHoraAusencia * conCargas(md.costoHoraExtra),
        })
      }
    }
  }

  // El mes proyectado con más horas en feriado.
  const porMes = new Map<string, { horas: number; costo: number; area: AreaInforme; detalle: string[]; feriados: number }>()
  for (const a of inf.areas) {
    for (const f of filasProyectadas(a)) {
      if (f.fer <= 0) continue
      const previo = porMes.get(f.mes)
      const costo = conCargas(f.fer * a.modelo.costoHoraFeriado)
      if (!previo) {
        porMes.set(f.mes, { horas: f.fer, costo, area: a, detalle: f.feriadosDetalle, feriados: f.feriados })
      } else {
        previo.horas += f.fer
        previo.costo += costo
        if (f.fer > (previo.area.meses.find((x) => x.mes === f.mes)?.fer ?? 0)) previo.area = a
      }
    }
  }
  const peorMes = [...porMes.entries()].sort((x, y) => y[1].horas - x[1].horas)[0]
  if (peorMes && peorMes[1].horas >= 1000) {
    const [mes, d] = peorMes
    focos.push({
      severidad: d.feriados >= 3 ? 'alta' : 'media',
      etiqueta: `Feriados de ${nombreMes(mes)}`,
      cc: 0,
      area: 'Toda la empresa',
      cifra: `${nf.format(d.horas)} h en feriado`,
      texto: `${capital(nombreMes(mes))} tiene ${d.feriados} ${d.feriados === 1 ? 'feriado' : 'feriados'}${d.detalle.length ? ` (${d.detalle.join(', ')})` : ''}. Se pagan al doble. Costo estimado: ${pesos(d.costo)} con cargas.`,
      peso: d.costo,
    })
  }

  return focos
    .sort((x, y) => ORDEN_SEVERIDAD[x.severidad] - ORDEN_SEVERIDAD[y.severidad] || y.peso - x.peso)
    .slice(0, maximo)
}
