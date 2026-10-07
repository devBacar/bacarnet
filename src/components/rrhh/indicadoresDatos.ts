import type { ConvenioRrhh, FilaIndicadorRrhh, GrupoAusenciaRrhh, MotivoBajaRrhh, TipoLicenciaLargaRrhh } from '../../services/rrhhApi'
import { claveDe, type Agrupacion } from './evolucionDatos'

/** Suma los indicadores de personal por período (mes, trimestre, semestre, año) y convenio. */

export const GRUPOS: { id: GrupoAusenciaRrhh; nombre: string; color: string }[] = [
  { id: 'enfermedad', nombre: 'Enfermedad', color: '#2a78d6' },
  { id: 'accidentes', nombre: 'Accidentes (ART y empresa)', color: '#eb6834' },
  { id: 'injustificadas', nombre: 'Faltas sin aviso', color: '#c62828' },
  { id: 'suspensiones', nombre: 'Suspensiones', color: '#7c3aed' },
  { id: 'especiales', nombre: 'Licencias especiales', color: '#94a3b8' },
]

export const MOTIVOS: { id: MotivoBajaRrhh; nombre: string }[] = [
  { id: 'renuncia', nombre: 'Renuncia' },
  { id: 'despido', nombre: 'Despido' },
  { id: 'finContrato', nombre: 'Fin de contrato a plazo' },
  { id: 'acuerdo', nombre: 'Acuerdo entre las partes' },
  { id: 'otras', nombre: 'Otras (fallecimiento, abandono, otras)' },
]

export const LICENCIAS_LARGAS: { id: TipoLicenciaLargaRrhh; nombre: string }[] = [
  { id: 'reserva', nombre: 'Reserva de puesto ("en guarda")' },
  { id: 'art', nombre: 'Accidente de trabajo (ART)' },
  { id: 'enfermedad', nombre: 'Enfermedad de más de 30 días' },
  { id: 'maternidad', nombre: 'Maternidad' },
]

export interface TotalIndicadores {
  clave: string
  etiqueta: string
  etiquetaCorta: string
  /** Meses con datos y meses que tiene el período completo. */
  meses: number
  mesesTotales: number
  ultimoMes: string
  /** Personas liquidadas, promedio por mes. */
  personas: number
  diasLiquidados: number
  dias: Record<GrupoAusenciaRrhh, number>
  personasEnfermedad: number
  personasFaltas: number
  episodios: { corta: number; media: number; larga: number }
  /** Al cierre del último mes del período. */
  licenciasLargas: Record<TipoLicenciaLargaRrhh, number>
  altas: number
  bajas: number
  bajasTempranas: number
  bajasTempranasFinContrato: number
  bajasPorMotivo: Record<MotivoBajaRrhh, number>
  horasNormales: number
  horasExtra: number
  montoExtras: number
  rem: number
}

function vacio(clave: string, etiqueta: string, corta: string, total: number): TotalIndicadores {
  return {
    clave,
    etiqueta,
    etiquetaCorta: corta,
    meses: 0,
    mesesTotales: total,
    ultimoMes: '',
    personas: 0,
    diasLiquidados: 0,
    dias: { enfermedad: 0, accidentes: 0, injustificadas: 0, suspensiones: 0, especiales: 0 },
    personasEnfermedad: 0,
    personasFaltas: 0,
    episodios: { corta: 0, media: 0, larga: 0 },
    licenciasLargas: { reserva: 0, art: 0, enfermedad: 0, maternidad: 0 },
    altas: 0,
    bajas: 0,
    bajasTempranas: 0,
    bajasTempranasFinContrato: 0,
    bajasPorMotivo: { renuncia: 0, despido: 0, finContrato: 0, acuerdo: 0, otras: 0 },
    horasNormales: 0,
    horasExtra: 0,
    montoExtras: 0,
    rem: 0,
  }
}

