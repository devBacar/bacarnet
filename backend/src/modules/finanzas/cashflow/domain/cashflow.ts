import type { Moneda } from '../../domain/cuenta.types.js'

export const CASHFLOW_VENTANA_DIAS = 31
const DETALLE_MAX = 15
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

export interface MovimientoCashflow {
  moneda: Moneda
  tipo: 'debito' | 'credito'
  montoCentavos: number
  categoriaId: string | null
  descripcion?: string
  cuentaId?: string
  bancoNombre?: string
}

export interface CategoriaCashflow {
  id: string
  nombre: string
  color: string | null
  grupo: string | null
}

export interface CashflowDetalleItem {
  descripcion: string
  cuentaId: string
  bancoNombre: string
  centavos: number
  cantidad: number
}

export interface CashflowCategoriaItem {
  categoriaId: string | null
  nombre: string
  color: string | null
  centavos: number
  porcentaje: number
  detalle: CashflowDetalleItem[]
  detalleRestantes: number
}

export interface CashflowGrupoItem {
  grupo: string
  sinCategoria: boolean
  color: string | null
  centavos: number
  porcentaje: number
  categorias: CashflowCategoriaItem[]
}

export interface CashflowBancoFila {
  bancoNombre: string
  saldoInicioCentavos: number | null
  entradasCentavos: number
  salidasCentavos: number
  saldoFinCentavos: number | null
  faltanteCentavos: number
}

export interface CashflowAviso {
  bancoNombre: string
  faltanteCentavos: number
  texto: string
}

export interface CashflowDiario {
  fecha: string
  moneda: Moneda
  saldoInicial: { fechaId: string; centavos: number } | null
  entradasCentavos: number
  salidasCentavos: number
  saldoFinal: { estado: 'cerrado' | 'en_curso' | 'pendiente'; centavos: number | null }
  /** 'banco' si todas las cuentas usaron el cierre diario del banco. */
  origenSaldos: 'banco' | 'cierre15'
  bancos: CashflowBancoFila[]
  avisos: CashflowAviso[]
  entradas: CashflowGrupoItem[]
  salidas: CashflowGrupoItem[]
}

export interface CuentaCashflowRef {
  cuentaId: string
  bancoNombre: string
  moneda: Moneda
}

export interface SaldoDiarioCashflow {
  cuentaId: string
  fecha: string
  estado: 'cerrado' | 'en_curso'
  saldoInicioCentavos: number | null
  saldoFinCentavos: number
}

export interface Cierre15CuentaCashflow {
  cuentaId: string
  saldoCentavos: number
}

/** Menos de un peso de diferencia no se muestra: es redondeo. */
const FALTANTE_UMBRAL_CENTAVOS = 100

export function calcularFaltanteCentavos(input: {
  saldoInicioCentavos: number | null
  saldoFinCentavos: number | null
  entradasCentavos: number
  salidasCentavos: number
}): number {
  if (input.saldoInicioCentavos == null || input.saldoFinCentavos == null) return 0
  const faltante =
    input.saldoFinCentavos -
    input.saldoInicioCentavos -
    (input.entradasCentavos - input.salidasCentavos)
  if (Math.abs(faltante) < FALTANTE_UMBRAL_CENTAVOS) return 0
  return faltante
}

/** Saldo con el que arranca el día: el cierre anterior, o el arranque que informa el banco si el día es hoy. */
export function elegirSaldoInicio(input: {
  fecha: string
  hoy: string
  docs: SaldoDiarioCashflow[]
}): { fechaId: string; centavos: number } | null {
  const anteriores = input.docs
    .filter((doc) => doc.estado === 'cerrado' && doc.fecha < input.fecha)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
  const anterior = anteriores[0] ?? null

  if (input.fecha === input.hoy) {
    const enCurso = input.docs.find((doc) => doc.fecha === input.fecha && doc.estado === 'en_curso')
    if (enCurso?.saldoInicioCentavos != null) {
      return {
        fechaId: anterior?.fecha ?? sumarDias(input.fecha, -1),
        centavos: enCurso.saldoInicioCentavos,
      }
    }
  }

  if (!anterior) return null
  return { fechaId: anterior.fecha, centavos: anterior.saldoFinCentavos }
}

function formatMontoAviso(centavos: number, moneda: Moneda): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: moneda,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(centavos) / 100)
}

