import type {
  CadenaRenovacion,
  ChequeClasificado,
  ChequeOcasionalDoc,
  CostoEslabon,
  OperacionUsdParseada,
} from './cheque-ocasional.types.js'

/**
 * Arma un mapa de número de cheque (completo y corto) → doc.
 */
function indexarPorNumero(docs: ChequeOcasionalDoc[]): Map<string, ChequeOcasionalDoc> {
  const m = new Map<string, ChequeOcasionalDoc>()
  for (const d of docs) {
    if (d.numeroCheque) {
      m.set(d.numeroCheque, d)
      const corto = d.numeroCheque.split('-').pop()
      if (corto && corto !== d.numeroCheque) m.set(corto, d)
    }
  }
  return m
}

/**
 * Encuentra la raíz de una cadena: el cheque más viejo que no es renovación de otro.
 */
function buscarRaiz(
  doc: ChequeOcasionalDoc,
  porNumero: Map<string, ChequeOcasionalDoc>,
  visitados: Set<string>,
): ChequeOcasionalDoc {
  if (doc.renovacionDe.length === 0) return doc
  visitados.add(doc.numeroCheque)
  for (const numViejo of doc.renovacionDe) {
    const viejo = porNumero.get(numViejo)
    if (viejo && !visitados.has(viejo.numeroCheque)) {
      return buscarRaiz(viejo, porNumero, visitados)
    }
  }
  return doc
}

/**
 * Desde una raíz, camina hacia adelante por renovadoPor armando la cadena ordenada.
 */
function caminarCadena(
  raiz: ChequeOcasionalDoc,
  porNumero: Map<string, ChequeOcasionalDoc>,
): ChequeOcasionalDoc[] {
  const cadena: ChequeOcasionalDoc[] = [raiz]
  const visitados = new Set<string>([raiz.numeroCheque])
  let actual = raiz

  while (actual.renovadoPor.length > 0) {
    const siguiente = actual.renovadoPor
      .map((n) => porNumero.get(n))
      .filter((d): d is ChequeOcasionalDoc => d != null && !visitados.has(d.numeroCheque))

    if (siguiente.length === 0) break
    // Si hay varios renovadoPor, tomar el de mayor monto (es la cadena principal)
    siguiente.sort((a, b) => b.montoCentavos - a.montoCentavos)
    const sig = siguiente[0]!
    visitados.add(sig.numeroCheque)
    cadena.push(sig)
    actual = sig
  }

  return cadena
}

/**
 * Reconstruye todas las cadenas de renovación a partir de los docs importados.
 * Cada cadena tiene su costo financiero calculado.
 */
export function reconstruirCadenas(docs: ChequeOcasionalDoc[]): CadenaRenovacion[] {
  const porNumero = indexarPorNumero(docs)
  const asignados = new Set<string>()
  const cadenas: CadenaRenovacion[] = []

  // Solo cheques que participan en alguna renovación
  const conRenovacion = docs.filter(
    (d) => d.renovacionDe.length > 0 || d.renovadoPor.length > 0,
  )

  for (const doc of conRenovacion) {
    if (asignados.has(doc.numeroCheque)) continue

    const raiz = buscarRaiz(doc, porNumero, new Set())
    if (asignados.has(raiz.numeroCheque)) continue

    const chequesDeCadena = caminarCadena(raiz, porNumero)
    if (chequesDeCadena.length < 2) continue

    for (const c of chequesDeCadena) asignados.add(c.numeroCheque)

    const eslabones: CostoEslabon[] = []
    for (let i = 0; i < chequesDeCadena.length - 1; i++) {
      const viejo = chequesDeCadena[i]!
      const nuevo = chequesDeCadena[i + 1]!
      eslabones.push({
        chequeViejo: viejo.numeroCheque,
        chequeNuevo: nuevo.numeroCheque,
        montoViejoCentavos: viejo.montoCentavos,
        montoNuevoCentavos: nuevo.montoCentavos,
        interesCentavos: nuevo.montoCentavos - viejo.montoCentavos,
      })
    }

    const capitalInicial = chequesDeCadena[0]!.montoCentavos
    const montoFinal = chequesDeCadena[chequesDeCadena.length - 1]!.montoCentavos
    const interesTotal = montoFinal - capitalInicial

    const operacionUsd: OperacionUsdParseada | null =
      chequesDeCadena.find((c) => c.operacionUsd !== null)?.operacionUsd ?? null

    cadenas.push({
      id: `cadena-${raiz.numeroCheque}`,
      beneficiario: raiz.beneficiario,
      beneficiarioNormalizado: raiz.beneficiarioNormalizado,
      cheques: chequesDeCadena.map((c) => c.numeroCheque),
      eslabones,
      capitalInicialCentavos: capitalInicial,
      montoFinalCentavos: montoFinal,
      interesTotalCentavos: interesTotal,
      tasaImplicita: capitalInicial > 0 ? interesTotal / capitalInicial : 0,
      operacionUsd,
    })
  }

  return cadenas
}

