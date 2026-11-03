import type { ChequeOcasionalDoc, OperacionRenovacion } from './cheque-ocasional.types.js'
import { beneficiariosCompatibles } from './operacion-renovacion.js'

export interface ChequeInteresVinculable {
  numeroCheque: string
  beneficiario: string
  beneficiarioNormalizado: string
  montoCentavos: number
  fechaEmision: string | null
  fechaVencimiento: string | null
  obsOriginal: string
  match: MatchRenovacion | null
  razonNoMatch: string | null
}

export interface MatchRenovacion {
  operacionId: string
  beneficiarioRenovacion: string
  fechaEmisionRenovacion: string | null
  totalCapitalCentavos: number
  interesPorDiferencia: number
  criterio: 'beneficiario+fecha' | 'beneficiario+fecha_cercana' | 'beneficiario_solo'
  tasaImplicita: number | null
}

export interface AnalisisInteresRenovacion {
  totalChequesInteres: number
  vinculados: number
  noVinculados: number
  chequesInteres: ChequeInteresVinculable[]
  resumen: {
    porCriterio: Record<string, number>
    porBeneficiario: { beneficiario: string; cantidad: number; montoCentavos: number }[]
    montoTotalInteresCentavos: number
    montoVinculadoCentavos: number
  }
}

function diasEntre(a: string, b: string): number {
  const msA = new Date(a + 'T12:00:00Z').getTime()
  const msB = new Date(b + 'T12:00:00Z').getTime()
  return Math.round((msB - msA) / 86_400_000)
}

/**
 * Analiza cheques con rolEnOperacion 'interes' que NO son parte de una renovación
 * (esRenovacion=false) e intenta vincularlos con operaciones de renovación existentes.
 *
 * Criterios de vinculación (de más estricto a más laxo):
 * 1. Mismo beneficiario + misma fechaEmision
 * 2. Mismo beneficiario + fechaEmision ±5 días
 * 3. Mismo beneficiario (sin restricción de fecha)
 */
