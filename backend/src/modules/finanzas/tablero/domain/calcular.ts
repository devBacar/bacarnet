import { sumarDias } from '../../hoy/domain/hoy.fechas.js'
import {
  CATEGORIA_IMPUESTO_AL_CHEQUE,
  DIAS_PROXIMOS,
  DIAS_VARIACION_SALDO,
  GRUPO_GASTOS_BANCARIOS,
  GRUPO_MOVIMIENTOS_INTERNOS,
  MESES_EN_GRAFICO,
  SIN_BANCO,
  SIN_CATEGORIA,
  SIN_IDENTIFICAR,
  CATEGORIA_SUELDOS,
  TOP_CONTRAPARTES,
  UMBRAL_CONCENTRACION_COBROS,
  UMBRAL_SUBA_COSTO_BANCARIO,
} from './constantes.js'
import { inicioMes, mesDeFecha, mesesHasta, sumarMeses, ultimoDiaMes } from './fechas.js'

export type MonedaTablero = 'ARS' | 'USD'

export interface MovimientoTablero {
  fechaProceso: string
  montoCentavos: number
  tipo: 'credito' | 'debito'
  categoriaId: string | null
  contraparteNombre: string | null
  contraparteCuit: string | null
  cuentaId: string
  bancoNombre: string
  moneda: MonedaTablero
}

export interface CategoriaTablero {
  id: string
  nombre: string
  grupo: string | null
}

export interface CuentaTablero {
  id: string
  bancoNombre: string
  moneda: MonedaTablero
  saldoActualCentavos: number
}

export interface SaldoDiarioTablero {
  cuentaId: string
  fecha: string
  saldoFinCentavos: number
  moneda: MonedaTablero
}

export interface ChequeTablero {
  id: string
  direccion: 'emitido' | 'recibido'
  estado: string
  fechaPago: string
  montoCentavos: number
  etiqueta: string
}

export interface CompromisoTablero {
  id: string
  nombre: string
  concepto: string
  fecha: string
  restanteCentavos: number
  moneda: MonedaTablero
  estado: string
  chequeId: string | null
}

export interface CobroTablero {
  id: string
  nombre: string
  fecha: string
  montoCentavos: number
  moneda: MonedaTablero
  estado: string
  chequeId: string | null
}

export interface EntradaTablero {
  mes: string
  moneda: MonedaTablero
  hoy: string
  generadoEn: string
  movimientos: MovimientoTablero[]
  categorias: CategoriaTablero[]
  cuentas: CuentaTablero[]
  saldosDiarios: SaldoDiarioTablero[]
  cheques: ChequeTablero[]
  compromisos: CompromisoTablero[]
  cobros: CobroTablero[]
}

export interface ItemTablero {
  etiqueta: string
  fecha: string
  centavos: number
}

export interface BloqueTablero {
  cantidad: number
  centavos: number
  items: ItemTablero[]
}

export interface ContraparteTablero {
  nombre: string
  centavos: number
  porcentaje: number | null
}

export type AlertaTablero =
  | { id: string; tipo: 'descubierto'; banco: string; dias: number }
  | { id: string; tipo: 'cheques_rechazados'; cantidad: number; centavos: number }
  | { id: string; tipo: 'costo_bancario'; porcentaje: number }
  | { id: string; tipo: 'salidas_mayores' }

export interface TableroFinanzas {
  mes: string
  moneda: MonedaTablero
  hoy: string
  generadoEn: string
  monedas: MonedaTablero[]
  /** Meses que se pueden elegir, del más viejo al más nuevo. */
  meses: string[]
  resumen: {
    saldoHoyCentavos: number
    saldoHace30Centavos: number | null
    variacion30Centavos: number | null
    cuentasSinSaldoPrevio: string[]
    entradasCentavos: number
    salidasCentavos: number
    costoBancarioCentavos: number
    /** Porcentaje del costo bancario sobre lo que salió. Null si no hubo salidas. */
    costoBancarioPorcentaje: number | null
  }
  porMes: Array<{ mes: string; entradasCentavos: number; salidasCentavos: number }>
  salidasPorGrupo: Array<{
    grupo: string
    centavos: number
    porcentaje: number | null
    categorias: Array<{ nombre: string; centavos: number; porcentaje: number | null }>
  }>
  costoPorBanco: Array<{
    banco: string
    centavos: number
    mesAnteriorCentavos: number
    variacionPorcentaje: number | null
  }>
  contrapartes: {
    entradas: ContraparteTablero[]
    salidas: ContraparteTablero[]
    concentracionCobros: boolean
    concentracionPorcentaje: number | null
    /** Parte del total que no tiene contraparte (no entra al ranking). */
    entradasSinIdentificarPorcentaje: number | null
    salidasSinIdentificarPorcentaje: number | null
  }
  proximos30: {
    desde: string
    hasta: string
    chequesADebitar: BloqueTablero
    chequesACobrar: BloqueTablero
    compromisos: BloqueTablero
    cobros: BloqueTablero
    saldoEstimadoCentavos: number
  }
  alertas: AlertaTablero[]
}

