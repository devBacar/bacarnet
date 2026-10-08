import { sumarDias } from '../../hoy/domain/hoy.fechas.js'
import {
  CATEGORIA_IMPUESTO_AL_CHEQUE,
  DIAS_PROXIMOS,
  DIAS_VARIACION_SALDO,
  GRUPO_A_REVISAR,
  GRUPO_GASTOS_BANCARIOS,
  GRUPO_INVERSIONES,
  GRUPO_MOVIMIENTOS_INTERNOS,
  MESES_EN_GRAFICO,
  SIN_BANCO,
  SIN_CATEGORIA,
} from './constantes.js'
import { habilEnODespues, habilSiguiente, lunesDe, sumarDiasCalendario } from './diasHabiles.js'
import { mesDeFecha, mesesHasta, sumarMeses } from './fechas.js'

export type MonedaTablero = 'ARS' | 'USD'

export type FormaCheque = 'fisico' | 'echeq'

export interface MovimientoTablero {
  fechaProceso: string
  montoCentavos: number
  tipo: 'credito' | 'debito'
  categoriaId: string | null
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
  numero: string
  forma: FormaCheque | null
  banco: string
  contraparte: string
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

export interface CategoriaMonto {
  nombre: string
  centavos: number
  porcentaje: number | null
  cantidad: number
}

export interface GrupoMonto {
  grupo: string
  centavos: number
  porcentaje: number | null
  /** A revisar o Sin categoría: se muestran al final y en gris. */
  faltaClasificar: boolean
  categorias: CategoriaMonto[]
}

export interface CostoCategoria {
  nombre: string
  centavos: number
  cantidad: number
}

export interface CostoBanco {
  banco: string
  centavos: number
  mesAnteriorCentavos: number
  variacionPorcentaje: number | null
  categorias: CostoCategoria[]
}

export interface ChequeVentana {
  id: string
  tipo: 'a_debitar' | 'a_cobrar'
  fechaPago: string
  fechaEfectiva: string
  banco: string
  contraparte: string
  numero: string
  forma: FormaCheque | null
  montoCentavos: number
}

export interface SemanaCheques {
  /** Primer día de esa semana dentro de la ventana (AAAA-MM-DD). */
  desde: string
  debitarCentavos: number
  acreditarCentavos: number
  netoCentavos: number
}

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
    costoBancarioMesAnteriorCentavos: number
    costoBancarioVariacionPorcentaje: number | null
  }
  porMes: Array<{ mes: string; entradasCentavos: number; salidasCentavos: number }>
  salidasPorGrupo: GrupoMonto[]
  entradasPorGrupo: GrupoMonto[]
  costoPorBanco: CostoBanco[]
  proximos30: {
    desde: string
    hasta: string
    totalADebitarCentavos: number
    totalACobrarCentavos: number
    compromisosCentavos: number
    compromisosCantidad: number
    cobrosCentavos: number
    cobrosCantidad: number
    saldoEstimadoCentavos: number
    porSemana: SemanaCheques[]
    cheques: ChequeVentana[]
  }
}

