import { normalizarNombre } from '../../agenda/domain/normalizar-nombre.js'
import type {
  OperacionDolares,
  OperacionDolaresDetalle,
  OperacionDolaresInput,
} from './operacion-dolares.types.js'

function diasEntre(fechaDesde: string, fechaHasta: string): number {
  const desde = new Date(`${fechaDesde}T12:00:00-03:00`)
  const hasta = new Date(`${fechaHasta}T12:00:00-03:00`)
  return Math.round((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24))
}

export function calcularDetalle(
  fechaOperacion: string,
  tasaMensual: number,
  impuestoPorcentaje: number,
  cheque: { numeroCheque: string; fechaCobro: string; importeCentavos: number },
): OperacionDolaresDetalle {
  const dias = diasEntre(fechaOperacion, cheque.fechaCobro)
  const tasaDiaria = tasaMensual / 30
  const tasaEquivalenteCentavos = Math.round(tasaDiaria * dias * cheque.importeCentavos)
  const descuentoCentavos = Math.round(impuestoPorcentaje * cheque.importeCentavos)
  const importeLiquidarCentavos = cheque.importeCentavos - tasaEquivalenteCentavos - descuentoCentavos

  return {
    numeroCheque: cheque.numeroCheque,
    fechaCobro: cheque.fechaCobro,
    dias,
    importeCentavos: cheque.importeCentavos,
    tasaEquivalenteCentavos,
    descuentoCentavos,
    importeLiquidarCentavos,
  }
}

export function calcularOperacion(input: OperacionDolaresInput): Omit<OperacionDolares, 'id' | 'creadoPor' | 'creadoEn' | 'actualizadoEn' | 'estado'> {
  const detalles = input.cheques.map((ch) =>
    calcularDetalle(input.fecha, input.tasaMensual, input.impuestoPorcentaje, ch),
  )

  const totalChequesCentavos = detalles.reduce((s, d) => s + d.importeCentavos, 0)
  const totalLiquidarCentavos = detalles.reduce((s, d) => s + d.importeLiquidarCentavos, 0)
  const totalInteresCentavos = totalChequesCentavos - totalLiquidarCentavos
  const costoFinancieroPorcentaje = totalLiquidarCentavos > 0
    ? totalInteresCentavos / totalLiquidarCentavos
    : 0

  return {
    fecha: input.fecha,
    inversor: input.inversor,
    inversorNormalizado: normalizarNombre(input.inversor),
    cotizacion: input.cotizacion,
    tasaMensual: input.tasaMensual,
    impuestoPorcentaje: input.impuestoPorcentaje,
    montoUsd: input.montoUsd,
    cashCentavos: input.cashCentavos,
    detalles,
    totalChequesCentavos,
    totalLiquidarCentavos,
    totalInteresCentavos,
    costoFinancieroPorcentaje,
    notas: input.notas,
  }
}

export interface ErrorValidacion {
  campo: string
  mensaje: string
}

export function validarOperacionInput(input: OperacionDolaresInput): ErrorValidacion[] {
  const errores: ErrorValidacion[] = []

  if (!input.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) {
    errores.push({ campo: 'fecha', mensaje: 'Fecha de operación requerida' })
  }
  if (!input.inversor.trim()) {
    errores.push({ campo: 'inversor', mensaje: 'Inversor requerido' })
  }
  if (input.cotizacion <= 0) {
    errores.push({ campo: 'cotizacion', mensaje: 'Tipo de cambio debe ser positivo' })
  }
  if (input.tasaMensual <= 0 || input.tasaMensual >= 1) {
    errores.push({ campo: 'tasaMensual', mensaje: 'Tasa mensual inválida (ej: 0.065 = 6.5%)' })
  }
  if (input.impuestoPorcentaje < 0 || input.impuestoPorcentaje >= 1) {
    errores.push({ campo: 'impuestoPorcentaje', mensaje: 'Impuesto inválido (ej: 0.025 = 2.5%)' })
  }
  if (input.montoUsd <= 0) {
    errores.push({ campo: 'montoUsd', mensaje: 'Monto USD debe ser positivo' })
  }
  if (input.cheques.length === 0) {
    errores.push({ campo: 'cheques', mensaje: 'Debe haber al menos un cheque' })
  }

  for (let i = 0; i < input.cheques.length; i++) {
    const ch = input.cheques[i]!
    if (!ch.numeroCheque.trim()) {
      errores.push({ campo: `cheques[${i}].numeroCheque`, mensaje: `Cheque ${i + 1}: número requerido` })
    }
    if (!ch.fechaCobro || !/^\d{4}-\d{2}-\d{2}$/.test(ch.fechaCobro)) {
      errores.push({ campo: `cheques[${i}].fechaCobro`, mensaje: `Cheque ${i + 1}: fecha de cobro requerida` })
    }
    if (ch.importeCentavos <= 0) {
      errores.push({ campo: `cheques[${i}].importeCentavos`, mensaje: `Cheque ${i + 1}: importe debe ser positivo` })
    }
  }

  return errores
}
