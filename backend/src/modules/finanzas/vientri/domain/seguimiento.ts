import type { ChequeOcasionalDoc, OperacionRenovacion } from './cheque-ocasional.types.js'
import { agruparOperacionesRenovacion, beneficiariosCompatibles } from './operacion-renovacion.js'
import type {
  BeneficiarioSeguimiento,
  ChequeConEstado,
  EstadoChequeRenov,
  EstadoOperacion,
  FiltroSeguimiento,
  OperacionPersistida,
  OperacionSeguimientoItem,
  SeguimientoResponse,
} from './seguimiento.types.js'

const ESTADOS_EN_EXPOSICION: ReadonlySet<EstadoChequeRenov> = new Set(['pendiente', 'rechazado'])

function sumarDias(yyyy_mm_dd: string, dias: number): string {
  const d = new Date(`${yyyy_mm_dd}T12:00:00-03:00`)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Número completo y corto (último segmento), igual que el resto del dominio de ocasionales. */
function clavesDeNumero(numero: string): string[] {
  if (!numero) return []
  const corto = numero.split('-').pop()
  return corto && corto !== numero ? [numero, corto] : [numero]
}

function idBase(op: OperacionRenovacion): string {
  const base = `renov-${op.beneficiarioNormalizado}-${op.fechaEmision ?? 'sin-fecha'}-${op.banco ?? '?'}`
  // '/' no es válido en ids de documentos de Firestore
  return base.replace(/\//g, '_')
}

function primerNumeroNuevo(op: OperacionRenovacion): string {
  return op.chequesNuevos.map((c) => c.numeroCheque).sort()[0] ?? ''
}

/**
 * Asigna ids determinísticos: renov-{beneficiario}-{fechaEmision}-{banco}.
 * Si dos operaciones comparten base (subgrupos de un mismo grupo), la segunda y siguientes
 * llevan sufijo -2, -3… según el orden por primer cheque nuevo.
 */
function asignarIds(ops: OperacionRenovacion[]): Map<OperacionRenovacion, string> {
  const ordenadas = [...ops].sort(
    (a, b) => idBase(a).localeCompare(idBase(b)) || primerNumeroNuevo(a).localeCompare(primerNumeroNuevo(b)),
  )
  const contador = new Map<string, number>()
  const ids = new Map<OperacionRenovacion, string>()
  for (const op of ordenadas) {
    const base = idBase(op)
    const n = (contador.get(base) ?? 0) + 1
    contador.set(base, n)
    ids.set(op, n === 1 ? base : `${base}-${n}`)
  }
  return ids
}

function estadoDeCheque(doc: ChequeOcasionalDoc | undefined, pagado: boolean): EstadoChequeRenov {
  if (doc?.estadoCodigo === 5) return 'renovado'
  if (doc?.estadoCodigo === 9) return 'anulado'
  if (doc?.estadoCodigo === 3) return 'rechazado'
  if (pagado) return 'debitado'
  return 'pendiente'
}

/**
 * Deriva el seguimiento a partir de la salida de `agruparOperacionesRenovacion`:
 * - estado de cada cheque nuevo (renovado si figura como viejo en otra op; si no, según Vientri),
 * - cadena hacia atrás (`operacionesAnterioresIds`),
 * - ids determinísticos, `fechaVtoMax` y exposición.
 */
export function derivarSeguimiento(
  operaciones: OperacionRenovacion[],
  docs: ChequeOcasionalDoc[],
): OperacionPersistida[] {
  const docPorNumero = new Map<string, ChequeOcasionalDoc>()
  for (const d of docs) {
    for (const k of clavesDeNumero(d.numeroCheque)) docPorNumero.set(k, d)
  }

  const ids = asignarIds(operaciones)
  const ordenadas = [...operaciones].sort((a, b) => ids.get(a)!.localeCompare(ids.get(b)!))

  // número de cheque → operación donde figura como NUEVO / como VIEJO
  const nuevoEnOp = new Map<string, string>()
  const viejoEnOp = new Map<string, string>()
  for (const op of ordenadas) {
    const id = ids.get(op)!
    for (const c of op.chequesNuevos) {
      for (const k of clavesDeNumero(c.numeroCheque)) if (!nuevoEnOp.has(k)) nuevoEnOp.set(k, id)
    }
    for (const c of op.chequesViejos) {
      for (const k of clavesDeNumero(c.numeroCheque)) if (!viejoEnOp.has(k)) viejoEnOp.set(k, id)
    }
  }

  const resultado: OperacionPersistida[] = ordenadas.map((op) => {
    const id = ids.get(op)!

    const chequesNuevos: ChequeConEstado[] = op.chequesNuevos.map((c) => {
      const claves = clavesDeNumero(c.numeroCheque)
      const siguiente =
        claves.map((k) => viejoEnOp.get(k)).find((opId) => opId !== undefined && opId !== id) ?? null
      const doc = claves.map((k) => docPorNumero.get(k)).find((d) => d !== undefined)
      const estado: EstadoChequeRenov = siguiente ? 'renovado' : estadoDeCheque(doc, c.pagado)
      return { ...c, estado, operacionSiguienteId: siguiente }
    })

    const anteriores = new Set<string>()
    for (const v of op.chequesViejos) {
      for (const k of clavesDeNumero(v.numeroCheque)) {
        const opAnterior = nuevoEnOp.get(k)
        if (opAnterior && opAnterior !== id) anteriores.add(opAnterior)
      }
    }

    let fechaVtoMax: string | null = null
    for (const c of chequesNuevos) {
      if (c.fechaVencimiento && (fechaVtoMax === null || c.fechaVencimiento > fechaVtoMax)) {
        fechaVtoMax = c.fechaVencimiento
      }
    }

    const exposicionCentavos = chequesNuevos
      .filter((c) => ESTADOS_EN_EXPOSICION.has(c.estado))
      .reduce((s, c) => s + c.montoCentavos, 0)

    return {
      ...op,
      id,
      chequesNuevos,
      operacionesAnterioresIds: [...anteriores].sort(),
      fechaVtoMax,
      exposicionCentavos,
    }
  })

  resultado.sort(
    (a, b) => (b.fechaEmision ?? '').localeCompare(a.fechaEmision ?? '') || a.id.localeCompare(b.id),
  )
  return resultado
}

/**
 * Punto de entrada: excluye los cheques con `baja`, agrupa en operaciones y deriva el seguimiento.
 * `docs` debe incluir también los viejos (CHQOCA + sintéticos de CHQ) para poder vincular.
 */
export function construirSeguimiento(docs: ChequeOcasionalDoc[]): OperacionPersistida[] {
  const activos = docs.filter((d) => !d.baja)
  return derivarSeguimiento(agruparOperacionesRenovacion(activos), activos)
}

/**
 * Cerrada = todos los nuevos salieron de la exposición (debitado / anulado / renovado)
 * y el último vencimiento es anterior a `hoy` (YYYY-MM-DD). Si no, abierta.
 */
export function estadoOperacion(
  op: Pick<OperacionPersistida, 'chequesNuevos' | 'fechaVtoMax'>,
  hoy: string,
): EstadoOperacion {
  const todosResueltos = op.chequesNuevos.every((c) => !ESTADOS_EN_EXPOSICION.has(c.estado))
  const vencida = op.fechaVtoMax === null || op.fechaVtoMax < hoy
  return todosResueltos && vencida ? 'cerrada' : 'abierta'
}

function ancestrosTransitivos(op: OperacionPersistida, porId: Map<string, OperacionPersistida>): string[] {
  const vistos = new Set<string>([op.id])
  const orden: string[] = []
  let frontera = [...op.operacionesAnterioresIds]
  while (frontera.length > 0) {
    const siguiente: string[] = []
    for (const id of frontera) {
      if (vistos.has(id)) continue
      vistos.add(id)
      orden.push(id)
      const anterior = porId.get(id)
      if (anterior) siguiente.push(...anterior.operacionesAnterioresIds)
    }
    frontera = siguiente
  }
  return orden
}

/**
 * Arma la respuesta del seguimiento a partir de las operaciones persistidas:
 * calcula abierta/cerrada con `hoy` (YYYY-MM-DD), filtra, agrupa por beneficiario compatible
 * (HNA CLAUDIA + HERMANA CLAUDIA) y resuelve los ancestros de cada operación.
 */
export function armarSeguimiento(
  operaciones: OperacionPersistida[],
  hoy: string,
  filtro: FiltroSeguimiento,
): SeguimientoResponse {
  const porId = new Map(operaciones.map((o) => [o.id, o]))
  const items: OperacionSeguimientoItem[] = operaciones.map((op) => ({
    ...op,
    estadoOperacion: estadoOperacion(op, hoy),
    ancestrosIds: ancestrosTransitivos(op, porId),
  }))
  const itemPorId = new Map(items.map((i) => [i.id, i]))

  const seleccion = filtro === 'todas' ? items : items.filter((i) => i.estadoOperacion === 'abierta')
  const idsSeleccion = new Set(seleccion.map((i) => i.id))

  const grupos: BeneficiarioSeguimiento[] = []
  const ordenadas = [...seleccion].sort(
    (a, b) => (b.fechaEmision ?? '').localeCompare(a.fechaEmision ?? '') || a.id.localeCompare(b.id),
  )
  for (const op of ordenadas) {
    let grupo = grupos.find((g) => beneficiariosCompatibles(g.beneficiarioNormalizado, op.beneficiarioNormalizado))
    if (!grupo) {
      grupo = {
        beneficiario: op.beneficiario,
        beneficiarioNormalizado: op.beneficiarioNormalizado,
        posicionesAbiertas: 0,
        rechazadas: 0,
        exposicionCentavos: 0,
        operaciones: [],
      }
      grupos.push(grupo)
    }
    grupo.operaciones.push(op)
    for (const c of op.chequesNuevos) {
      if (c.estado === 'pendiente') grupo.posicionesAbiertas += 1
      else if (c.estado === 'rechazado') {
        grupo.posicionesAbiertas += 1
        grupo.rechazadas += 1
      }
    }
    grupo.exposicionCentavos += op.exposicionCentavos
  }
  grupos.sort(
    (a, b) => b.exposicionCentavos - a.exposicionCentavos || a.beneficiario.localeCompare(b.beneficiario),
  )

  const idsAncestros = new Set<string>()
  const cola = [...seleccion]
  while (cola.length > 0) {
    const actual = cola.pop()!
    for (const id of actual.ancestrosIds) {
      if (!idsSeleccion.has(id) && !idsAncestros.has(id)) {
        idsAncestros.add(id)
        const item = itemPorId.get(id)
        if (item) cola.push(item)
      }
    }
    for (const c of actual.chequesNuevos) {
      const sigId = c.operacionSiguienteId
      if (sigId && !idsSeleccion.has(sigId) && !idsAncestros.has(sigId)) {
        idsAncestros.add(sigId)
        const item = itemPorId.get(sigId)
        if (item) cola.push(item)
      }
    }
  }
  const ancestros = [...idsAncestros]
    .map((id) => itemPorId.get(id))
    .filter((i): i is OperacionSeguimientoItem => i !== undefined)
    .sort((a, b) => (b.fechaEmision ?? '').localeCompare(a.fechaEmision ?? '') || a.id.localeCompare(b.id))

  const totalPosicionesAbiertas = grupos.reduce((s, g) => s + g.posicionesAbiertas, 0)
  const totalExposicion = grupos.reduce((s, g) => s + g.exposicionCentavos, 0)

  const d30 = sumarDias(hoy, 30)
  const d15 = sumarDias(hoy, 15)
  const d7 = sumarDias(hoy, 7)
  let vencidosCantidad = 0
  let vencidosCentavos = 0
  let porVencer7d = 0
  let porVencer15d = 0
  let porVencer30d = 0
  let profundidadMax = 0
  let cadenaMasLargaOp: { id: string; beneficiario: string } | null = null

  for (const op of seleccion) {
    if (op.ancestrosIds.length > profundidadMax) {
      profundidadMax = op.ancestrosIds.length
      cadenaMasLargaOp = { id: op.id, beneficiario: op.beneficiario }
    }
    for (const c of op.chequesNuevos) {
      if (!ESTADOS_EN_EXPOSICION.has(c.estado) || !c.fechaVencimiento) continue
      if (c.fechaVencimiento < hoy) {
        vencidosCantidad += 1
        vencidosCentavos += c.montoCentavos
      } else {
        if (c.fechaVencimiento <= d7) porVencer7d += 1
        if (c.fechaVencimiento <= d15) porVencer15d += 1
        if (c.fechaVencimiento <= d30) porVencer30d += 1
      }
    }
  }

  const concentracionTopPct =
    totalExposicion > 0 && grupos.length > 0
      ? Math.round((grupos[0]!.exposicionCentavos / totalExposicion) * 10000) / 100
      : 0

  return {
    hoy,
    estado: filtro,
    beneficiarios: grupos,
    ancestros,
    totales: {
      beneficiarios: grupos.length,
      operaciones: seleccion.length,
      posicionesAbiertas: totalPosicionesAbiertas,
      exposicionCentavos: totalExposicion,
      vencidosCantidad,
      vencidosCentavos,
      porVencer7d,
      porVencer15d,
      porVencer30d,
      profundidadMaxCadena: profundidadMax,
      cadenaMasLargaOp,
      concentracionTopPct,
    },
  }
}