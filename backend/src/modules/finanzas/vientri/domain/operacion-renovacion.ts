import type {
  AvisoTasaRenovacion,
  ChequeEnOperacion,
  ChequeOcasionalDoc,
  OperacionRenovacion,
} from './cheque-ocasional.types.js'

function diasEntre(a: string, b: string): number {
  const msA = new Date(a + 'T12:00:00Z').getTime()
  const msB = new Date(b + 'T12:00:00Z').getTime()
  return Math.round((msB - msA) / 86_400_000)
}

/** Más de esto por mes no es solo interés: casi seguro se sumó plata prestada (las tasas reales rondan 4–9 %). */
export const TASA_MENSUAL_MAXIMA_CREIBLE = 0.15

/**
 * Vencimiento promedio ponderado por monto (en días desde la época). Con cheques que vencen en varios meses, la
 * fecha "donde cae más plata" acorta o alarga el plazo y distorsiona la tasa por mes; el promedio no.
 */
function vtoPromedioDias(cheques: ChequeEnOperacion[]): number | null {
  let total = 0
  let ponderado = 0
  for (const c of cheques) {
    if (!c.fechaVencimiento) continue
    total += c.montoCentavos
    ponderado += (Date.parse(`${c.fechaVencimiento}T12:00:00Z`) / 86_400_000) * c.montoCentavos
  }
  return total > 0 ? ponderado / total : null
}

/** Días entre el vencimiento promedio de los viejos y el de los nuevos. */
export function plazoPonderadoDias(viejos: ChequeEnOperacion[], nuevos: ChequeEnOperacion[]): number | null {
  const v = vtoPromedioDias(viejos)
  const n = vtoPromedioDias(nuevos)
  return v !== null && n !== null ? Math.round(n - v) : null
}

/** Por qué la tasa de la operación no se puede tomar como interés, o null si se puede. */
export function avisoDeTasa(op: {
  vinculada: boolean
  interesCentavos: number
  tasaMensualEstimada: number | null
  viejosNoEncontrados: string[]
}): AvisoTasaRenovacion | null {
  if (!op.vinculada) return null
  if (op.viejosNoEncontrados.length > 0) return 'faltan_viejos'
  if (op.interesCentavos < 0) return 'pago_parcial'
  if (op.tasaMensualEstimada !== null && op.tasaMensualEstimada > TASA_MENSUAL_MAXIMA_CREIBLE) return 'capital_nuevo'
  return null
}

export interface ResumenTasaRenovaciones {
  /** Promedio de la tasa por mes, pesado por lo que se renovó (cheques viejos). Null si no hay operaciones contables. */
  tasaMensualPromedio: number | null
  /** Operaciones que entran en el promedio. */
  operacionesContadas: number
  /** Operaciones vinculadas que quedan afuera por tener aviso (pago parcial, cheques que faltan, plata nueva). */
  operacionesConAviso: number
}

/** Tasa por mes promedio de las renovaciones confiables: Σ(interés × 30 / días) ÷ Σ viejos. */
export function resumirTasaRenovaciones(ops: OperacionRenovacion[]): ResumenTasaRenovaciones {
  let capital = 0
  let interesMensual = 0
  let contadas = 0
  let conAviso = 0
  for (const op of ops) {
    if (!op.vinculada) continue
    if (op.avisoTasa) {
      conAviso += 1
      continue
    }
    if (!op.diasRenovacion || op.diasRenovacion <= 0 || op.totalViejosCentavos <= 0) continue
    capital += op.totalViejosCentavos
    interesMensual += (op.interesCentavos * 30) / op.diasRenovacion
    contadas += 1
  }
  return {
    tasaMensualPromedio: capital > 0 ? interesMensual / capital : null,
    operacionesContadas: contadas,
    operacionesConAviso: conAviso,
  }
}

export function fechaModaVto(cheques: ChequeEnOperacion[]): string | null {
  const conteo = new Map<string, number>()
  for (const c of cheques) {
    if (c.fechaVencimiento) {
      conteo.set(c.fechaVencimiento, (conteo.get(c.fechaVencimiento) ?? 0) + c.montoCentavos)
    }
  }
  if (conteo.size === 0) return null
  let mejor = ''
  let mejorPeso = -1
  for (const [f, peso] of conteo) {
    if (peso > mejorPeso) { mejor = f; mejorPeso = peso }
  }
  return mejor
}

