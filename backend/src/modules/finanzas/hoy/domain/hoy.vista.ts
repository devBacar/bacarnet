import { presentarEstadoInterbanking } from '../../transferencias/domain/estado-interbanking.js'
import { armarChequesADebitar, chequesParaLaSemana, chequesQueVencenHoy } from './cheques-hoy.js'
import {
  diasEntre,
  etiquetaDia,
  fechaHoyArgentina,
  formatoPesos,
  formatoPesosCorto,
  nombreDia,
  proximosDiasHabiles,
  saludoDelDia,
  sumarDias,
  textoHaceDias,
} from './hoy.fechas.js'
import type {
  ArmarHoyInput,
  BancoFilaHoy,
  ChequeEnHoy,
  CobroAtrasadoHoy,
  CobroHoy,
  CompromisoHoy,
  FirmasHoy,
  HoyVista,
  IngresoFilaHoy,
  MovimientoHoy,
  PagoFilaHoy,
  SemanaFilaHoy,
  SugerenciaBanco,
  UrgenciaHoy,
} from './hoy.tipos.js'

const ORDEN_BANCOS = ['Julio', 'Patagonia', 'Córdoba']
const HORAS_SIN_FIRMA = 2

const URGENCIA_LABEL: Record<Exclude<UrgenciaHoy, null>, string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
}

const MEDIO_LABEL = {
  transferencia: 'Por banco',
  efectivo: 'En efectivo',
  cheque: 'Con cheque',
} as const