interface InfoCategoria {
  nombre: string
  grupo: string
  interno: boolean
  costo: boolean
}

interface MovimientoClasificado extends MovimientoTablero {
  mesMov: string
  info: InfoCategoria
}

function monedaDe(valor: string | null | undefined): MonedaTablero {
  return valor === 'USD' ? 'USD' : 'ARS'
}

/** Parte sobre total, en porcentaje con un decimal. Null si no hay total. */
export function porcentaje(parte: number, total: number): number | null {
  if (total <= 0) return null
  return Math.round((parte / total) * 1000) / 10
}

function mapaCategorias(categorias: CategoriaTablero[]): Map<string, { nombre: string; grupo: string | null }> {
  const mapa = new Map<string, { nombre: string; grupo: string | null }>()
  for (const categoria of categorias) {
    const grupo = categoria.grupo?.trim() || null
    mapa.set(categoria.id, { nombre: categoria.nombre.trim() || 'Sin nombre', grupo })
  }
  return mapa
}

function infoCategoria(
  mapa: Map<string, { nombre: string; grupo: string | null }>,
  categoriaId: string | null,
): InfoCategoria {
  if (!categoriaId) return { nombre: SIN_CATEGORIA, grupo: SIN_CATEGORIA, interno: false, costo: false }
  const categoria = mapa.get(categoriaId)
  if (!categoria) return { nombre: SIN_CATEGORIA, grupo: SIN_CATEGORIA, interno: false, costo: false }
  if (categoria.grupo === GRUPO_MOVIMIENTOS_INTERNOS) {
    return { nombre: categoria.nombre, grupo: categoria.grupo, interno: true, costo: false }
  }
  const costo = categoria.grupo === GRUPO_GASTOS_BANCARIOS || categoria.nombre === CATEGORIA_IMPUESTO_AL_CHEQUE
  return {
    nombre: categoria.nombre,
    grupo: categoria.grupo ?? categoria.nombre,
    interno: false,
    costo,
  }
}

function clasificar(entrada: EntradaTablero): MovimientoClasificado[] {
  const mapa = mapaCategorias(entrada.categorias)
  const filas: MovimientoClasificado[] = []
  for (const movimiento of entrada.movimientos) {
    if (monedaDe(movimiento.moneda) !== entrada.moneda) continue
    if (movimiento.tipo !== 'credito' && movimiento.tipo !== 'debito') continue
    if (!Number.isFinite(movimiento.montoCentavos) || movimiento.montoCentavos <= 0) continue
    if (!/^\d{4}-\d{2}-\d{2}$/.test(movimiento.fechaProceso)) continue
    const info = infoCategoria(mapa, movimiento.categoriaId)
    if (info.interno) continue
    filas.push({ ...movimiento, moneda: entrada.moneda, mesMov: mesDeFecha(movimiento.fechaProceso), info })
  }
  return filas
}

function costoNeto(filas: MovimientoClasificado[]): number {
  let total = 0
  for (const fila of filas) {
    if (!fila.info.costo) continue
    total += fila.tipo === 'debito' ? fila.montoCentavos : -fila.montoCentavos
  }
  return total
}

function costoPorBanco(filas: MovimientoClasificado[]): Map<string, number> {
  const mapa = new Map<string, number>()
  for (const fila of filas) {
    if (!fila.info.costo) continue
    const banco = fila.bancoNombre.trim() || SIN_BANCO
    const delta = fila.tipo === 'debito' ? fila.montoCentavos : -fila.montoCentavos
    mapa.set(banco, (mapa.get(banco) ?? 0) + delta)
  }
  return mapa
}