interface InfoCategoria {
  nombre: string
  grupo: string
  excluido: boolean
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
  if (!categoriaId) return { nombre: SIN_CATEGORIA, grupo: SIN_CATEGORIA, excluido: false, costo: false }
  const categoria = mapa.get(categoriaId)
  if (!categoria) return { nombre: SIN_CATEGORIA, grupo: SIN_CATEGORIA, excluido: false, costo: false }
  const grupo = categoria.grupo ?? categoria.nombre
  if (grupo === GRUPO_MOVIMIENTOS_INTERNOS || grupo === GRUPO_INVERSIONES) {
    return { nombre: categoria.nombre, grupo, excluido: true, costo: false }
  }
  const costo = grupo === GRUPO_GASTOS_BANCARIOS || categoria.nombre === CATEGORIA_IMPUESTO_AL_CHEQUE
  return { nombre: categoria.nombre, grupo, excluido: false, costo }
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
    if (info.excluido) continue
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

interface AcumCosto {
  centavos: number
  categorias: Map<string, CostoCategoria>
}

function acumularCosto(filas: MovimientoClasificado[]): Map<string, AcumCosto> {
  const mapa = new Map<string, AcumCosto>()
  for (const fila of filas) {
    if (!fila.info.costo) continue
    const banco = fila.bancoNombre.trim() || SIN_BANCO
    const acc = mapa.get(banco) ?? { centavos: 0, categorias: new Map() }
    const delta = fila.tipo === 'debito' ? fila.montoCentavos : -fila.montoCentavos
    acc.centavos += delta
    const clave = fila.categoriaId ?? fila.info.nombre
    const cat = acc.categorias.get(clave) ?? { nombre: fila.info.nombre, centavos: 0, cantidad: 0 }
    cat.centavos += delta
    cat.cantidad += 1
    acc.categorias.set(clave, cat)
    mapa.set(banco, acc)
  }
  return mapa
}

function faltaClasificar(grupo: string): boolean {
  return grupo === GRUPO_A_REVISAR || grupo === SIN_CATEGORIA
}

function compararGrupos(a: { grupo: string; centavos: number }, b: { grupo: string; centavos: number }): number {
  const peso = (grupo: string) => (grupo === SIN_CATEGORIA ? 2 : grupo === GRUPO_A_REVISAR ? 1 : 0)
  const diferencia = peso(a.grupo) - peso(b.grupo)
  if (diferencia !== 0) return diferencia
  return b.centavos - a.centavos || a.grupo.localeCompare(b.grupo, 'es')
}

function porGrupo(filas: MovimientoClasificado[], tipo: 'credito' | 'debito', total: number): GrupoMonto[] {
  const grupos = new Map<string, Map<string, { nombre: string; centavos: number; cantidad: number }>>()
  for (const fila of filas) {
    if (fila.tipo !== tipo || fila.info.costo) continue
    const categorias = grupos.get(fila.info.grupo) ?? new Map()
    const clave = fila.info.grupo === SIN_CATEGORIA ? SIN_CATEGORIA : (fila.categoriaId ?? fila.info.nombre)
    const previo = categorias.get(clave) ?? { nombre: fila.info.nombre, centavos: 0, cantidad: 0 }
    previo.centavos += fila.montoCentavos
    previo.cantidad += 1
    categorias.set(clave, previo)
    grupos.set(fila.info.grupo, categorias)
  }
  return [...grupos.entries()]
    .map(([grupo, categorias]) => {
      const lista = [...categorias.values()].sort(
        (a, b) => b.centavos - a.centavos || a.nombre.localeCompare(b.nombre, 'es'),
      )
      const centavos = lista.reduce((suma, item) => suma + item.centavos, 0)
      return {
        grupo,
        centavos,
        porcentaje: porcentaje(centavos, total),
        faltaClasificar: faltaClasificar(grupo),
        categorias: lista.map((item) => ({
          nombre: item.nombre,
          centavos: item.centavos,
          porcentaje: porcentaje(item.centavos, centavos),
          cantidad: item.cantidad,
        })),
      }
    })
    .filter((grupo) => grupo.centavos > 0)
    .sort(compararGrupos)
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

function mesesParaElegir(hoy: string, seleccionado: string): string[] {
  const lista = mesesHasta(mesDeFecha(hoy), MESES_EN_GRAFICO)
  if (!lista.includes(seleccionado)) lista.push(seleccionado)
  return lista.sort()
}

function armarCheques(cheques: ChequeTablero[], hoy: string, hasta: string): ChequeVentana[] {
  const enVentana = (fecha: string) => fecha >= hoy && fecha <= hasta
  const lista: ChequeVentana[] = []
  for (const cheque of cheques) {
    if (cheque.montoCentavos <= 0 || !enVentana(cheque.fechaPago)) continue
    const aDebitar =
      cheque.direccion === 'emitido' &&
      (cheque.estado === 'pendiente' || (cheque.estado === 'debitado' && cheque.fechaPago > hoy))
    const aCobrar = cheque.direccion === 'recibido' && cheque.estado === 'en_cartera'
    if (!aDebitar && !aCobrar) continue
    const tipo = aDebitar ? 'a_debitar' : 'a_cobrar'
    lista.push({
      id: cheque.id,
      tipo,
      fechaPago: cheque.fechaPago,
      fechaEfectiva: tipo === 'a_cobrar' ? habilSiguiente(cheque.fechaPago) : habilEnODespues(cheque.fechaPago),
      banco: cheque.banco.trim() || SIN_BANCO,
      contraparte: cheque.contraparte.trim() || 'Sin nombre',
      numero: cheque.numero.trim(),
      forma: cheque.forma,
      montoCentavos: cheque.montoCentavos,
    })
  }
  lista.sort(
    (a, b) =>
      a.fechaEfectiva.localeCompare(b.fechaEfectiva) ||
      a.fechaPago.localeCompare(b.fechaPago) ||
      a.numero.localeCompare(b.numero, 'es', { numeric: true }) ||
      a.id.localeCompare(b.id),
  )
  return lista
}

function armarSemanas(desde: string, hasta: string, cheques: ChequeVentana[]): SemanaCheques[] {
  const claves: string[] = []
  const fin = lunesDe(hasta)
  for (let cursor = lunesDe(desde); cursor <= fin; cursor = sumarDiasCalendario(cursor, 7)) claves.push(cursor)
  for (const cheque of cheques) {
    const lunes = lunesDe(cheque.fechaEfectiva)
    if (!claves.includes(lunes)) claves.push(lunes)
  }
  claves.sort()
  return claves.map((lunes) => {
    const domingo = sumarDiasCalendario(lunes, 6)
    let debitarCentavos = 0
    let acreditarCentavos = 0
    for (const cheque of cheques) {
      if (cheque.fechaEfectiva < lunes || cheque.fechaEfectiva > domingo) continue
      if (cheque.tipo === 'a_debitar') debitarCentavos += cheque.montoCentavos
      else acreditarCentavos += cheque.montoCentavos
    }
    return {
      desde: lunes < desde ? desde : lunes,
      debitarCentavos,
      acreditarCentavos,
      netoCentavos: acreditarCentavos - debitarCentavos,
    }
  })
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
  const costoAnterior = costoNeto(delMesAnterior)

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

  const salidasPorGrupo = porGrupo(delMes, 'debito', salidasCentavos)
  const entradasPorGrupo = porGrupo(delMes, 'credito', entradasCentavos)

  const costoActual = acumularCosto(delMes)
  const costoPrevio = acumularCosto(delMesAnterior)
  const bancos = new Set([...costoActual.keys(), ...costoPrevio.keys()])
  const costoPorBanco = [...bancos]
    .map((banco) => {
      const actual = costoActual.get(banco)
      const centavos = actual?.centavos ?? 0
      const mesAnteriorCentavos = costoPrevio.get(banco)?.centavos ?? 0
      const categorias = [...(actual?.categorias.values() ?? [])]
        .filter((categoria) => categoria.cantidad > 0)
        .sort((a, b) => b.centavos - a.centavos || a.nombre.localeCompare(b.nombre, 'es'))
      return {
        banco,
        centavos,
        mesAnteriorCentavos,
        variacionPorcentaje:
          mesAnteriorCentavos > 0 ? porcentaje(centavos - mesAnteriorCentavos, mesAnteriorCentavos) : null,
        categorias,
      }
    })
    .filter((banco) => banco.centavos !== 0 || banco.mesAnteriorCentavos !== 0)
    .sort((a, b) => b.centavos - a.centavos || a.banco.localeCompare(b.banco, 'es'))

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

  const hastaProximos = sumarDias(entrada.hoy, DIAS_PROXIMOS)
  const chequesPesos = entrada.moneda === 'ARS' ? entrada.cheques : []
  const cheques = armarCheques(chequesPesos, entrada.hoy, hastaProximos)
  const chequesContados = new Set(cheques.map((cheque) => cheque.id))
  const yaEstaEnCheque = (chequeId: string | null) => Boolean(chequeId && chequesContados.has(chequeId))
  const enVentana = (fecha: string) => fecha >= entrada.hoy && fecha <= hastaProximos

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

  const totalADebitarCentavos = cheques.reduce((suma, cheque) => suma + (cheque.tipo === 'a_debitar' ? cheque.montoCentavos : 0), 0)
  const totalACobrarCentavos = cheques.reduce((suma, cheque) => suma + (cheque.tipo === 'a_cobrar' ? cheque.montoCentavos : 0), 0)
  const compromisosCentavos = compromisos.reduce((suma, compromiso) => suma + compromiso.restanteCentavos, 0)
  const cobrosCentavos = cobros.reduce((suma, cobro) => suma + cobro.montoCentavos, 0)
  const saldoEstimadoCentavos = saldoHoyCentavos + totalACobrarCentavos + cobrosCentavos - totalADebitarCentavos - compromisosCentavos

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
      costoBancarioMesAnteriorCentavos: costoAnterior,
      costoBancarioVariacionPorcentaje:
        costoAnterior > 0 ? porcentaje(costoBancarioCentavos - costoAnterior, costoAnterior) : null,
    },
    porMes,
    salidasPorGrupo,
    entradasPorGrupo,
    costoPorBanco,
    proximos30: {
      desde: entrada.hoy,
      hasta: hastaProximos,
      totalADebitarCentavos,
      totalACobrarCentavos,
      compromisosCentavos,
      compromisosCantidad: compromisos.length,
      cobrosCentavos,
      cobrosCantidad: cobros.length,
      saldoEstimadoCentavos,
      porSemana: armarSemanas(entrada.hoy, hastaProximos, cheques),
      cheques,
    },
  }
}
