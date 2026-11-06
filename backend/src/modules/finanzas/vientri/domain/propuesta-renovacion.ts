import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import { beneficiariosCompatibles } from './operacion-renovacion.js'
import { resolverProveedor, type ProveedorDelCatalogo } from './operaciones-usd.js'
import { chequesDeLaMismaOperacion, numerosDeChequeEnObs } from './patrones-ocasionales.js'

/**
 * Para armar a mano una renovación desde "A revisar": los cheques nuevos son los del grupo (mismo beneficiario,
 * misma emisión y mismo OBS) y los viejos son los números que nombra el OBS, buscados en la base. Los avisos
 * son para que Finanzas controle antes de guardar; ninguno impide guardar.
 */

/** Días de diferencia entre el vencimiento del viejo y la emisión de los nuevos que se aceptan sin avisar. */
export const TOLERANCIA_DIAS_VENCIMIENTO = 15

export interface ChequeNuevoPropuesto {
  numeroCheque: string
  montoCentavos: number
  fechaEmision: string | null
  fechaVencimiento: string | null
  /** Cheques que ya tiene marcados como renovados (si ya se clasificó antes). */
  renovacionDe: string[]
}

export interface ChequeViejoPropuesto {
  /** Número como se lee del OBS, ya completado ("300" → "39585300"). */
  numeroObs: string
  encontrado: {
    numeroCheque: string
    beneficiario: string
    montoCentavos: number
    fechaVencimiento: string | null
    estado: string
  } | null
  avisos: string[]
}

export interface PropuestaRenovacion {
  nuevos: ChequeNuevoPropuesto[]
  viejos: ChequeViejoPropuesto[]
}

/** El número corto (el último tramo de "020-923-5000-39585299"). */
export function numeroCorto(numeroCheque: string): string {
  return numeroCheque.split('-').pop() ?? numeroCheque
}

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
}

function fechaCorta(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

/** Mismo proveedor del catálogo (los alias cuentan como el mismo); si ninguno está cargado, nombres compatibles. */
export function mismoBeneficiario(
  a: Pick<ChequeOcasionalDoc, 'beneficiario' | 'beneficiarioNormalizado'>,
  b: Pick<ChequeOcasionalDoc, 'beneficiario' | 'beneficiarioNormalizado'>,
  catalogo: ReadonlyMap<string, ProveedorDelCatalogo>,
): boolean {
  const pa = resolverProveedor(a.beneficiario, a.beneficiarioNormalizado, catalogo)
  const pb = resolverProveedor(b.beneficiario, b.beneficiarioNormalizado, catalogo)
  if (pa.proveedorId !== null || pb.proveedorId !== null) return pa.proveedorId === pb.proveedorId
  return beneficiariosCompatibles(a.beneficiarioNormalizado, b.beneficiarioNormalizado)
}

export function armarPropuestaRenovacion(
  elegido: ChequeOcasionalDoc,
  todos: ChequeOcasionalDoc[],
  catalogo: ReadonlyMap<string, ProveedorDelCatalogo> = new Map(),
): PropuestaRenovacion {
  const grupo = chequesDeLaMismaOperacion(elegido, todos)
    .slice()
    .sort((a, b) => numeroCorto(a.numeroCheque).localeCompare(numeroCorto(b.numeroCheque)))
  const numerosDelGrupo = new Set(grupo.map((d) => numeroCorto(d.numeroCheque)))

  const porNumero = new Map<string, ChequeOcasionalDoc>()
  for (const d of todos) {
    if (d.baja || !d.numeroCheque) continue
    porNumero.set(numeroCorto(d.numeroCheque), d)
  }

  const emisionNuevos = elegido.fechaEmision
  const viejos = numerosDeChequeEnObs(elegido.obsOriginal)
    .filter((n) => !numerosDelGrupo.has(n))
    .map((numeroObs): ChequeViejoPropuesto => {
      const v = porNumero.get(numeroObs)
      if (!v) return { numeroObs, encontrado: null, avisos: ['No está entre los cheques ocasionales cargados'] }

      const avisos: string[] = []
      if (!mismoBeneficiario(v, elegido, catalogo)) avisos.push(`Es de otro beneficiario (${v.beneficiario || 'sin nombre'})`)
      const renovadoPorOtros = (v.renovadoPor ?? []).filter((n) => !numerosDelGrupo.has(numeroCorto(n)))
      if (renovadoPorOtros.length > 0) avisos.push(`Ya figura renovado por ${renovadoPorOtros.join(', ')}`)
      if (v.fechaVencimiento && emisionNuevos) {
        const dias = diasEntre(v.fechaVencimiento, emisionNuevos)
        if (Math.abs(dias) > TOLERANCIA_DIAS_VENCIMIENTO) {
          avisos.push(`Vencía el ${fechaCorta(v.fechaVencimiento)}, ${Math.abs(dias)} días ${dias > 0 ? 'antes' : 'después'} de la emisión de los nuevos`)
        }
      }
      return {
        numeroObs,
        encontrado: {
          numeroCheque: v.numeroCheque,
          beneficiario: v.beneficiario,
          montoCentavos: v.montoCentavos,
          fechaVencimiento: v.fechaVencimiento,
          estado: v.estado,
        },
        avisos,
      }
    })

  return {
    nuevos: grupo.map((d) => ({
      numeroCheque: d.numeroCheque,
      montoCentavos: d.montoCentavos,
      fechaEmision: d.fechaEmision,
      fechaVencimiento: d.fechaVencimiento,
      renovacionDe: d.renovacionDe ?? [],
    })),
    viejos,
  }
}

/**
 * Cheques del grupo a los que se aplica la clasificación cuando Finanzas eligió cuáles (por número).
 * El cheque elegido va siempre; los números que no son del grupo se ignoran.
 */
export function chequesElegidosDelGrupo<T extends ChequeOcasionalDoc>(elegido: T, grupo: T[], numeros: string[]): T[] {
  const pedidos = new Set(numeros.map((n) => numeroCorto(String(n).trim())))
  return grupo.filter((d) => d === elegido || pedidos.has(numeroCorto(d.numeroCheque)))
}