export function beneficiariosCompatibles(a: string, b: string): boolean {
  if (a === b) return true
  const wa = a.split(/\s+/).filter(w => w.length >= 3)
  const wb = b.split(/\s+/).filter(w => w.length >= 3)
  return wa.some(w => wb.some(x => x.startsWith(w) || w.startsWith(x)))
}

function fechaCerca(a: string, b: string, tolerancia: number): boolean {
  return Math.abs(diasEntre(a, b)) <= tolerancia
}

function sumarDias(ymd: string, n: number): string {
  const d = new Date(ymd + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function docAChequeEnOp(d: ChequeOcasionalDoc): ChequeEnOperacion {
  return {
    numeroCheque: d.numeroCheque,
    montoCentavos: d.montoCentavos,
    fechaVencimiento: d.fechaVencimiento,
    fechaEmision: d.fechaEmision,
    rol: d.rolEnOperacion ?? null,
    pagado: d.pagado,
    beneficiario: d.beneficiario,
    beneficiarioNormalizado: d.beneficiarioNormalizado,
  }
}

export function extraerBanco(numeroCheque: string): string | null {
  const partes = numeroCheque.split('-')
  return partes.length >= 3 ? partes.slice(0, 3).join('-') : null
}

const BANCOS_EQUIVALENTES: Record<string, string[]> = {
  '020-923-5000': ['020-923-5010'],
  '020-923-5010': ['020-923-5000'],
}

function bancosCompatibles(a: string | null, b: string | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const equiv = BANCOS_EQUIVALENTES[a]
  return equiv ? equiv.includes(b) : false
}

/**
 * Clave de agrupación: beneficiario normalizado + fecha emisión + banco.
 * Los cheques de capital y de interés se emiten el mismo día, mismo beneficiario, mismo banco.
 */
function claveGrupo(d: ChequeOcasionalDoc): string {
  const banco = extraerBanco(d.numeroCheque)
  return `${d.beneficiarioNormalizado}|${d.fechaEmision ?? '?'}|${banco ?? '?'}`
}

/**
 * Sub-divide un grupo de cheques nuevos en componentes conectados por renovacionDe.
 * Dos nuevos van juntos si comparten al menos un viejo en su renovacionDe.
 * Nuevos sin renovacionDe explícito van a un sub-grupo aparte (auto-linking los resuelve).
 */
function subdividirPorRenovacionDe(grupo: ChequeOcasionalDoc[]): ChequeOcasionalDoc[][] {
  const conRefs: ChequeOcasionalDoc[] = []
  const sinRefs: ChequeOcasionalDoc[] = []
  for (const d of grupo) {
    if (d.renovacionDe.length > 0) conRefs.push(d)
    else sinRefs.push(d)
  }

  if (conRefs.length <= 1) return [grupo]

  // Union-Find para componentes conectados
  const parent = conRefs.map((_, i) => i)
  function find(x: number): number {
    while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]! }
    return x
  }
  function union(a: number, b: number) { parent[find(a)] = find(b) }

  const viejoToIndices = new Map<string, number[]>()
  for (let i = 0; i < conRefs.length; i++) {
    for (const id of conRefs[i]!.renovacionDe) {
      const list = viejoToIndices.get(id)
      if (list) list.push(i)
      else viejoToIndices.set(id, [i])
    }
  }

  for (const indices of viejoToIndices.values()) {
    for (let i = 1; i < indices.length; i++) {
      union(indices[0]!, indices[i]!)
    }
  }

  const componentes = new Map<number, ChequeOcasionalDoc[]>()
  for (let i = 0; i < conRefs.length; i++) {
    const root = find(i)
    const comp = componentes.get(root)
    if (comp) comp.push(conRefs[i]!)
    else componentes.set(root, [conRefs[i]!])
  }

  if (componentes.size <= 1) return [grupo]

  const result = [...componentes.values()]
  if (sinRefs.length > 0) result.push(sinRefs)
  return result
}

