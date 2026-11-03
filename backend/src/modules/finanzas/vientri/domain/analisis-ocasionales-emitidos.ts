import type { ChequeOcasionalDoc } from './cheque-ocasional.types.js'
import type { VientriChequeDoc } from './tipos.js'

export interface OcasionalSinEmitido {
  vientriId: number
  numeroCheque: string
  beneficiario: string
  montoCentavos: number
  fechaVencimiento: string | null
  estado: string
  esProveedorFinanciero: boolean
  obsOriginal: string
}

export interface EmitidoSinOcasional {
  clave: string
  numero: string
  montoCentavos: number
  fechaVencimiento: string | null
  estado: string
  destinatario: string | null
  fuentes: string[]
}

export interface AnalisisOcasionalesEmitidos {
  totalOcasionales: number
  totalEmitidos: number
  enAmbos: number
  soloEnOcasionales: number
  soloEnEmitidos: number
  ocasionalesSinEmitido: OcasionalSinEmitido[]
  emitidosSinOcasional: EmitidoSinOcasional[]
}

/**
 * Cruza ocasionales (CHQOCA) contra emitidos (vientriCheques con dirección emitido)
 * para detectar diferencias entre ambas fuentes.
 */
export function analizarOcasionalesVsEmitidos(
  ocasionales: ChequeOcasionalDoc[],
  vientriCheques: VientriChequeDoc[],
): AnalisisOcasionalesEmitidos {
  const emitidos = vientriCheques.filter((c) => c.direccion === 'emitido' && !c.baja)
  const ocasionalesActivos = ocasionales.filter((o) => !o.baja)

  // Índice de emitidos por número (puede haber variantes de formato)
  const emitidosPorNumero = new Map<string, VientriChequeDoc>()
  const emitidosPorSerie = new Map<string, VientriChequeDoc[]>()
  for (const e of emitidos) {
    if (e.numero) emitidosPorNumero.set(e.numero, e)
    const serie = e.serie || e.numero.split('-').pop() || ''
    if (serie) {
      const lista = emitidosPorSerie.get(serie) ?? []
      lista.push(e)
      emitidosPorSerie.set(serie, lista)
    }
  }

  // Índice de ocasionales por número
  const ocasionalesPorNumero = new Map<string, ChequeOcasionalDoc>()
  const ocasionalesPorSerie = new Map<string, ChequeOcasionalDoc[]>()
  for (const o of ocasionalesActivos) {
    if (o.numeroCheque) ocasionalesPorNumero.set(o.numeroCheque, o)
    const serie = o.numeroCheque.split('-').pop() || ''
    if (serie) {
      const lista = ocasionalesPorSerie.get(serie) ?? []
      lista.push(o)
      ocasionalesPorSerie.set(serie, lista)
    }
  }

  const ocasionalesMatcheados = new Set<number>()
  const emitidosMatcheados = new Set<string>()

  // Match por vientriChqocaId (link directo desde armarCheques)
  for (const e of emitidos) {
    if (e.vientriChqocaId !== null) {
      emitidosMatcheados.add(e.clave)
      const oca = ocasionalesActivos.find((o) => o.vientriId === e.vientriChqocaId)
      if (oca) ocasionalesMatcheados.add(oca.vientriId)
    }
  }

  // Match por número exacto
  for (const o of ocasionalesActivos) {
    if (ocasionalesMatcheados.has(o.vientriId)) continue
    if (!o.numeroCheque) continue
    const match = emitidosPorNumero.get(o.numeroCheque)
    if (match && !emitidosMatcheados.has(match.clave)) {
      ocasionalesMatcheados.add(o.vientriId)
      emitidosMatcheados.add(match.clave)
      continue
    }
    // Match por serie (últimos 8 dígitos) + monto
    const serie = o.numeroCheque.split('-').pop() || ''
    const candidatos = (emitidosPorSerie.get(serie) ?? []).filter(
      (e) => !emitidosMatcheados.has(e.clave) && e.montoCentavos === o.montoCentavos,
    )
    if (candidatos.length === 1) {
      ocasionalesMatcheados.add(o.vientriId)
      emitidosMatcheados.add(candidatos[0].clave)
    }
  }

  const ocasionalesSinEmitido: OcasionalSinEmitido[] = ocasionalesActivos
    .filter((o) => !ocasionalesMatcheados.has(o.vientriId))
    .map((o) => ({
      vientriId: o.vientriId,
      numeroCheque: o.numeroCheque,
      beneficiario: o.beneficiario,
      montoCentavos: o.montoCentavos,
      fechaVencimiento: o.fechaVencimiento,
      estado: o.estado,
      esProveedorFinanciero: o.esProveedorFinanciero,
      obsOriginal: o.obsOriginal,
    }))

  const emitidosSinOcasional: EmitidoSinOcasional[] = emitidos
    .filter((e) => !emitidosMatcheados.has(e.clave))
    .map((e) => ({
      clave: e.clave,
      numero: e.numero,
      montoCentavos: e.montoCentavos,
      fechaVencimiento: e.fechaVencimiento,
      estado: e.estado,
      destinatario: e.destinatario,
      fuentes: [...e.fuentes],
    }))

  return {
    totalOcasionales: ocasionalesActivos.length,
    totalEmitidos: emitidos.length,
    enAmbos: ocasionalesMatcheados.size,
    soloEnOcasionales: ocasionalesSinEmitido.length,
    soloEnEmitidos: emitidosSinOcasional.length,
    ocasionalesSinEmitido,
    emitidosSinOcasional,
  }
}
