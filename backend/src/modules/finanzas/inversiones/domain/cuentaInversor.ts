import { compararYmd, sumarDias } from './fechas.js'

/**
 * Cuenta del inversor: KPIs y calendario de cuotas a partir de inversiones vigentes
 * y de sus cuotas (ya alineadas con la Agenda: monto neto = aPagarCentavos).
 * Función pura: no llama a la API ni recalcula el cronograma.
 */

export type MonedaCuenta = 'ARS' | 'USD'

export type EstadoCuotaEntrada =
  | 'pendiente'
  | 'parcial'
  | 'pagada'
  | 'atrasada'
  | 'anulada'
  | 'renovada'

/** Estado mostrado en el calendario (palabras simples). */
export type EstadoCuotaCalendario = 'pagada' | 'pendiente' | 'vencida'

export type CuotaParaCuenta = {
  numero: number
  fechaVencimiento: string
  estado: EstadoCuotaEntrada
  /** Neto a pagar (como en la Agenda); ya descuenta retención. */
  aPagarCentavos: number
  monedaPago: MonedaCuenta
  interesCentavos: number
  retencionCentavos: number
  restanteCentavos: number
}

export type InversionParaCuenta = {
  id: string
  numero: string
  /** Solo 'vigente' entra en KPIs y calendario. */
  estado: string
  moneda: MonedaCuenta
  capitalCentavos: number
  fechaFinal: string | null
  tasaTexto?: string
  cronograma: readonly CuotaParaCuenta[]
  inversorNombre?: string
}

export type KpisMoneda = {
  moneda: MonedaCuenta
  capitalVigenteCentavos: number
  interesesPagadosCentavos: number
  interesesAPagarCentavos: number
  /** Retención de Ganancias (RG 830) del año en curso. */
  retencionesAnioCentavos: number
  inversionesVigentes: number
  proximoVencimiento: { fecha: string; montoCentavos: number; monedaPago: MonedaCuenta } | null
  pagadoCentavos: number
  aPagarTotalCentavos: number
  cuotasPendientes: number
  atrasado: { cantidad: number; montoCentavos: number }
  proximos30Centavos: number
  retencionesARetenerCentavos: number
}

export type CuotaCalendario = {
  fecha: string
  inversionId: string
  inversionNumero: string
  /** Número de cuota en el cronograma (clave estable en la UI). */
  cuotaNumero: number
  montoNetoCentavos: number
  monedaPago: MonedaCuenta
  estado: EstadoCuotaCalendario
  inversorNombre?: string
}

export type MesCalendario = {
  /** 'YYYY-MM' */
  mes: string
  etiqueta: string
  cuotas: CuotaCalendario[]
}

export type CuentaInversor = {
  /** Filas de KPIs: solo monedas con algún dato (capital, intereses, retenciones o inversiones). */
  kpisPorMoneda: KpisMoneda[]
  calendario: MesCalendario[]
  inversionesVigentes: Array<{
    id: string
    numero: string
    estado: string
    moneda: MonedaCuenta
    capitalCentavos: number
    fechaFinal: string | null
    tasaTexto?: string
  }>
  vencimientosContrato: Array<{
    id: string
    numero: string
    fechaFinal: string
    moneda: MonedaCuenta
    capitalCentavos: number
  }>
}

const ABIERTAS: ReadonlySet<EstadoCuotaEntrada> = new Set(['pendiente', 'parcial', 'atrasada'])

function ceroKpis(moneda: MonedaCuenta): KpisMoneda {
  return {
    moneda,
    capitalVigenteCentavos: 0,
    interesesPagadosCentavos: 0,
    interesesAPagarCentavos: 0,
    retencionesAnioCentavos: 0,
    inversionesVigentes: 0,
    proximoVencimiento: null,
    pagadoCentavos: 0,
    aPagarTotalCentavos: 0,
    cuotasPendientes: 0,
    atrasado: { cantidad: 0, montoCentavos: 0 },
    proximos30Centavos: 0,
    retencionesARetenerCentavos: 0,
  }
}

function tieneDatos(k: KpisMoneda): boolean {
  return (
    k.capitalVigenteCentavos > 0 ||
    k.interesesPagadosCentavos > 0 ||
    k.interesesAPagarCentavos > 0 ||
    k.retencionesAnioCentavos > 0 ||
    k.inversionesVigentes > 0 ||
    k.proximoVencimiento != null ||
    k.pagadoCentavos > 0 ||
    k.aPagarTotalCentavos > 0 ||
    k.cuotasPendientes > 0 ||
    k.atrasado.cantidad > 0 ||
    k.atrasado.montoCentavos > 0 ||
    k.proximos30Centavos > 0 ||
    k.retencionesARetenerCentavos > 0
  )
}

/** Pagada / Pendiente / Vencida (atrasada → vencida). Anulada y renovada no van al calendario. */
export function estadoCalendario(estado: EstadoCuotaEntrada): EstadoCuotaCalendario | null {
  if (estado === 'pagada') return 'pagada'
  if (estado === 'atrasada') return 'vencida'
  if (estado === 'pendiente' || estado === 'parcial') return 'pendiente'
  return null
}

function etiquetaMes(mes: string): string {
  const [anio, numero] = mes.split('-').map(Number)
  if (!anio || !numero) return mes
  const nombre = new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(anio, numero - 1, 1)),
  )
  const capitalizado = nombre.charAt(0).toLocaleUpperCase('es') + nombre.slice(1)
  return `${capitalizado} ${anio}`
}