function claveContraparte(movimiento: MovimientoTablero): { clave: string; nombre: string } {
  const cuit = (movimiento.contraparteCuit ?? '').replace(/\D/g, '')
  const nombre = (movimiento.contraparteNombre ?? '').replace(/\s+/g, ' ').trim()
  if (!cuit && !nombre) return { clave: SIN_IDENTIFICAR, nombre: SIN_IDENTIFICAR }
  if (cuit) return { clave: `cuit:${cuit}`, nombre: nombre || cuit }
  return { clave: `nombre:${nombre.toLocaleLowerCase('es-AR')}`, nombre }
}

function topContrapartes(filas: MovimientoClasificado[], tipo: 'credito' | 'debito'): {
  items: ContraparteTablero[]
  concentracionPorcentaje: number | null
  concentra: boolean
  sinIdentificarPorcentaje: number | null
} {
  const mapa = new Map<string, { nombre: string; centavos: number; nombreDe: number }>()
  for (const fila of filas) {
    if (fila.tipo !== tipo) continue
    if (tipo === 'debito' && fila.info.nombre === CATEGORIA_SUELDOS) continue
    const { clave, nombre } = claveContraparte(fila)
    const previo = mapa.get(clave) ?? { nombre, centavos: 0, nombreDe: -1 }
    previo.centavos += fila.montoCentavos
    if (nombre !== SIN_IDENTIFICAR && fila.montoCentavos >= previo.nombreDe) {
      previo.nombre = nombre
      previo.nombreDe = fila.montoCentavos
    }
    mapa.set(clave, previo)
  }
  const todos = [...mapa.entries()]
  const total = todos.reduce((suma, [, item]) => suma + item.centavos, 0)
  const sinIdentificar = mapa.get(SIN_IDENTIFICAR)?.centavos ?? 0
  // "Sin identificar" no compite en el ranking ni en la concentración: se informa aparte.
  const ordenados = todos
    .filter(([clave]) => clave !== SIN_IDENTIFICAR)
    .map(([, item]) => item)
    .sort((a, b) => b.centavos - a.centavos || a.nombre.localeCompare(b.nombre, 'es'))
  const top3 = ordenados.slice(0, 3).reduce((suma, item) => suma + item.centavos, 0)
  const concentracionPorcentaje = ordenados.length > 0 ? porcentaje(top3, total) : null
  return {
    items: ordenados.slice(0, TOP_CONTRAPARTES).map((item) => ({
      nombre: item.nombre,
      centavos: item.centavos,
      porcentaje: porcentaje(item.centavos, total),
    })),
    concentracionPorcentaje,
    concentra: concentracionPorcentaje != null && concentracionPorcentaje > UMBRAL_CONCENTRACION_COBROS,
    sinIdentificarPorcentaje: total > 0 ? porcentaje(sinIdentificar, total) : null,
  }
}

function etiquetasCuentas(cuentas: CuentaTablero[]): Map<string, string> {
  const conteo = new Map<string, number>()
  for (const cuenta of cuentas) conteo.set(cuenta.bancoNombre, (conteo.get(cuenta.bancoNombre) ?? 0) + 1)
  const mapa = new Map<string, string>()
  for (const cuenta of cuentas) {
    const repetido = (conteo.get(cuenta.bancoNombre) ?? 0) > 1
    mapa.set(cuenta.id, repetido ? `${cuenta.bancoNombre} (${cuenta.id})` : cuenta.bancoNombre)
  }
  return mapa
}

function ordenarItems(items: ItemTablero[]): ItemTablero[] {
  return [...items].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.etiqueta.localeCompare(b.etiqueta, 'es'))
}

function bloque(items: ItemTablero[]): BloqueTablero {
  const ordenados = ordenarItems(items)
  return {
    cantidad: ordenados.length,
    centavos: ordenados.reduce((suma, item) => suma + item.centavos, 0),
    items: ordenados,
  }
}

function mesesParaElegir(hoy: string, seleccionado: string): string[] {
  const lista = mesesHasta(mesDeFecha(hoy), MESES_EN_GRAFICO)
  if (!lista.includes(seleccionado)) lista.push(seleccionado)
  return lista.sort()
}

