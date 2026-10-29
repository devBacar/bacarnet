import type { ChequeOcasionalDoc, RolEnOperacion, OperacionUsdParseada, TasaExplicitaParseada } from './cheque-ocasional.types.js'

export interface OperacionOcasional {
  id: string
  fechaEmision: string
  beneficiario: string
  beneficiarioNormalizado: string
  obsComun: string
  cheques: ChequeOcasionalDoc[]
  chequesCapital: ChequeOcasionalDoc[]
  chequesInteres: ChequeOcasionalDoc[]
  chequesMixto: ChequeOcasionalDoc[]
  chequesSinRol: ChequeOcasionalDoc[]
  totalBrutoCentavos: number
  totalCapitalCentavos: number
  totalInteresCentavos: number
  cantidadCheques: number
  operacionUsd: OperacionUsdParseada | null
  tasaExplicita: TasaExplicitaParseada | null
  rolDominante: RolEnOperacion
}

function claveOperacion(doc: ChequeOcasionalDoc): string | null {
  if (!doc.fechaEmision || !doc.beneficiarioNormalizado) return null
  return `${doc.fechaEmision}|${doc.beneficiarioNormalizado}|${doc.obsOriginal}`
}

export function agruparOperaciones(docs: ChequeOcasionalDoc[]): OperacionOcasional[] {
  const grupos = new Map<string, ChequeOcasionalDoc[]>()

  for (const d of docs) {
    if (d.baja) continue
    const clave = claveOperacion(d)
    if (!clave) continue
    const lista = grupos.get(clave) ?? []
    lista.push(d)
    grupos.set(clave, lista)
  }

  const operaciones: OperacionOcasional[] = []

  for (const [, cheques] of grupos) {
    if (cheques.length < 2) continue

    const primero = cheques[0]
    const capital = cheques.filter((c) => c.rolEnOperacion === 'capital')
    const interes = cheques.filter((c) => c.rolEnOperacion === 'interes')
    const mixto = cheques.filter((c) => c.rolEnOperacion === 'mixto')
    const sinRol = cheques.filter((c) => c.rolEnOperacion === null)

    const totalBruto = cheques.reduce((s, c) => s + c.montoCentavos, 0)
    const totalCapital = capital.reduce((s, c) => s + c.montoCentavos, 0)
    const totalInteres = interes.reduce((s, c) => s + c.montoCentavos, 0)

    const usd = cheques.find((c) => c.operacionUsd !== null)?.operacionUsd ?? null
    const tasa = cheques.find((c) => c.tasaExplicita !== null)?.tasaExplicita ?? null

    let rolDominante: RolEnOperacion = null
    if (mixto.length > 0) rolDominante = 'mixto'
    else if (capital.length > 0 && interes.length > 0) rolDominante = 'mixto'
    else if (capital.length > 0) rolDominante = 'capital'
    else if (interes.length > 0) rolDominante = 'interes'

    operaciones.push({
      id: `op-${primero.fechaEmision}-${primero.beneficiarioNormalizado}`,
      fechaEmision: primero.fechaEmision!,
      beneficiario: primero.beneficiario,
      beneficiarioNormalizado: primero.beneficiarioNormalizado,
      obsComun: primero.obsOriginal,
      cheques,
      chequesCapital: capital,
      chequesInteres: interes,
      chequesMixto: mixto,
      chequesSinRol: sinRol,
      totalBrutoCentavos: totalBruto,
      totalCapitalCentavos: totalCapital,
      totalInteresCentavos: totalInteres,
      cantidadCheques: cheques.length,
      operacionUsd: usd,
      tasaExplicita: tasa,
      rolDominante,
    })
  }

  operaciones.sort((a, b) => b.fechaEmision.localeCompare(a.fechaEmision))
  return operaciones
}