export function analizarInteresVsRenovaciones(
  docs: ChequeOcasionalDoc[],
  operaciones: OperacionRenovacion[],
): AnalisisInteresRenovacion {
  // Cheques de interés sueltos: rol 'interes' y NO son parte de una renovación
  const chequesInteres = docs.filter(
    (d) => !d.baja && d.rolEnOperacion === 'interes' && !d.esRenovacion,
  )

  // También incluir 'mixto' sin renovación (ej: "Capital + Intereses" sin mencionar renovación)
  const chequesMixtoSueltos = docs.filter(
    (d) => !d.baja && d.rolEnOperacion === 'mixto' && !d.esRenovacion,
  )

  const todosInteres = [...chequesInteres, ...chequesMixtoSueltos]

  const resultados: ChequeInteresVinculable[] = []
  const porCriterio: Record<string, number> = {}
  const porBenefMap = new Map<string, { cantidad: number; monto: number }>()
  let montoVinculado = 0

  for (const chq of todosInteres) {
    const benef = chq.beneficiarioNormalizado
    let acumBenef = porBenefMap.get(benef)
    if (!acumBenef) { acumBenef = { cantidad: 0, monto: 0 }; porBenefMap.set(benef, acumBenef) }
    acumBenef.cantidad++
    acumBenef.monto += chq.montoCentavos

    // Buscar operaciones de renovación del mismo beneficiario
    const opsCompatibles = operaciones.filter(
      (op) => beneficiariosCompatibles(benef, op.beneficiarioNormalizado),
    )

    if (opsCompatibles.length === 0) {
      resultados.push({
        numeroCheque: chq.numeroCheque,
        beneficiario: chq.beneficiario,
        beneficiarioNormalizado: benef,
        montoCentavos: chq.montoCentavos,
        fechaEmision: chq.fechaEmision,
        fechaVencimiento: chq.fechaVencimiento,
        obsOriginal: chq.obsOriginal,
        match: null,
        razonNoMatch: `sin renovaciones para beneficiario '${benef}'`,
      })
      continue
    }

    // Criterio 1: misma fechaEmision exacta
    let match: MatchRenovacion | null = null

    if (chq.fechaEmision) {
      const exactas = opsCompatibles.filter((op) => op.fechaEmision === chq.fechaEmision)
      if (exactas.length > 0) {
        const mejor = exactas.reduce((a, b) =>
          Math.abs(a.totalNuevosCentavos) > Math.abs(b.totalNuevosCentavos) ? a : b,
        )
        const tasa = mejor.totalViejosCentavos > 0
          ? chq.montoCentavos / mejor.totalViejosCentavos
          : null
        match = {
          operacionId: mejor.id,
          beneficiarioRenovacion: mejor.beneficiario,
          fechaEmisionRenovacion: mejor.fechaEmision,
          totalCapitalCentavos: mejor.totalViejosCentavos,
          interesPorDiferencia: mejor.interesCentavos,
          criterio: 'beneficiario+fecha',
          tasaImplicita: tasa,
        }
      }
    }

    // Criterio 2: fechaEmision ±5 días
    if (!match && chq.fechaEmision) {
      const cercanas = opsCompatibles.filter(
        (op) => op.fechaEmision && Math.abs(diasEntre(chq.fechaEmision!, op.fechaEmision!)) <= 5,
      )
      if (cercanas.length > 0) {
        const mejor = cercanas.reduce((a, b) => {
          const distA = Math.abs(diasEntre(chq.fechaEmision!, a.fechaEmision!))
          const distB = Math.abs(diasEntre(chq.fechaEmision!, b.fechaEmision!))
          return distA <= distB ? a : b
        })
        const tasa = mejor.totalViejosCentavos > 0
          ? chq.montoCentavos / mejor.totalViejosCentavos
          : null
        match = {
          operacionId: mejor.id,
          beneficiarioRenovacion: mejor.beneficiario,
          fechaEmisionRenovacion: mejor.fechaEmision,
          totalCapitalCentavos: mejor.totalViejosCentavos,
          interesPorDiferencia: mejor.interesCentavos,
          criterio: 'beneficiario+fecha_cercana',
          tasaImplicita: tasa,
        }
      }
    }

    // Criterio 3: solo beneficiario (reportar la más reciente)
    if (!match) {
      const ordenadas = [...opsCompatibles].sort(
        (a, b) => (b.fechaEmision ?? '').localeCompare(a.fechaEmision ?? ''),
      )
      const mejor = ordenadas[0]!
      const tasa = mejor.totalViejosCentavos > 0
        ? chq.montoCentavos / mejor.totalViejosCentavos
        : null
      match = {
        operacionId: mejor.id,
        beneficiarioRenovacion: mejor.beneficiario,
        fechaEmisionRenovacion: mejor.fechaEmision,
        totalCapitalCentavos: mejor.totalViejosCentavos,
        interesPorDiferencia: mejor.interesCentavos,
        criterio: 'beneficiario_solo',
        tasaImplicita: tasa,
      }
    }

    if (match) {
      porCriterio[match.criterio] = (porCriterio[match.criterio] ?? 0) + 1
      montoVinculado += chq.montoCentavos
    }

    resultados.push({
      numeroCheque: chq.numeroCheque,
      beneficiario: chq.beneficiario,
      beneficiarioNormalizado: benef,
      montoCentavos: chq.montoCentavos,
      fechaEmision: chq.fechaEmision,
      fechaVencimiento: chq.fechaVencimiento,
      obsOriginal: chq.obsOriginal,
      match,
      razonNoMatch: match ? null : 'sin renovaciones compatibles',
    })
  }

  const porBeneficiario = [...porBenefMap.entries()]
    .map(([beneficiario, { cantidad, monto }]) => ({
      beneficiario,
      cantidad,
      montoCentavos: monto,
    }))
    .sort((a, b) => b.montoCentavos - a.montoCentavos)

  const montoTotal = todosInteres.reduce((s, c) => s + c.montoCentavos, 0)

  return {
    totalChequesInteres: todosInteres.length,
    vinculados: resultados.filter((r) => r.match !== null).length,
    noVinculados: resultados.filter((r) => r.match === null).length,
    chequesInteres: resultados,
    resumen: {
      porCriterio,
      porBeneficiario,
      montoTotalInteresCentavos: montoTotal,
      montoVinculadoCentavos: montoVinculado,
    },
  }
}