export function armarTablero(entrada: EntradaTablero): TableroFinanzas {
  const filas = clasificar(entrada)
  const mesTope = mesDeFecha(entrada.hoy)
  const finVentana = entrada.mes > mesTope ? entrada.mes : mesTope
  const ventana = new Set(mesesHasta(finVentana, MESES_EN_GRAFICO))
  const delMes = filas.filter((fila) => fila.mesMov === entrada.mes)
  const mesAnterior = sumarMeses(entrada.mes, -1)
  const delMesAnterior = filas.filter((fila) => fila.mesMov === mesAnterior)
  const deVentana = filas.filter((fila) => ventana.has(fila.mesMov))

  const entradasCentavos = delMes.reduce((suma, fila) => suma + (fila.tipo === 'credito' ? fila.montoCentavos : 0), 0)
  const salidasCentavos = delMes.reduce((suma, fila) => suma + (fila.tipo === 'debito' ? fila.montoCentavos : 0), 0)
  const costoBancarioCentavos = costoNeto(delMes)

  const porMesMapa = new Map<string, { entradasCentavos: number; salidasCentavos: number }>()
  for (const fila of deVentana) {
    const acc = porMesMapa.get(fila.mesMov) ?? { entradasCentavos: 0, salidasCentavos: 0 }
    if (fila.tipo === 'credito') acc.entradasCentavos += fila.montoCentavos
    else acc.salidasCentavos += fila.montoCentavos
    porMesMapa.set(fila.mesMov, acc)
  }
  const porMes = [...porMesMapa.entries()]
    .filter(([, valor]) => valor.entradasCentavos > 0 || valor.salidasCentavos > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, valor]) => ({ mes, ...valor }))

  const grupos = new Map<string, Map<string, { nombre: string; centavos: number }>>()
  for (const fila of delMes) {
    if (fila.tipo !== 'debito') continue
    const categorias = grupos.get(fila.info.grupo) ?? new Map()
    const clave = fila.info.grupo === SIN_CATEGORIA ? SIN_CATEGORIA : (fila.categoriaId ?? fila.info.nombre)
    const previo = categorias.get(clave) ?? { nombre: fila.info.nombre, centavos: 0 }
    previo.centavos += fila.montoCentavos
    categorias.set(clave, previo)
    grupos.set(fila.info.grupo, categorias)
  }
  const salidasPorGrupo = [...grupos.entries()]
    .map(([grupo, categorias]) => {
      const lista = [...categorias.values()].sort(
        (a, b) => b.centavos - a.centavos || a.nombre.localeCompare(b.nombre, 'es'),
      )
      const centavos = lista.reduce((suma, item) => suma + item.centavos, 0)
      return {
        grupo,
        centavos,
        porcentaje: porcentaje(centavos, salidasCentavos),
        categorias: lista.map((item) => ({
          nombre: item.nombre,
          centavos: item.centavos,
          porcentaje: porcentaje(item.centavos, centavos),
        })),
      }
    })
    .filter((grupo) => grupo.centavos > 0)
    .sort((a, b) => b.centavos - a.centavos || a.grupo.localeCompare(b.grupo, 'es'))

  const costoActual = costoPorBanco(delMes)
  const costoPrevio = costoPorBanco(delMesAnterior)
  const bancos = new Set([...costoActual.keys(), ...costoPrevio.keys()])
  const costoPorBancoLista = [...bancos]
    .map((banco) => {
      const centavos = costoActual.get(banco) ?? 0
      const mesAnteriorCentavos = costoPrevio.get(banco) ?? 0
      return {
        banco,
        centavos,
        mesAnteriorCentavos,
        variacionPorcentaje:
          mesAnteriorCentavos > 0 ? porcentaje(centavos - mesAnteriorCentavos, mesAnteriorCentavos) : null,
      }
    })
    .filter((banco) => banco.centavos !== 0 || banco.mesAnteriorCentavos !== 0)
    .sort((a, b) => b.centavos - a.centavos || a.banco.localeCompare(b.banco, 'es'))

  const entradasTop = topContrapartes(delMes, 'credito')
  const salidasTop = topContrapartes(delMes, 'debito')

  const cuentasMoneda = entrada.cuentas.filter((cuenta) => monedaDe(cuenta.moneda) === entrada.moneda)
  const nombres = etiquetasCuentas(cuentasMoneda)
  const saldoHoyCentavos = cuentasMoneda.reduce(
    (suma, cuenta) => suma + (Number.isFinite(cuenta.saldoActualCentavos) ? cuenta.saldoActualCentavos : 0),
    0,
  )
  const fechaPrevia = sumarDias(entrada.hoy, -DIAS_VARIACION_SALDO)
  const saldoPrevio = new Map<string, number>()
  for (const saldo of entrada.saldosDiarios) {
    if (monedaDe(saldo.moneda) !== entrada.moneda) continue
    if (saldo.fecha !== fechaPrevia) continue
    if (!nombres.has(saldo.cuentaId)) continue
    if (!Number.isFinite(saldo.saldoFinCentavos)) continue
    saldoPrevio.set(saldo.cuentaId, saldo.saldoFinCentavos)
  }
  const cuentasSinSaldoPrevio = cuentasMoneda
    .filter((cuenta) => !saldoPrevio.has(cuenta.id))
    .map((cuenta) => nombres.get(cuenta.id) ?? cuenta.bancoNombre)
  const hayComparacion = cuentasMoneda.length === 0 || cuentasSinSaldoPrevio.length === 0
  const saldoHace30Centavos = hayComparacion
    ? cuentasMoneda.reduce((suma, cuenta) => suma + (saldoPrevio.get(cuenta.id) ?? 0), 0)
    : null
  const variacion30Centavos = saldoHace30Centavos == null ? null : saldoHoyCentavos - saldoHace30Centavos

  const desdeMes = inicioMes(entrada.mes)
  const hastaMes = ultimoDiaMes(entrada.mes)
  const diasNegativos = new Map<string, Set<string>>()
  for (const saldo of entrada.saldosDiarios) {
    if (monedaDe(saldo.moneda) !== entrada.moneda) continue
    if (!nombres.has(saldo.cuentaId)) continue
    if (saldo.fecha < desdeMes || saldo.fecha > hastaMes) continue
    if (saldo.saldoFinCentavos >= 0) continue
    const dias = diasNegativos.get(saldo.cuentaId) ?? new Set()
    dias.add(saldo.fecha)
    diasNegativos.set(saldo.cuentaId, dias)
  }

  const hastaProximos = sumarDias(entrada.hoy, DIAS_PROXIMOS)
  const enVentana = (fecha: string) => fecha >= entrada.hoy && fecha <= hastaProximos
  const chequesPesos = entrada.moneda === 'ARS' ? entrada.cheques : []
  const aDebitar = chequesPesos.filter(
    // Un cheque propio no se puede debitar antes de su fecha de pago: si figura "debitado" con fecha futura, sigue por debitar.
    (cheque) =>
      cheque.direccion === 'emitido' &&
      (cheque.estado === 'pendiente' || (cheque.estado === 'debitado' && cheque.fechaPago > entrada.hoy)) &&
      enVentana(cheque.fechaPago) &&
      cheque.montoCentavos > 0,
  )
  const aCobrar = chequesPesos.filter(
    (cheque) =>
      cheque.direccion === 'recibido' && cheque.estado === 'en_cartera' && enVentana(cheque.fechaPago) && cheque.montoCentavos > 0,
  )
  const chequesContados = new Set([...aDebitar, ...aCobrar].map((cheque) => cheque.id))
  const yaEstaEnCheque = (chequeId: string | null) => Boolean(chequeId && chequesContados.has(chequeId))

  const compromisos = entrada.compromisos.filter(
    (compromiso) =>
      monedaDe(compromiso.moneda) === entrada.moneda &&
      compromiso.estado !== 'pagado' &&
      compromiso.restanteCentavos > 0 &&
      enVentana(compromiso.fecha) &&
      !yaEstaEnCheque(compromiso.chequeId),
  )
  const cobros = entrada.cobros.filter(
    (cobro) =>
      monedaDe(cobro.moneda) === entrada.moneda &&
      cobro.estado === 'esperado' &&
      cobro.montoCentavos > 0 &&
      enVentana(cobro.fecha) &&
      !yaEstaEnCheque(cobro.chequeId),
  )

  const chequesADebitar = bloque(aDebitar.map((cheque) => ({ etiqueta: cheque.etiqueta, fecha: cheque.fechaPago, centavos: cheque.montoCentavos })))
  const chequesACobrar = bloque(aCobrar.map((cheque) => ({ etiqueta: cheque.etiqueta, fecha: cheque.fechaPago, centavos: cheque.montoCentavos })))
  const bloqueCompromisos = bloque(
    compromisos.map((compromiso) => ({
      etiqueta: compromiso.concepto && compromiso.concepto !== compromiso.nombre ? `${compromiso.nombre} · ${compromiso.concepto}` : compromiso.nombre,
      fecha: compromiso.fecha,
      centavos: compromiso.restanteCentavos,
    })),
  )
  const bloqueCobros = bloque(cobros.map((cobro) => ({ etiqueta: cobro.nombre, fecha: cobro.fecha, centavos: cobro.montoCentavos })))
  const saldoEstimadoCentavos = saldoHoyCentavos + chequesACobrar.centavos + bloqueCobros.centavos - chequesADebitar.centavos - bloqueCompromisos.centavos

  const rechazados =
    entrada.moneda === 'ARS'
      ? entrada.cheques.filter(
          (cheque) => cheque.estado === 'rechazado' && cheque.fechaPago >= desdeMes && cheque.fechaPago <= hastaMes && cheque.montoCentavos > 0,
        )
      : []

  const costoAnterior = costoNeto(delMesAnterior)
  const variacionCosto = costoAnterior > 0 ? porcentaje(costoBancarioCentavos - costoAnterior, costoAnterior) : null

  const alertas: AlertaTablero[] = []
  const descubiertos = cuentasMoneda
    .map((cuenta) => ({ banco: nombres.get(cuenta.id) ?? cuenta.bancoNombre, dias: diasNegativos.get(cuenta.id)?.size ?? 0, id: cuenta.id }))
    .filter((cuenta) => cuenta.dias > 0)
    .sort((a, b) => b.dias - a.dias || a.banco.localeCompare(b.banco, 'es'))
  for (const cuenta of descubiertos) {
    alertas.push({ id: `descubierto-${cuenta.id}`, tipo: 'descubierto', banco: cuenta.banco, dias: cuenta.dias })
  }
  if (rechazados.length > 0) {
    alertas.push({
      id: 'cheques-rechazados',
      tipo: 'cheques_rechazados',
      cantidad: rechazados.length,
      centavos: rechazados.reduce((suma, cheque) => suma + cheque.montoCentavos, 0),
    })
  }
  if (variacionCosto != null && variacionCosto > UMBRAL_SUBA_COSTO_BANCARIO) {
    alertas.push({ id: 'costo-bancario', tipo: 'costo_bancario', porcentaje: variacionCosto })
  }
  if (salidasCentavos > entradasCentavos) {
    alertas.push({ id: 'salidas-mayores', tipo: 'salidas_mayores' })
  }

  const hayUsd =
    entrada.cuentas.some((cuenta) => cuenta.moneda === 'USD') || entrada.movimientos.some((movimiento) => movimiento.moneda === 'USD')

  return {
    mes: entrada.mes,
    moneda: entrada.moneda,
    hoy: entrada.hoy,
    generadoEn: entrada.generadoEn,
    monedas: hayUsd ? ['ARS', 'USD'] : ['ARS'],
    meses: mesesParaElegir(entrada.hoy, entrada.mes),
    resumen: {
      saldoHoyCentavos,
      saldoHace30Centavos,
      variacion30Centavos,
      cuentasSinSaldoPrevio,
      entradasCentavos,
      salidasCentavos,
      costoBancarioCentavos,
      costoBancarioPorcentaje: porcentaje(costoBancarioCentavos, salidasCentavos),
    },
    porMes,
    salidasPorGrupo,
    costoPorBanco: costoPorBancoLista,
    contrapartes: {
      entradas: entradasTop.items,
      salidas: salidasTop.items,
      concentracionCobros: entradasTop.concentra,
      concentracionPorcentaje: entradasTop.concentracionPorcentaje,
      entradasSinIdentificarPorcentaje: entradasTop.sinIdentificarPorcentaje,
      salidasSinIdentificarPorcentaje: salidasTop.sinIdentificarPorcentaje,
    },
    proximos30: {
      desde: entrada.hoy,
      hasta: hastaProximos,
      chequesADebitar,
      chequesACobrar,
      compromisos: bloqueCompromisos,
      cobros: bloqueCobros,
      saldoEstimadoCentavos,
    },
    alertas,
  }
}