/**
 * Une sub-grupos del mismo beneficiario y día que renuevan los mismos cheques viejos aunque los nuevos sean de bancos
 * distintos (ej. MANA 11/03/2026: los 8 viejos se reemplazaron con 2 cheques de un banco y 6 de otro). Separados, cada
 * parte toma todos los viejos y da una tasa negativa; juntos dan la tasa real.
 */
function unirEntreBancos(subgrupos: ChequeOcasionalDoc[][]): ChequeOcasionalDoc[][] {
  const refsDe = (sub: ChequeOcasionalDoc[]) => new Set(sub.flatMap((d) => d.renovacionDe))
  const claveDia = (sub: ChequeOcasionalDoc[]) => `${sub[0]!.beneficiarioNormalizado}|${sub[0]!.fechaEmision ?? '?'}`
  const resultado: { clave: string; docs: ChequeOcasionalDoc[]; refs: Set<string> }[] = []
  for (const sub of subgrupos) {
    const refs = refsDe(sub)
    const clave = claveDia(sub)
    const destino = refs.size > 0
      ? resultado.find((r) => r.clave === clave && [...refs].some((id) => r.refs.has(id)))
      : undefined
    if (destino) {
      destino.docs.push(...sub)
      for (const id of refs) destino.refs.add(id)
    } else {
      resultado.push({ clave, docs: [...sub], refs })
    }
  }
  const unidos = resultado.map((r) => r.docs)
  // Otra pasada si se unió algo: A y C pueden compartir viejos solo a través de B.
  return unidos.length < subgrupos.length ? unirEntreBancos(unidos) : unidos
}

/**
 * Agrupa cheques de renovación en operaciones.
 *
 * 1. Junta cheques nuevos por beneficiario + fechaEmisión + banco
 * 2. Para cada grupo, busca los cheques viejos referenciados en renovacionDe
 * 3. Calcula interés = total nuevos - total viejos
 * 4. Estima tasa mensual
 */