/**
 * Clasifica cada cheque como gasto real u operación financiera,
 * y le asigna su rol dentro de la cadena si corresponde.
 */
export function clasificarCheques(
  docs: ChequeOcasionalDoc[],
  cadenas: CadenaRenovacion[],
): ChequeClasificado[] {
  const enCadena = new Map<string, { cadenaId: string; posicion: number; total: number }>()
  for (const c of cadenas) {
    for (let i = 0; i < c.cheques.length; i++) {
      enCadena.set(c.cheques[i]!, { cadenaId: c.id, posicion: i, total: c.cheques.length })
    }
  }

  return docs.map((d) => {
    const info = enCadena.get(d.numeroCheque)

    if (info) {
      const esPrimero = info.posicion === 0
      const esUltimo = info.posicion === info.total - 1
      return {
        numeroCheque: d.numeroCheque,
        clasificacion: 'operacion_financiera' as const,
        rolEnCadena: esPrimero ? 'capital' as const : esUltimo ? 'interes' as const : 'mixto' as const,
        cadenaId: info.cadenaId,
      }
    }

    if (d.esProveedorFinanciero) {
      return {
        numeroCheque: d.numeroCheque,
        clasificacion: 'operacion_financiera' as const,
        rolEnCadena: null,
        cadenaId: null,
      }
    }

    return {
      numeroCheque: d.numeroCheque,
      clasificacion: 'gasto_real' as const,
      rolEnCadena: null,
      cadenaId: null,
    }
  })
}

export interface ResumenCostoFinanciero {
  cantidadCadenas: number
  capitalTotalCentavos: number
  interesTotalCentavos: number
  tasaImplicitaPromedio: number
  porBeneficiario: Array<{
    beneficiario: string
    cadenas: number
    capitalCentavos: number
    interesCentavos: number
    tasaImplicita: number
  }>
}

/**
 * Resume el costo financiero total agrupado por beneficiario.
 */
export function resumirCostoFinanciero(cadenas: CadenaRenovacion[]): ResumenCostoFinanciero {
  const porBenef = new Map<string, { beneficiario: string; cadenas: CadenaRenovacion[] }>()

  for (const c of cadenas) {
    const key = c.beneficiarioNormalizado
    const grupo = porBenef.get(key)
    if (grupo) {
      grupo.cadenas.push(c)
    } else {
      porBenef.set(key, { beneficiario: c.beneficiario, cadenas: [c] })
    }
  }

  let capitalTotal = 0
  let interesTotal = 0

  const porBeneficiario = [...porBenef.values()].map((g) => {
    const capital = g.cadenas.reduce((s, c) => s + c.capitalInicialCentavos, 0)
    const interes = g.cadenas.reduce((s, c) => s + c.interesTotalCentavos, 0)
    capitalTotal += capital
    interesTotal += interes
    return {
      beneficiario: g.beneficiario,
      cadenas: g.cadenas.length,
      capitalCentavos: capital,
      interesCentavos: interes,
      tasaImplicita: capital > 0 ? interes / capital : 0,
    }
  })

  porBeneficiario.sort((a, b) => b.interesCentavos - a.interesCentavos)

  return {
    cantidadCadenas: cadenas.length,
    capitalTotalCentavos: capitalTotal,
    interesTotalCentavos: interesTotal,
    tasaImplicitaPromedio: capitalTotal > 0 ? interesTotal / capitalTotal : 0,
    porBeneficiario,
  }
}