/** Suma un conjunto de filas (de uno o varios meses y convenios). */
export function sumarIndicadores(filas: FilaIndicadorRrhh[], clave = '', etiqueta = '', corta = '', mesesTotales = 1): TotalIndicadores {
  const t = vacio(clave, etiqueta, corta, mesesTotales)
  const meses = [...new Set(filas.map((f) => f.mes))].sort()
  t.meses = meses.length
  t.ultimoMes = meses[meses.length - 1] ?? ''
  let personas = 0
  for (const f of filas) {
    personas += f.personas
    t.diasLiquidados += f.diasLiquidados
    for (const g of GRUPOS) t.dias[g.id] += f.dias[g.id]
    t.personasEnfermedad += f.personasEnfermedad
    t.personasFaltas += f.personasFaltas
    t.episodios.corta += f.episodios.corta
    t.episodios.media += f.episodios.media
    t.episodios.larga += f.episodios.larga
    if (f.mes === t.ultimoMes) for (const l of LICENCIAS_LARGAS) t.licenciasLargas[l.id] += f.licenciasLargas[l.id]
    t.altas += f.altas
    t.bajas += f.bajas
    t.bajasTempranas += f.bajasTempranas
    t.bajasTempranasFinContrato += f.bajasTempranasFinContrato ?? 0
    for (const m of MOTIVOS) t.bajasPorMotivo[m.id] += f.bajasPorMotivo[m.id]
    t.horasNormales += f.horasNormales
    t.horasExtra += f.horasExtra
    t.montoExtras += f.montoExtras
    t.rem += f.rem
  }
  t.personas = personas / Math.max(1, t.meses)
  return t
}

export function agruparIndicadores(filas: FilaIndicadorRrhh[], ag: Agrupacion): TotalIndicadores[] {
  const porPeriodo = new Map<string, { info: ReturnType<typeof claveDe>; filas: FilaIndicadorRrhh[] }>()
  for (const f of filas) {
    const info = claveDe(f.mes, ag)
    const p = porPeriodo.get(info.clave) ?? { info, filas: [] }
    p.filas.push(f)
    porPeriodo.set(info.clave, p)
  }
  return [...porPeriodo.values()]
    .sort((a, b) => a.info.clave.localeCompare(b.info.clave))
    .map(({ info, filas: fs }) => sumarIndicadores(fs, info.clave, info.etiqueta, info.corta, info.total))
}

export function filtrarConvenio(filas: FilaIndicadorRrhh[], convenio: ConvenioRrhh | 'todos'): FilaIndicadorRrhh[] {
  return convenio === 'todos' ? filas : filas.filter((f) => f.convenio === convenio)
}

export const diasAusencia = (t: TotalIndicadores) => GRUPOS.reduce((s, g) => s + t.dias[g.id], 0)
/** Días de ausencia sin vacaciones sobre días liquidados. */
export const tasaAusentismo = (t: TotalIndicadores) => (t.diasLiquidados > 0 ? diasAusencia(t) / t.diasLiquidados : 0)
export const tasaGrupo = (t: TotalIndicadores, g: GrupoAusenciaRrhh) => (t.diasLiquidados > 0 ? t.dias[g] / t.diasLiquidados : 0)
/** Bajas sobre personas (promedio por mes) en el período. */
export const tasaRotacion = (t: TotalIndicadores) => (t.personas > 0 ? t.bajas / t.personas : 0)
/** Sin los fines de contrato a plazo, que son bajas previstas. */
export const bajasNoPrevistas = (t: TotalIndicadores) => t.bajas - t.bajasPorMotivo.finContrato
export const totalLicenciasLargas = (t: TotalIndicadores) => LICENCIAS_LARGAS.reduce((s, l) => s + t.licenciasLargas[l.id], 0)
export const ratioHorasExtra = (t: TotalIndicadores) => (t.horasNormales > 0 ? t.horasExtra / t.horasNormales : 0)
export const pesoExtrasEnSueldos = (t: TotalIndicadores) => (t.rem > 0 ? t.montoExtras / t.rem : 0)

export function porcentaje(x: number, decimales = 1): string {
  return `${(x * 100).toFixed(decimales).replace('.', ',')}%`
}

/** Bajas tempranas sin contar los fines de contrato a plazo (eventuales de temporada). */
export const tempranasNoPrevistas = (t: TotalIndicadores) => t.bajasTempranas - t.bajasTempranasFinContrato