function digitos(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

function incluye(haystack: string | null | undefined, needle: string | null | undefined): boolean {
  const buscado = (needle ?? '').trim().toLowerCase()
  if (!buscado) return true
  return (haystack ?? '').toLowerCase().includes(buscado)
}

function conceptoCobro(cobro: CobroHoy): string {
  const concepto = cobro.concepto?.trim()
  return concepto || cobro.clienteONombre
}

export function textoReclamo(input: { concepto: string; montoCentavos: number }): string {
  const monto = formatoPesos(input.montoCentavos)
  return `Hola, te escribo de Bacar por el pago de ${input.concepto} por ${monto} que esperábamos para hoy. ¿Nos podés confirmar cuándo lo vemos? Gracias.`
}

function compromisoAbierto(estado: CompromisoHoy['estado']): boolean {
  return estado === 'pendiente' || estado === 'vencido'
}

export function creditoConfirmaCobro(cobro: CobroHoy, movimiento: MovimientoHoy, hoy: string): boolean {
  if (cobro.estado !== 'esperado') return false
  if (movimiento.reservado || movimiento.tipo !== 'credito') return false
  if (movimiento.fechaProceso !== hoy) return false
  if (movimiento.montoCentavos !== cobro.montoCentavos) return false
  const cuit = digitos(cobro.cuit)
  if (cuit && digitos(movimiento.customerCuit) !== cuit) return false
  if (cobro.contraparte?.trim()) {
    const ok =
      incluye(movimiento.depositorDescription, cobro.contraparte) ||
      incluye(movimiento.descripcion, cobro.contraparte)
    if (!ok) return false
  }
  return true
}

export function emparejarCobrosConCreditos(
  cobros: CobroHoy[],
  movimientos: MovimientoHoy[],
  hoy: string,
): Map<string, MovimientoHoy> {
  const usados = new Set<string>()
  const creditos = movimientos
    .filter((mov) => mov.tipo === 'credito' && mov.fechaProceso === hoy && !mov.reservado)
    .sort((a, b) => a.id.localeCompare(b.id))
  const ordenados = [...cobros].sort((a, b) => {
    if (a.fechaEsperada !== b.fechaEsperada) return a.fechaEsperada.localeCompare(b.fechaEsperada)
    return a.id.localeCompare(b.id)
  })
  const asignados = new Map<string, MovimientoHoy>()
  for (const cobro of ordenados) {
    const match = creditos.find((mov) => !usados.has(mov.id) && creditoConfirmaCobro(cobro, mov, hoy))
    if (!match) continue
    usados.add(match.id)
    asignados.set(cobro.id, match)
  }
  return asignados
}

export function sugerirDebitos(
  montoCentavos: number,
  movimientos: MovimientoHoy[],
  hoy: string,
  cuentaId: string | null,
): SugerenciaBanco[] {
  const desde = sumarDias(hoy, -4)
  const candidatos = movimientos
    .filter(
      (mov) =>
        mov.tipo === 'debito' &&
        !mov.reservado &&
        mov.montoCentavos === montoCentavos &&
        mov.fechaProceso >= desde &&
        mov.fechaProceso <= hoy,
    )
    .sort((a, b) => {
      const cuentaA = cuentaId && a.cuentaId === cuentaId ? 0 : 1
      const cuentaB = cuentaId && b.cuentaId === cuentaId ? 0 : 1
      if (cuentaA !== cuentaB) return cuentaA - cuentaB
      if (a.fechaProceso !== b.fechaProceso) return b.fechaProceso.localeCompare(a.fechaProceso)
      return a.id.localeCompare(b.id)
    })
  return candidatos.slice(0, 3).map((mov) => ({
    id: mov.id,
    bancoNombre: mov.bancoNombre,
    fecha: mov.fechaProceso,
    descripcion: mov.descripcion,
    montoCentavos: mov.montoCentavos,
    cuentaId: mov.cuentaId,
  }))
}

function rankUrgencia(urgencia: UrgenciaHoy): number {
  if (urgencia === 'alta') return 0
  if (urgencia === 'media') return 1
  if (urgencia === 'baja') return 2
  return 3
}

function filaPago(row: CompromisoHoy, hoy: string, movimientos: MovimientoHoy[]): PagoFilaHoy {
  const dias = row.fechaVencimiento < hoy && !row.sinFecha ? diasEntre(row.fechaVencimiento, hoy) : 0
  return {
    id: row.id,
    urgencia: row.urgencia ? URGENCIA_LABEL[row.urgencia] : 'Normal',
    vencido: dias > 0,
    vencidoTexto: dias > 0 ? textoHaceDias(dias, true) : null,
    diasAtraso: dias,
    aQuien: row.proveedorONombre,
    concepto: row.concepto,
    montoCentavos: row.montoCentavos,
    comoPagar: MEDIO_LABEL[row.medioPago],
    medioPago: row.medioPago,
    proveedorONombre: row.proveedorONombre,
    sugerenciasBanco: sugerirDebitos(row.montoCentavos, movimientos, hoy, row.cuentaId),
    ...(row.estimada ? { estimada: true } : {}),
  }
}

const porUrgenciaYNombre = (a: CompromisoHoy, b: CompromisoHoy) => {
  const urgencia = rankUrgencia(a.urgencia) - rankUrgencia(b.urgencia)
  if (urgencia !== 0) return urgencia
  return a.proveedorONombre.localeCompare(b.proveedorONombre, 'es')
}

/** Pagos de hoy: solo lo que vence hoy (lo atrasado va aparte y no suma en el día). */
export function seleccionarPagos(compromisos: CompromisoHoy[], hoy: string, movimientos: MovimientoHoy[]): PagoFilaHoy[] {
  return compromisos
    .filter((row) => compromisoAbierto(row.estado) && !row.sinFecha && row.fechaVencimiento === hoy && row.montoCentavos > 0)
    .sort(porUrgenciaYNombre)
    .map((row) => filaPago(row, hoy, movimientos))
}

/**
 * Pagos atrasados: vencimiento ya pasado. Primero los más recientes.
 * Solo por transferencia: lo que se paga con cheque o efectivo se resuelve en Compromisos de la semana.
 */
export function seleccionarPagosAtrasados(compromisos: CompromisoHoy[], hoy: string, movimientos: MovimientoHoy[]): PagoFilaHoy[] {
  return compromisos
    .filter(
      (row) =>
        compromisoAbierto(row.estado) &&
        !row.sinFecha &&
        row.fechaVencimiento < hoy &&
        row.montoCentavos > 0 &&
        row.medioPago === 'transferencia',
    )
    .sort((a, b) => b.fechaVencimiento.localeCompare(a.fechaVencimiento) || porUrgenciaYNombre(a, b))
    .map((row) => filaPago(row, hoy, movimientos))
}

/** Facturas sin vencimiento en Vientri: esperan que Finanzas les ponga el día de pago. */
export function seleccionarPagosSinFecha(compromisos: CompromisoHoy[], hoy: string, movimientos: MovimientoHoy[]): PagoFilaHoy[] {
  return compromisos
    .filter((row) => compromisoAbierto(row.estado) && row.sinFecha === true && row.montoCentavos > 0)
    .sort((a, b) => b.montoCentavos - a.montoCentavos)
    .map((row) => filaPago(row, hoy, movimientos))
}

export function seleccionarIngresos(
  cobros: CobroHoy[],
  movimientos: MovimientoHoy[],
  hoy: string,
): { filas: IngresoFilaHoy[]; llegados: Set<string> } {
  // Se buscan créditos para todo lo esperado hasta hoy (también lo atrasado), pero en "Cobros de hoy"
  // se muestra lo de hoy y lo atrasado que ya llegó. Lo atrasado que no llegó va en la lista de atrasados.
  const esperados = cobros.filter((row) => row.estado === 'esperado' && !row.sinFecha && row.fechaEsperada <= hoy)
  const asignados = emparejarCobrosConCreditos(esperados, movimientos, hoy)
  esperados.sort((a, b) => {
    const atrasadoA = a.fechaEsperada < hoy ? 0 : 1
    const atrasadoB = b.fechaEsperada < hoy ? 0 : 1
    if (atrasadoA !== atrasadoB) return atrasadoA - atrasadoB
    return a.fechaEsperada.localeCompare(b.fechaEsperada)
  })
  const filas = esperados.map((row) => {
    const dias = row.fechaEsperada < hoy ? diasEntre(row.fechaEsperada, hoy) : 0
    const match = asignados.get(row.id) ?? null
    const concepto = conceptoCobro(row)
    return {
      id: row.id,
      cliente: row.clienteONombre,
      concepto,
      montoCentavos: row.montoCentavos,
      atrasado: dias > 0,
      atrasadoTexto: dias > 0 ? textoHaceDias(dias, true) : null,
      email: row.email?.trim() || null,
      llego: Boolean(match),
      bancoNombre: match?.bancoNombre ?? null,
      movimientoId: match?.id ?? null,
      cuentaId: match?.cuentaId ?? null,
      textoReclamo: textoReclamo({ concepto, montoCentavos: row.montoCentavos }),
      ...(row.estimada ? { estimada: true } : {}),
    }
  })
  return {
    filas: filas.filter((fila) => !fila.atrasado || fila.llego),
    llegados: new Set(asignados.keys()),
  }
}

export function agruparBancos(cuentas: ArmarHoyInput['cuentas']): BancoFilaHoy[] {
  const porBanco = new Map<string, BancoFilaHoy>()
  for (const cuenta of cuentas) {
    if (cuenta.moneda !== 'ARS' || cuenta.tipo !== 'CC') continue
    const actual = porBanco.get(cuenta.bancoNombre) ?? {
      bancoNombre: cuenta.bancoNombre,
      saldoAhoraCentavos: 0,
      descubiertoCentavos: null,
      quedaParaUsarCentavos: 0,
    }
    actual.saldoAhoraCentavos += cuenta.saldoActualCentavos
    if (cuenta.descubiertoCentavos != null) {
      actual.descubiertoCentavos = (actual.descubiertoCentavos ?? 0) + cuenta.descubiertoCentavos
    }
    porBanco.set(cuenta.bancoNombre, actual)
  }
  const nombres = [
    ...ORDEN_BANCOS.filter((nombre) => porBanco.has(nombre)),
    ...[...porBanco.keys()]
      .filter((nombre) => !ORDEN_BANCOS.includes(nombre))
      .sort((a, b) => a.localeCompare(b, 'es')),
  ]
  return nombres.map((nombre) => {
    const banco = porBanco.get(nombre)!
    return {
      ...banco,
      quedaParaUsarCentavos: banco.saldoAhoraCentavos + (banco.descubiertoCentavos ?? 0),
    }
  })
}

export function avisoDescubierto(bancos: BancoFilaHoy[], pagosCentavos: number): string | null {
  if (pagosCentavos <= 0) return null
  const excedidos = bancos
    .filter((banco) => banco.descubiertoCentavos != null && pagosCentavos > banco.quedaParaUsarCentavos)
    .sort((a, b) => pagosCentavos - b.quedaParaUsarCentavos - (pagosCentavos - a.quedaParaUsarCentavos))
  const peor = excedidos[0]
  if (!peor) return null
  const exceso = pagosCentavos - peor.quedaParaUsarCentavos
  let texto = `Ojo: si pagás todo desde ${peor.bancoNombre}, te pasás ${formatoPesosCorto(exceso)} del descubierto.`
  const otros = bancos
    .filter((banco) => banco.bancoNombre !== peor.bancoNombre)
    .sort((a, b) => b.quedaParaUsarCentavos - a.quedaParaUsarCentavos)
  const sugerido = otros[0]
  if (sugerido) {
    texto +=
      sugerido.quedaParaUsarCentavos >= pagosCentavos
        ? ` Pagá desde ${sugerido.bancoNombre}, que tiene margen.`
        : ` El que más margen tiene es ${sugerido.bancoNombre}.`
  }
  return texto
}

function diaDestino(fecha: string, dias: string[]): string | null {
  const primero = dias[0]
  if (!primero) return null
  if (fecha <= primero) return primero
  if (dias.includes(fecha)) return fecha
  return dias.find((dia) => dia >= fecha) ?? null
}

export function armarSemana(input: {
  hoy: string
  saldoInicialCentavos: number
  compromisos: CompromisoHoy[]
  cobros: CobroHoy[]
  cobrosYaLlegados: Set<string>
  cheques: ChequeEnHoy[]
}): { filas: SemanaFilaHoy[] | null; diaMasPesado: string | null } {
  const dias = proximosDiasHabiles(input.hoy, 7)
  const pagar = new Map(dias.map((dia) => [dia, 0]))
  const cobrar = new Map(dias.map((dia) => [dia, 0]))

  for (const row of input.compromisos) {
    if (!compromisoAbierto(row.estado) || row.sinFecha || row.fechaVencimiento < input.hoy) continue
    const destino = diaDestino(row.fechaVencimiento, dias)
    if (!destino) continue
    pagar.set(destino, (pagar.get(destino) ?? 0) + row.montoCentavos)
  }
  for (const cheque of chequesParaLaSemana(input.cheques, input.hoy)) {
    const destino = diaDestino(cheque.fechaPago, dias)
    if (!destino) continue
    pagar.set(destino, (pagar.get(destino) ?? 0) + cheque.montoCentavos)
  }
  for (const row of input.cobros) {
    if (row.estado !== 'esperado' || input.cobrosYaLlegados.has(row.id) || row.sinFecha || row.fechaEsperada < input.hoy) continue
    const destino = diaDestino(row.fechaEsperada, dias)
    if (!destino) continue
    cobrar.set(destino, (cobrar.get(destino) ?? 0) + row.montoCentavos)
  }

  let queda = input.saldoInicialCentavos
  const filas: SemanaFilaHoy[] = dias.map((fecha) => {
    const aPagarCentavos = pagar.get(fecha) ?? 0
    const aCobrarCentavos = cobrar.get(fecha) ?? 0
    queda = queda - aPagarCentavos + aCobrarCentavos
    return {
      fecha,
      dia: etiquetaDia(fecha),
      aPagarCentavos,
      aCobrarCentavos,
      quedaCentavos: queda,
      esElMasPesado: false,
    }
  })

  const hayMovimiento = filas.some((fila) => fila.aPagarCentavos > 0 || fila.aCobrarCentavos > 0)
  if (!hayMovimiento) return { filas: null, diaMasPesado: null }

  let pesado = filas[0]!
  for (const fila of filas) {
    if (fila.aPagarCentavos > pesado.aPagarCentavos) pesado = fila
  }
  if (pesado.aPagarCentavos > 0) {
    pesado.esElMasPesado = true
    return {
      filas,
      diaMasPesado: `El ${nombreDia(pesado.fecha)} es el día más pesado: pagás ${formatoPesos(pesado.aPagarCentavos)}.`,
    }
  }
  return { filas, diaMasPesado: null }
}

export function listarCobrosAtrasados(cobros: CobroHoy[], hoy: string, yaLlegados: Set<string>): CobroAtrasadoHoy[] {
  return cobros
    .filter((row) => row.estado === 'esperado' && !yaLlegados.has(row.id) && !row.sinFecha && row.fechaEsperada < hoy)
    .map((row) => ({ row, dias: diasEntre(row.fechaEsperada, hoy) }))
    .filter((item) => item.dias > 0)
    .sort((a, b) => b.row.montoCentavos - a.row.montoCentavos)
    .map(({ row, dias }) => {
      const concepto = conceptoCobro(row)
      return {
        id: row.id,
        cliente: row.clienteONombre,
        concepto,
        montoCentavos: row.montoCentavos,
        haceDias: dias,
        haceTexto: textoHaceDias(dias, false),
        email: row.email?.trim() || null,
        textoReclamo: textoReclamo({ concepto, montoCentavos: row.montoCentavos }),
        ...(row.estimada ? { estimada: true } : {}),
      }
    })
}

export function transferenciasSinFirmar(transferencias: ArmarHoyInput['transferencias'], now: Date): FirmasHoy | null {
  const limite = now.getTime() - HORAS_SIN_FIRMA * 60 * 60 * 1000
  const pendientes = transferencias.filter((row) => {
    if (row.estado === 'rechazada' || row.estado === 'cancelada' || row.estado === 'efectivizada') {
      return false
    }
    const presentacion = presentarEstadoInterbanking({
      estado: row.estadoInterbanking,
      fechaSolicitud: row.fechaSolicitud,
      now,
    })
    const faltaFirmar = presentacion?.rotulo === 'Falta firmar'
    const todaviaSinEstado = !row.estadoInterbanking?.trim() && row.estado === 'confeccionada'
    if (!faltaFirmar && !todaviaSinEstado) return false
    const fecha = row.estadoInterbankingActualizadoAt ?? row.fechaConfeccion
    if (!fecha) return false
    const marca = Date.parse(fecha)
    return Number.isFinite(marca) && marca <= limite
  })
  if (pendientes.length === 0) return null
  const montoCentavos = pendientes.reduce((total, row) => total + row.montoCentavos, 0)
  const cantidad = pendientes.length
  const texto =
    cantidad === 1
      ? `Avisá a los firmantes: hay 1 transferencia esperando firma por ${formatoPesos(montoCentavos)}.`
      : `Avisá a los firmantes: hay ${cantidad} transferencias esperando firma por ${formatoPesos(montoCentavos)}.`
  return { cantidad, montoCentavos, texto }
}

export function armarVistaHoy(input: ArmarHoyInput): HoyVista {
  const hoy = fechaHoyArgentina(input.now)
  const pagos = seleccionarPagos(input.compromisos, hoy, input.movimientos)
  const pagosAtrasados = seleccionarPagosAtrasados(input.compromisos, hoy, input.movimientos)
  const pagosSinFecha = seleccionarPagosSinFecha(input.compromisos, hoy, input.movimientos)
  const cobrosSinFecha = input.cobros.filter((row) => row.estado === 'esperado' && row.sinFecha)
  const suma = (filas: Array<{ montoCentavos: number }>) => filas.reduce((total, fila) => total + fila.montoCentavos, 0)
  const ingresos = seleccionarIngresos(input.cobros, input.movimientos, hoy)
  const bancos = agruparBancos(input.cuentas)
  const saldoInicialCentavos = bancos.reduce((total, banco) => total + banco.saldoAhoraCentavos, 0)
  const pagosDeCompromisos = pagos.reduce((total, fila) => total + fila.montoCentavos, 0)
  const chequesDelDia = chequesQueVencenHoy(input.cheques, hoy).reduce(
    (total, cheque) => total + cheque.montoCentavos,
    0,
  )
  const pagosCentavos = pagosDeCompromisos + chequesDelDia
  const cobrosCentavos = ingresos.filas
    .filter((fila) => !fila.llego)
    .reduce((total, fila) => total + fila.montoCentavos, 0)
  const saldoFinalCentavos = saldoInicialCentavos - pagosCentavos + cobrosCentavos
  const semana = armarSemana({
    hoy,
    saldoInicialCentavos,
    compromisos: input.compromisos,
    cobros: input.cobros,
    cobrosYaLlegados: ingresos.llegados,
    cheques: input.cheques,
  })
  const cobrosAtrasados = listarCobrosAtrasados(input.cobros, hoy, ingresos.llegados)
  const firmas = transferenciasSinFirmar(input.transferencias, input.now)
  const chequesADebitar = armarChequesADebitar({ cheques: input.cheques, hoy, bancos })
  const vacio =
    pagos.length === 0 &&
    pagosAtrasados.length === 0 &&
    pagosSinFecha.length === 0 &&
    ingresos.filas.length === 0 &&
    semana.filas == null &&
    cobrosAtrasados.length === 0 &&
    firmas == null &&
    chequesADebitar.filas.length === 0

  return {
    saludo: saludoDelDia(input.now),
    fecha: hoy,
    vacio,
    pagos: { totalCentavos: pagosDeCompromisos, filas: pagos },
    pagosAtrasados: { totalCentavos: suma(pagosAtrasados), filas: pagosAtrasados },
    pagosSinFecha: { totalCentavos: suma(pagosSinFecha), filas: pagosSinFecha },
    ingresos: { filas: ingresos.filas },
    cobrosSinFecha: { cantidad: cobrosSinFecha.length, totalCentavos: suma(cobrosSinFecha) },
    dia: {
      saldoInicialCentavos,
      pagosCentavos,
      cobrosCentavos,
      saldoFinalCentavos,
      frase: `Hoy arrancaste con ${formatoPesos(saldoInicialCentavos)}. Si pagás lo de hoy y entra lo esperado, terminás en ${formatoPesos(saldoFinalCentavos)}.`,
      bancos,
      avisoDescubierto: avisoDescubierto(bancos, pagosCentavos),
    },
    prevision: {
      semana: semana.filas,
      diaMasPesado: semana.diaMasPesado,
      cobrosAtrasados,
      firmas,
      chequesADebitar,
    },
  }
}