export function agruparOperacionesRenovacion(
  docs: ChequeOcasionalDoc[],
): OperacionRenovacion[] {
  const porNumero = new Map<string, ChequeOcasionalDoc>()
  for (const d of docs) {
    if (d.numeroCheque) {
      porNumero.set(d.numeroCheque, d)
      const corto = d.numeroCheque.split('-').pop()
      if (corto && corto !== d.numeroCheque) porNumero.set(corto, d)
    }
  }

  const grupos = new Map<string, ChequeOcasionalDoc[]>()
  for (const d of docs) {
    if (!d.esRenovacion) continue
    const clave = claveGrupo(d)
    const grupo = grupos.get(clave)
    if (grupo) grupo.push(d)
    else grupos.set(clave, [d])
  }

  // Agrupar cheques viejos pagados en "operaciones origen" por OBS+beneficiario+fechaEmisión.
  // Cada operación origen es un bloque coherente de cheques que se emitieron juntos.
  interface OperacionOrigen {
    cheques: ChequeOcasionalDoc[]
    beneficiarioNormalizado: string
  }
  const operacionesOrigen: OperacionOrigen[] = []
  const porClaveOrigen = new Map<string, OperacionOrigen>()
  for (const d of docs) {
    if (!d.pagado) continue
    const clave = `${d.obsOriginal}|${d.beneficiarioNormalizado}|${d.fechaEmision ?? '?'}`
    let op = porClaveOrigen.get(clave)
    if (!op) {
      op = { cheques: [], beneficiarioNormalizado: d.beneficiarioNormalizado }
      porClaveOrigen.set(clave, op)
      operacionesOrigen.push(op)
    }
    op.cheques.push(d)
  }

  /**
   * Busca operaciones origen cuyos cheques matcheen por un campo de fecha.
   * Estrategia 1: fechaConciliado (91.5% exacto).
   * Estrategia 2: fechaVencimiento (fallback).
   */
  function buscarOperacionOrigen(
    primero: ChequeOcasionalDoc,
    bancoNuevo: string,
    totalNuevosEst: number,
    usados: Set<string>,
  ): ChequeOcasionalDoc[] {
    const fechaEm = primero.fechaEmision!
    let mejorOp: ChequeOcasionalDoc[] = []
    let mejorTasa = Infinity

    for (const opOrigen of operacionesOrigen) {
      if (!beneficiariosCompatibles(primero.beneficiarioNormalizado, opOrigen.beneficiarioNormalizado)) continue

      // Intentar por fechaConciliado primero, luego por fechaVencimiento
      for (const campo of ['fechaConciliado', 'fechaVencimiento'] as const) {
        const candidatos: ChequeOcasionalDoc[] = []
        for (const c of opOrigen.cheques) {
          if (usados.has(c.numeroCheque)) continue
          const bancoCand = extraerBanco(c.numeroCheque) ?? '?'
          if (!bancosCompatibles(bancoCand, bancoNuevo)) continue
          const fechaCampo = c[campo]
          if (!fechaCampo) continue
          if (!fechaCerca(fechaCampo, fechaEm, 2)) continue
          candidatos.push(c)
        }
        if (candidatos.length === 0) continue

        let elegidos = candidatos
        let totalCand = elegidos.reduce((s, c) => s + c.montoCentavos, 0)
        let tasaCand = totalCand > 0 ? (totalNuevosEst - totalCand) / totalCand : Infinity

        // Si la tasa es inválida, puede haber un cheque "intruso" con conciliado
        // cercano pero vencimiento lejano. Filtrar por vto ±5 días de la emisión.
        if ((tasaCand < 0 || tasaCand > 0.5) && elegidos.length > 1) {
          const refinados = elegidos.filter(c =>
            c.fechaVencimiento && fechaCerca(c.fechaVencimiento, fechaEm, 5),
          )
          if (refinados.length > 0) {
            const totalRef = refinados.reduce((s, c) => s + c.montoCentavos, 0)
            const tasaRef = totalRef > 0 ? (totalNuevosEst - totalRef) / totalRef : Infinity
            if (tasaRef >= 0 && tasaRef <= 0.5) {
              elegidos = refinados
              totalCand = totalRef
              tasaCand = tasaRef
            }
          }
        }

        if (tasaCand < 0 || tasaCand > 0.5) continue

        if (tasaCand < mejorTasa) {
          mejorTasa = tasaCand
          mejorOp = elegidos
        }
        // Si encontró por fechaConciliado, no probar fechaVencimiento en esta operación
        if (campo === 'fechaConciliado' && candidatos.length > 0) break
      }
    }
    // Fallback cross-operación: juntar candidatos de TODAS las operaciones
    // origen del mismo beneficiario cuando ninguna sola alcanza.
    if (mejorOp.length === 0) {
      for (const campo of ['fechaConciliado', 'fechaVencimiento'] as const) {
        const pool: ChequeOcasionalDoc[] = []
        for (const opOrigen of operacionesOrigen) {
          if (!beneficiariosCompatibles(primero.beneficiarioNormalizado, opOrigen.beneficiarioNormalizado)) continue
          for (const c of opOrigen.cheques) {
            if (usados.has(c.numeroCheque)) continue
            const bancoCand = extraerBanco(c.numeroCheque) ?? '?'
            if (!bancosCompatibles(bancoCand, bancoNuevo)) continue
            const fechaCampo = c[campo]
            if (!fechaCampo) continue
            if (!fechaCerca(fechaCampo, fechaEm, 2)) continue
            pool.push(c)
          }
        }
        if (pool.length === 0) continue

        let elegidos = pool
        let totalPool = elegidos.reduce((s, c) => s + c.montoCentavos, 0)
        let tasaPool = totalPool > 0 ? (totalNuevosEst - totalPool) / totalPool : Infinity

        if ((tasaPool < 0 || tasaPool > 0.5) && elegidos.length > 1) {
          const refinados = elegidos.filter(c =>
            c.fechaVencimiento && fechaCerca(c.fechaVencimiento, fechaEm, 5),
          )
          if (refinados.length > 0) {
            const totalRef = refinados.reduce((s, c) => s + c.montoCentavos, 0)
            const tasaRef = totalRef > 0 ? (totalNuevosEst - totalRef) / totalRef : Infinity
            if (tasaRef >= 0 && tasaRef <= 0.5) {
              elegidos = refinados
              totalPool = totalRef
              tasaPool = tasaRef
            }
          }
        }

        if (tasaPool >= 0 && tasaPool <= 0.5) {
          mejorOp = elegidos
          break
        }
      }
    }

    return mejorOp
  }

  // Sub-dividir grupos cuando los renovacionDe son disjuntos
  const separados: ChequeOcasionalDoc[][] = []
  for (const [, grupo] of grupos) {
    for (const sub of subdividirPorRenovacionDe(grupo)) {
      separados.push(sub)
    }
  }
  const subgrupos = unirEntreBancos(separados)

  const operaciones: OperacionRenovacion[] = []
  const viejosUsados = new Set<string>()

  // Orden de proceso: primero las operaciones cuyo OBS indica qué cheques renuevan (dato escrito por
  // una persona) y recién después las que se adivinan. Así las explícitas reservan sus viejos en
  // `viejosUsados` antes de que el auto-vínculo pueda tomarlos. Dentro de cada grupo se ordena por
  // fecha y número para que el resultado no dependa del orden en que llegan los docs.
  const resuelveViejos = (sub: ChequeOcasionalDoc[]): boolean =>
    sub.some((d) => d.renovacionDe.some((id) => porNumero.has(id)))
  const menorNumero = (sub: ChequeOcasionalDoc[]): string =>
    sub.reduce((m, d) => (m === '' || d.numeroCheque < m ? d.numeroCheque : m), '')
  const subgruposOrdenados = [...subgrupos].sort((a, b) => {
    const ra = resuelveViejos(a) ? 0 : 1
    const rb = resuelveViejos(b) ? 0 : 1
    if (ra !== rb) return ra - rb
    const porFecha = (a[0]!.fechaEmision ?? '').localeCompare(b[0]!.fechaEmision ?? '')
    if (porFecha !== 0) return porFecha
    return menorNumero(a).localeCompare(menorNumero(b))
  })

  for (const chequesNuevosDocs of subgruposOrdenados) {
    const primero = chequesNuevosDocs[0]!
    const banco = extraerBanco(primero.numeroCheque)

    const idsViejos = new Set<string>()
    for (const d of chequesNuevosDocs) {
      for (const id of d.renovacionDe) idsViejos.add(id)
    }

    const chequesViejosDocs: ChequeOcasionalDoc[] = []
    const viejosVistos = new Set<string>()
    const viejosNoEncontrados: string[] = []
    for (const id of idsViejos) {
      const viejo = porNumero.get(id)
      if (!viejo) viejosNoEncontrados.push(id)
      if (viejo && !viejosVistos.has(viejo.numeroCheque)) {
        viejosVistos.add(viejo.numeroCheque)
        chequesViejosDocs.push(viejo)
      }
    }

    // Auto-vinculación por operación origen:
    // 1) fechaConciliado del viejo ≈ fechaEmision del nuevo (91.5% exacto)
    // 2) Fallback: fechaVencimiento del viejo ≈ fechaEmision del nuevo
    // Busca dentro de operaciones coherentes (agrupadas por OBS+beneficiario+fecha)
    let autoVinculado = false
    let debugAutolink: string | undefined
    if (chequesViejosDocs.length === 0 && primero.fechaEmision) {
      const bancoNuevo = banco ?? '?'
      const totalNuevosEst = chequesNuevosDocs.reduce((s, c) => s + c.montoCentavos, 0)

      const mejorOp = buscarOperacionOrigen(primero, bancoNuevo, totalNuevosEst, viejosUsados)
      if (mejorOp.length > 0) {
        for (const c of mejorOp) {
          if (!viejosVistos.has(c.numeroCheque)) {
            viejosVistos.add(c.numeroCheque)
            chequesViejosDocs.push(c)
          }
        }
        autoVinculado = true
      } else {
        // Diagnóstico: ¿por qué no matcheó?
        const benNorm = primero.beneficiarioNormalizado
        const fechaEm = primero.fechaEmision!
        let totalPagados = 0
        let compatBenef = 0
        let compatBanco = 0
        let cercaFecha = 0
        let tasaOk = 0
        let yaUsados = 0
        for (const opOrigen of operacionesOrigen) {
          for (const c of opOrigen.cheques) {
            totalPagados++
            if (!beneficiariosCompatibles(benNorm, opOrigen.beneficiarioNormalizado)) continue
            compatBenef++
            if (viejosUsados.has(c.numeroCheque)) { yaUsados++; continue }
            const bancoCand = extraerBanco(c.numeroCheque) ?? '?'
            if (!bancosCompatibles(bancoCand, bancoNuevo)) continue
            compatBanco++
            const fc = c.fechaConciliado
            const fv = c.fechaVencimiento
            if ((fc && fechaCerca(fc, fechaEm, 2)) || (fv && fechaCerca(fv, fechaEm, 2))) {
              cercaFecha++
            }
          }
        }
        debugAutolink = `pool=${totalPagados} benef=${compatBenef} banco=${compatBanco} fecha±2=${cercaFecha} usados=${yaUsados} (busca fechaEm=${fechaEm} banco=${bancoNuevo} benef=${benNorm})`
      }
    } else if (chequesViejosDocs.length === 0 && !primero.fechaEmision) {
      debugAutolink = 'sin fechaEmision en cheque nuevo'
    }

    // Marcar viejos usados para no reutilizarlos en otra operación
    for (const v of chequesViejosDocs) viejosUsados.add(v.numeroCheque)

    const chequesNuevos = chequesNuevosDocs.map(docAChequeEnOp)
    const chequesViejos = chequesViejosDocs.map(docAChequeEnOp)

    const totalNuevos = chequesNuevos.reduce((s, c) => s + c.montoCentavos, 0)
    const totalViejos = chequesViejos.reduce((s, c) => s + c.montoCentavos, 0)
    const interes = chequesViejos.length > 0 ? totalNuevos - totalViejos : 0
    const vinculada = chequesViejos.length > 0
    const tipoVinculo: 'explicito' | 'implicito' = idsViejos.size > 0 ? 'explicito' : 'implicito'

    const fechaVtoViejos = fechaModaVto(chequesViejos)
    const fechaVtoNuevos = fechaModaVto(chequesNuevos)

    const dias = plazoPonderadoDias(chequesViejos, chequesNuevos)

    const tasaImplicita = totalViejos > 0 ? interes / totalViejos : 0
    const tasaMensual = dias && dias > 0 && totalViejos > 0
      ? (interes / totalViejos) / dias * 30
      : null
    // Solo los que nombra el OBS y no se encontraron, si la operación quedó vinculada con otros.
    const faltantes = vinculada ? viejosNoEncontrados.sort() : []
    const avisoTasa = avisoDeTasa({ vinculada, interesCentavos: interes, tasaMensualEstimada: tasaMensual, viejosNoEncontrados: faltantes })

    operaciones.push({
      id: `renov-${primero.beneficiarioNormalizado}-${primero.fechaEmision ?? 'sin-fecha'}`,
      beneficiario: primero.beneficiario,
      beneficiarioNormalizado: primero.beneficiarioNormalizado,
      fechaEmision: primero.fechaEmision,
      banco,
      chequesViejos,
      chequesNuevos,
      totalViejosCentavos: totalViejos,
      totalNuevosCentavos: totalNuevos,
      interesCentavos: interes,
      fechaVtoViejos,
      fechaVtoNuevos,
      diasRenovacion: dias,
      tasaImplicita,
      tasaMensualEstimada: tasaMensual,
      avisoTasa,
      viejosNoEncontrados: faltantes,
      vinculada,
      tipoVinculo,
      obsOriginal: primero.obsOriginal,
      ...(debugAutolink ? { debugAutolink } : {}),
    })
  }

  operaciones.sort((a, b) => (b.fechaEmision ?? '').localeCompare(a.fechaEmision ?? ''))
  return operaciones
}