export function textoAvisoFaltante(input: {
  bancoNombre: string
  faltanteCentavos: number
  esHoy: boolean
  moneda: Moneda
}): string {
  const nombre = input.bancoNombre.startsWith('Banco ') ? input.bancoNombre : `Banco ${input.bancoNombre}`
  const monto = formatMontoAviso(input.faltanteCentavos, input.moneda)
  const movimiento = input.faltanteCentavos < 0 ? 'salió' : 'entró'
  if (input.esHoy) {
    return `${nombre} todavía no mandó el detalle de ${monto}, plata que ${movimiento} hoy. Llega mañana y este día se completa solo.`
  }
  return `${nombre} no mandó el detalle de ${monto}, plata que ${movimiento} ese día.`
}

export function esFechaId(value: string): boolean {
  if (!FECHA_RE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function sumarDias(fechaId: string, dias: number): string {
  const [year, month, day] = fechaId.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + dias))
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function esFinDeSemana(fechaId: string): boolean {
  const [year, month, day] = fechaId.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return weekday === 0 || weekday === 6
}

/** Hoy si es hábil; si no, el viernes anterior. */
export function ultimoDiaHabil(fechaId: string): string {
  let cursor = fechaId
  while (esFinDeSemana(cursor)) cursor = sumarDias(cursor, -1)
  return cursor
}

export function validarFechaCashflow(fecha: string, hoy: string): void {
  if (!esFechaId(fecha) || !esFechaId(hoy)) {
    throw new Error('fecha inválida')
  }
  if (fecha > hoy) throw new Error('La fecha no puede ser futura')
  if (fecha < sumarDias(hoy, -CASHFLOW_VENTANA_DIAS)) {
    throw new Error('Solo se puede consultar hasta un mes atrás')
  }
}

function porcentaje(parte: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((parte * 1000) / total) / 10
}

function compararMontoNombre(a: { centavos: number; nombre: string }, b: { centavos: number; nombre: string }): number {
  return b.centavos - a.centavos || a.nombre.localeCompare(b.nombre, 'es')
}

interface BucketCategoria {
  categoriaId: string | null
  nombre: string
  color: string | null
  grupo: string
  sinCategoria: boolean
  centavos: number
  detalles: Map<string, CashflowDetalleItem>
}

function grupoDeCategoria(categoria: CategoriaCashflow): string {
  const grupo = categoria.grupo?.trim()
  return grupo ? grupo : categoria.nombre
}

function bucketPara(movimiento: MovimientoCashflow, categorias: CategoriaCashflow[]): BucketCategoria {
  if (!movimiento.categoriaId) {
    return {
      categoriaId: null,
      nombre: 'Sin categoría',
      color: null,
      grupo: 'Sin categoría',
      sinCategoria: true,
      centavos: 0,
      detalles: new Map(),
    }
  }
  const categoria = categorias.find((item) => item.id === movimiento.categoriaId)
  if (!categoria) {
    return {
      categoriaId: movimiento.categoriaId,
      nombre: 'Categoría eliminada',
      color: null,
      grupo: 'Categoría eliminada',
      sinCategoria: false,
      centavos: 0,
      detalles: new Map(),
    }
  }
  return {
    categoriaId: categoria.id,
    nombre: categoria.nombre,
    color: categoria.color,
    grupo: grupoDeCategoria(categoria),
    sinCategoria: false,
    centavos: 0,
    detalles: new Map(),
  }
}

function sumarDetalle(bucket: BucketCategoria, movimiento: MovimientoCashflow): void {
  const descripcion = movimiento.descripcion?.trim() || 'Sin descripción'
  const cuentaId = movimiento.cuentaId ?? ''
  const key = `${cuentaId}\u0000${descripcion}`
  const item = bucket.detalles.get(key) ?? {
    descripcion,
    cuentaId,
    bancoNombre: movimiento.bancoNombre ?? '',
    centavos: 0,
    cantidad: 0,
  }
  item.centavos += movimiento.montoCentavos
  item.cantidad += 1
  bucket.detalles.set(key, item)
}

function cerrarDetalle(detalles: Map<string, CashflowDetalleItem>): {
  detalle: CashflowDetalleItem[]
  detalleRestantes: number
} {
  const ordenados = [...detalles.values()].sort((a, b) =>
    compararMontoNombre({ centavos: a.centavos, nombre: a.descripcion }, { centavos: b.centavos, nombre: b.descripcion }),
  )
  return {
    detalle: ordenados.slice(0, DETALLE_MAX),
    detalleRestantes: Math.max(0, ordenados.length - DETALLE_MAX),
  }
}

function desgloseGrupos(buckets: Map<string, BucketCategoria>, total: number): CashflowGrupoItem[] {
  const porGrupo = new Map<string, BucketCategoria[]>()
  for (const bucket of buckets.values()) {
    const lista = porGrupo.get(bucket.grupo) ?? []
    lista.push(bucket)
    porGrupo.set(bucket.grupo, lista)
  }

  const grupos: CashflowGrupoItem[] = []
  for (const [grupo, lista] of porGrupo) {
    const centavos = lista.reduce((suma, bucket) => suma + bucket.centavos, 0)
    const categorias = lista
      .map((bucket) => {
        const detalle = cerrarDetalle(bucket.detalles)
        return {
          categoriaId: bucket.categoriaId,
          nombre: bucket.nombre,
          color: bucket.color,
          centavos: bucket.centavos,
          porcentaje: porcentaje(bucket.centavos, centavos),
          detalle: detalle.detalle,
          detalleRestantes: detalle.detalleRestantes,
        }
      })
      .sort(compararMontoNombre)
    const sinCategoria = lista.every((bucket) => bucket.sinCategoria)
    const principal = categorias[0]
    grupos.push({
      grupo,
      sinCategoria,
      color: sinCategoria ? null : (principal?.color ?? null),
      centavos,
      porcentaje: porcentaje(centavos, total),
      categorias,
    })
  }

  return grupos.sort((a, b) =>
    compararMontoNombre({ centavos: a.centavos, nombre: a.grupo }, { centavos: b.centavos, nombre: b.grupo }),
  )
}

interface CuentaResuelta {
  bancoNombre: string
  origen: 'banco' | 'cierre15'
  saldoInicioCentavos: number | null
  saldoInicioFechaId: string | null
  saldoFinCentavos: number | null
  estado: 'cerrado' | 'en_curso' | 'pendiente'
  entradasCentavos: number
  salidasCentavos: number
  faltanteCentavos: number
}

function netoMovimientosCuenta(
  movimientos: MovimientoCashflow[],
  moneda: Moneda,
  cuentaId: string,
): { entradasCentavos: number; salidasCentavos: number } {
  let entradasCentavos = 0
  let salidasCentavos = 0
  for (const movimiento of movimientos) {
    if (movimiento.moneda !== moneda || movimiento.cuentaId !== cuentaId) continue
    if (movimiento.tipo === 'credito') entradasCentavos += movimiento.montoCentavos
    else salidasCentavos += movimiento.montoCentavos
  }
  return { entradasCentavos, salidasCentavos }
}

function sumarSiCompleto(valores: Array<number | null>): number | null {
  let total = 0
  for (const valor of valores) {
    if (valor == null) return null
    total += valor
  }
  return total
}

function resolverCuentaCashflow(input: {
  fecha: string
  hoy: string
  moneda: Moneda
  cuenta: CuentaCashflowRef
  docs: SaldoDiarioCashflow[]
  cierre15Anterior: { fechaId: string; cuentas: Cierre15CuentaCashflow[] } | null
  cierre15Dia: { cuentas: Cierre15CuentaCashflow[] } | null
  movimientos: MovimientoCashflow[]
}): CuentaResuelta {
  const neto = netoMovimientosCuenta(input.movimientos, input.moneda, input.cuenta.cuentaId)
  const docFecha = input.docs.find((doc) => doc.fecha === input.fecha)
  if (docFecha) {
    const inicio = elegirSaldoInicio({ fecha: input.fecha, hoy: input.hoy, docs: input.docs })
    const estado =
      input.fecha === input.hoy && docFecha.estado === 'en_curso' ? 'en_curso' : 'cerrado'
    return {
      bancoNombre: input.cuenta.bancoNombre,
      origen: 'banco',
      saldoInicioCentavos: inicio?.centavos ?? null,
      saldoInicioFechaId: inicio?.fechaId ?? null,
      saldoFinCentavos: docFecha.saldoFinCentavos,
      estado,
      entradasCentavos: neto.entradasCentavos,
      salidasCentavos: neto.salidasCentavos,
      faltanteCentavos: calcularFaltanteCentavos({
        saldoInicioCentavos: inicio?.centavos ?? null,
        saldoFinCentavos: docFecha.saldoFinCentavos,
        entradasCentavos: neto.entradasCentavos,
        salidasCentavos: neto.salidasCentavos,
      }),
    }
  }

  const snapInicio = input.cierre15Anterior?.cuentas.find((cuenta) => cuenta.cuentaId === input.cuenta.cuentaId)
  const snapFin = input.cierre15Dia?.cuentas.find((cuenta) => cuenta.cuentaId === input.cuenta.cuentaId)
  const saldoInicioCentavos = snapInicio ? snapInicio.saldoCentavos : null
  if (snapFin) {
    return {
      bancoNombre: input.cuenta.bancoNombre,
      origen: 'cierre15',
      saldoInicioCentavos,
      saldoInicioFechaId: snapInicio ? input.cierre15Anterior?.fechaId ?? null : null,
      saldoFinCentavos: snapFin.saldoCentavos,
      estado: 'cerrado',
      entradasCentavos: neto.entradasCentavos,
      salidasCentavos: neto.salidasCentavos,
      faltanteCentavos: 0,
    }
  }

  const estimado =
    saldoInicioCentavos == null
      ? null
      : saldoInicioCentavos + neto.entradasCentavos - neto.salidasCentavos
  return {
    bancoNombre: input.cuenta.bancoNombre,
    origen: 'cierre15',
    saldoInicioCentavos,
    saldoInicioFechaId: snapInicio ? input.cierre15Anterior?.fechaId ?? null : null,
    saldoFinCentavos: estimado,
    estado: 'pendiente',
    entradasCentavos: neto.entradasCentavos,
    salidasCentavos: neto.salidasCentavos,
    faltanteCentavos: 0,
  }
}

function armarSaldosPorCuenta(input: {
  fecha: string
  hoy: string
  moneda: Moneda
  cuentas: CuentaCashflowRef[]
  saldosDiarios: SaldoDiarioCashflow[]
  cierre15Anterior: { fechaId: string; cuentas: Cierre15CuentaCashflow[] } | null
  cierre15Dia: { cuentas: Cierre15CuentaCashflow[] } | null
  movimientos: MovimientoCashflow[]
}): Pick<CashflowDiario, 'saldoInicial' | 'saldoFinal' | 'origenSaldos' | 'bancos' | 'avisos'> {
  const resueltas = input.cuentas
    .filter((cuenta) => cuenta.moneda === input.moneda)
    .map((cuenta) =>
      resolverCuentaCashflow({
        fecha: input.fecha,
        hoy: input.hoy,
        moneda: input.moneda,
        cuenta,
        docs: input.saldosDiarios.filter((doc) => doc.cuentaId === cuenta.cuentaId),
        cierre15Anterior: input.cierre15Anterior,
        cierre15Dia: input.cierre15Dia,
        movimientos: input.movimientos,
      }),
    )

  const origenSaldos = resueltas.every((cuenta) => cuenta.origen === 'banco') ? 'banco' : 'cierre15'
  let estado: CashflowDiario['saldoFinal']['estado'] = 'cerrado'
  if (resueltas.some((cuenta) => cuenta.estado === 'pendiente')) estado = 'pendiente'
  else if (origenSaldos === 'banco' && input.fecha === input.hoy && resueltas.every((cuenta) => cuenta.estado === 'en_curso')) {
    estado = 'en_curso'
  }

  const saldoInicialCentavos = sumarSiCompleto(resueltas.map((cuenta) => cuenta.saldoInicioCentavos))
  const fechasInicio = resueltas
    .map((cuenta) => cuenta.saldoInicioFechaId)
    .filter((fecha): fecha is string => fecha != null)
  const fechaId = fechasInicio.reduce<string | null>(
    (min, fecha) => (min == null || fecha < min ? fecha : min),
    null,
  )

  const porBanco = new Map<string, CuentaResuelta[]>()
  for (const cuenta of resueltas) {
    const lista = porBanco.get(cuenta.bancoNombre) ?? []
    lista.push(cuenta)
    porBanco.set(cuenta.bancoNombre, lista)
  }

  const bancos = [...porBanco.entries()]
    .map(([bancoNombre, lista]) => ({
      bancoNombre,
      saldoInicioCentavos: sumarSiCompleto(lista.map((cuenta) => cuenta.saldoInicioCentavos)),
      entradasCentavos: lista.reduce((suma, cuenta) => suma + cuenta.entradasCentavos, 0),
      salidasCentavos: lista.reduce((suma, cuenta) => suma + cuenta.salidasCentavos, 0),
      saldoFinCentavos: sumarSiCompleto(lista.map((cuenta) => cuenta.saldoFinCentavos)),
      faltanteCentavos: lista.reduce((suma, cuenta) => suma + cuenta.faltanteCentavos, 0),
    }))
    .sort((a, b) => a.bancoNombre.localeCompare(b.bancoNombre, 'es'))

  const esHoy = input.fecha === input.hoy
  const avisos = bancos
    .filter((banco) => banco.faltanteCentavos !== 0)
    .map((banco) => ({
      bancoNombre: banco.bancoNombre,
      faltanteCentavos: banco.faltanteCentavos,
      texto: textoAvisoFaltante({
        bancoNombre: banco.bancoNombre,
        faltanteCentavos: banco.faltanteCentavos,
        esHoy,
        moneda: input.moneda,
      }),
    }))

  return {
    saldoInicial:
      saldoInicialCentavos == null || fechaId == null
        ? null
        : { fechaId, centavos: saldoInicialCentavos },
    saldoFinal: {
      estado,
      centavos: sumarSiCompleto(resueltas.map((cuenta) => cuenta.saldoFinCentavos)),
    },
    origenSaldos,
    bancos,
    avisos,
  }
}

export function armarCashflow(input: {
  fecha: string
  moneda: Moneda
  saldoInicial: { fechaId: string; centavos: number } | null
  saldoCierre: { centavos: number } | null
  movimientos: MovimientoCashflow[]
  categorias: CategoriaCashflow[]
  hoy?: string
  cuentas?: CuentaCashflowRef[]
  saldosDiarios?: SaldoDiarioCashflow[]
  cierre15Anterior?: { fechaId: string; cuentas: Cierre15CuentaCashflow[] } | null
  cierre15Dia?: { cuentas: Cierre15CuentaCashflow[] } | null
}): CashflowDiario {
  const entradasBuckets = new Map<string, BucketCategoria>()
  const salidasBuckets = new Map<string, BucketCategoria>()
  let entradasCentavos = 0
  let salidasCentavos = 0

  for (const movimiento of input.movimientos) {
    if (movimiento.moneda !== input.moneda) continue
    const mapa = movimiento.tipo === 'credito' ? entradasBuckets : salidasBuckets
    if (movimiento.tipo === 'credito') entradasCentavos += movimiento.montoCentavos
    else salidasCentavos += movimiento.montoCentavos
    const key = movimiento.categoriaId ?? '__sin_categoria__'
    let bucket = mapa.get(key)
    if (!bucket) {
      bucket = bucketPara(movimiento, input.categorias)
      mapa.set(key, bucket)
    }
    bucket.centavos += movimiento.montoCentavos
    sumarDetalle(bucket, movimiento)
  }

  const grupos = {
    entradasCentavos,
    salidasCentavos,
    entradas: desgloseGrupos(entradasBuckets, entradasCentavos),
    salidas: desgloseGrupos(salidasBuckets, salidasCentavos),
  }

  const cuentasMoneda = (input.cuentas ?? []).filter((cuenta) => cuenta.moneda === input.moneda)
  if (cuentasMoneda.length === 0) {
    const saldoFinal = input.saldoCierre
      ? { estado: 'cerrado' as const, centavos: input.saldoCierre.centavos }
      : {
          estado: 'pendiente' as const,
          centavos:
            input.saldoInicial == null
              ? null
              : input.saldoInicial.centavos + entradasCentavos - salidasCentavos,
        }
    return {
      fecha: input.fecha,
      moneda: input.moneda,
      saldoInicial: input.saldoInicial,
      saldoFinal,
      origenSaldos: 'cierre15',
      bancos: [],
      avisos: [],
      ...grupos,
    }
  }

  const saldosPorCuenta = armarSaldosPorCuenta({
    fecha: input.fecha,
    hoy: input.hoy ?? '',
    moneda: input.moneda,
    cuentas: cuentasMoneda,
    saldosDiarios: input.saldosDiarios ?? [],
    cierre15Anterior: input.cierre15Anterior ?? null,
    cierre15Dia: input.cierre15Dia ?? null,
    movimientos: input.movimientos,
  })

  // Lo que el banco todavía no detalló (avisos) se suma a Entró/Salió para que
  // Arrancamos + Entró − Salió siga dando Terminamos, sin número "de menos".
  const ajusteFaltante = saldosPorCuenta.avisos.reduce(
    (ajuste, aviso) => {
      if (aviso.faltanteCentavos < 0) ajuste.salidasCentavos += -aviso.faltanteCentavos
      else ajuste.entradasCentavos += aviso.faltanteCentavos
      return ajuste
    },
    { entradasCentavos: 0, salidasCentavos: 0 },
  )

  return {
    fecha: input.fecha,
    moneda: input.moneda,
    ...grupos,
    entradasCentavos: grupos.entradasCentavos + ajusteFaltante.entradasCentavos,
    salidasCentavos: grupos.salidasCentavos + ajusteFaltante.salidasCentavos,
    ...saldosPorCuenta,
  }
}