/**
 * Arma la cuenta del inversor.
 * @param inversiones detalles (con cronograma ya resuelto desde la Agenda)
 * @param hoy 'YYYY-MM-DD' (zona AR)
 * @param anioCurso año para sumar retenciones RG 830; por defecto el de `hoy`
 */
export function cuentaInversor(
  inversiones: readonly InversionParaCuenta[],
  hoy: string,
  anioCurso?: number,
): CuentaInversor {
  const anio = anioCurso ?? Number(hoy.slice(0, 4))
  const prefijoAnio = `${anio}-`

  const hoyMas30 = sumarDias(hoy, 30)
  const hoyMas60 = sumarDias(hoy, 60)

  const vigentes = inversiones.filter((inv) => inv.estado === 'vigente')

  const porMoneda: Record<MonedaCuenta, KpisMoneda> = {
    ARS: ceroKpis('ARS'),
    USD: ceroKpis('USD'),
  }

  /** Próximo vencimiento abierto por moneda de la inversión (monto en monedaPago). */
  const proximoPorMoneda: Record<MonedaCuenta, { fecha: string; montoCentavos: number; monedaPago: MonedaCuenta } | null> =
    { ARS: null, USD: null }

  const filasCalendario: CuotaCalendario[] = []
  const vencimientosContrato: CuentaInversor['vencimientosContrato'] = []

  for (const inv of vigentes) {
    const k = porMoneda[inv.moneda]
    k.inversionesVigentes += 1
    k.capitalVigenteCentavos += inv.capitalCentavos

    if (
      inv.fechaFinal &&
      compararYmd(inv.fechaFinal, hoy) >= 0 &&
      compararYmd(inv.fechaFinal, hoyMas60) <= 0
    ) {
      vencimientosContrato.push({
        id: inv.id,
        numero: inv.numero,
        fechaFinal: inv.fechaFinal,
        moneda: inv.moneda,
        capitalCentavos: inv.capitalCentavos,
      })
    }

    for (const c of inv.cronograma) {
      if (c.estado === 'anulada' || c.estado === 'renovada') continue

      if (c.estado === 'pagada') {
        k.interesesPagadosCentavos += c.interesCentavos
        k.pagadoCentavos += c.aPagarCentavos - c.restanteCentavos
      } else if (ABIERTAS.has(c.estado)) {
        k.interesesAPagarCentavos += c.interesCentavos
        k.cuotasPendientes += 1
        // Parcial: lo ya pagado también cuenta como pagado.
        k.pagadoCentavos += c.aPagarCentavos - c.restanteCentavos
        k.aPagarTotalCentavos += c.restanteCentavos

        if (compararYmd(c.fechaVencimiento, hoy) < 0) {
          k.atrasado.cantidad += 1
          k.atrasado.montoCentavos += c.restanteCentavos
        }

        if (compararYmd(c.fechaVencimiento, hoy) >= 0 && compararYmd(c.fechaVencimiento, hoyMas30) <= 0) {
          k.proximos30Centavos += c.restanteCentavos
        }

        k.retencionesARetenerCentavos += c.retencionCentavos

        const monto = c.restanteCentavos > 0 ? c.restanteCentavos : c.aPagarCentavos
        const actual = proximoPorMoneda[inv.moneda]
        if (
          !actual ||
          c.fechaVencimiento < actual.fecha ||
          (c.fechaVencimiento === actual.fecha && monto < actual.montoCentavos)
        ) {
          proximoPorMoneda[inv.moneda] = {
            fecha: c.fechaVencimiento,
            montoCentavos: monto,
            monedaPago: c.monedaPago,
          }
        }
      }

      if (c.fechaVencimiento.startsWith(prefijoAnio) && c.retencionCentavos > 0) {
        k.retencionesAnioCentavos += c.retencionCentavos
      }

      const estadoUi = estadoCalendario(c.estado)
      if (estadoUi) {
        filasCalendario.push({
          fecha: c.fechaVencimiento,
          inversionId: inv.id,
          inversionNumero: inv.numero,
          cuotaNumero: c.numero,
          montoNetoCentavos: c.aPagarCentavos,
          monedaPago: c.monedaPago,
          estado: estadoUi,
          inversorNombre: inv.inversorNombre,
        })
      }
    }
  }

  for (const m of ['ARS', 'USD'] as const) {
    porMoneda[m].proximoVencimiento = proximoPorMoneda[m]
  }

  vencimientosContrato.sort((a, b) => compararYmd(a.fechaFinal, b.fechaFinal))

  const kpisPorMoneda = (['ARS', 'USD'] as const)
    .map((m) => porMoneda[m])
    .filter(tieneDatos)

  filasCalendario.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
    return a.inversionNumero.localeCompare(b.inversionNumero, 'es')
  })

  const porMes = new Map<string, CuotaCalendario[]>()
  for (const fila of filasCalendario) {
    const mes = fila.fecha.slice(0, 7)
    const lista = porMes.get(mes)
    if (lista) lista.push(fila)
    else porMes.set(mes, [fila])
  }

  const calendario: MesCalendario[] = [...porMes.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([mes, cuotas]) => ({ mes, etiqueta: etiquetaMes(mes), cuotas }))

  return {
    kpisPorMoneda,
    calendario,
    inversionesVigentes: vigentes.map((inv) => ({
      id: inv.id,
      numero: inv.numero,
      estado: inv.estado,
      moneda: inv.moneda,
      capitalCentavos: inv.capitalCentavos,
      fechaFinal: inv.fechaFinal,
      tasaTexto: inv.tasaTexto,
    })),
    vencimientosContrato,
  }
}
