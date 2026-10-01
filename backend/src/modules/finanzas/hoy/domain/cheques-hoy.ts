import type { BancoFilaHoy, ChequeADebitarFila, ChequeEnHoy, ChequesADebitarHoy } from './hoy.tipos.js'
import { formatoPesos, mananaHabil } from './hoy.fechas.js'

/** Un emitido anulado, rechazado o ya debitado no se vuelve a descontar. */
const NO_SE_DEBITA = new Set(['anulado', 'rechazado', 'debitado'])

/**
 * En cartera = se puede usar para pagar.
 * Recibido, no usado, y un estado que no sea rechazado, anulado, depositado, vendido ni debitado.
 * `utilizado` null cuenta como no usado.
 */
const FUERA_DE_CARTERA = new Set(['rechazado', 'anulado', 'depositado', 'vendido', 'debitado'])

export const BANCO_SIN_IDENTIFICAR = 'Banco sin identificar'

export function esChequeEnCartera(cheque: {
  direccion: string
  utilizado: boolean | null
  estado: string
}): boolean {
  return cheque.direccion === 'recibido' && cheque.utilizado !== true && !FUERA_DE_CARTERA.has(cheque.estado)
}

/**
 * Lo único que cambia en el documento al endosar.
 * El repositorio agrega `updatedAt` y no escribe ningún otro campo.
 */
export function camposEndoso(destinatario: string): { utilizado: true; destinatario: string } {
  return { utilizado: true, destinatario: destinatario.trim() }
}

export function chequeEmitidoVigente(cheque: { direccion: string; estado: string }): boolean {
  return cheque.direccion === 'emitido' && !NO_SE_DEBITA.has(cheque.estado)
}

/** Los que entran en "A pagar" de la semana: emitidos vigentes con fecha de pago de hoy en adelante. */
export function chequesParaLaSemana(cheques: readonly ChequeEnHoy[], hoy: string): ChequeEnHoy[] {
  return cheques.filter((cheque) => chequeEmitidoVigente(cheque) && cheque.fechaPago >= hoy)
}

/** Los que restan en "Así va a quedar el día": vencen hoy y todavía no están debitados. */
export function chequesQueVencenHoy(cheques: readonly ChequeEnHoy[], hoy: string): ChequeEnHoy[] {
  return cheques.filter((cheque) => chequeEmitidoVigente(cheque) && cheque.fechaPago === hoy)
}

export function ordenarCartera<T extends { montoCentavos: number; fechaPago: string; numero: string }>(
  cheques: readonly T[],
  montoCentavos: number,
): T[] {
  return [...cheques].sort((a, b) => {
    const cerca = Math.abs(a.montoCentavos - montoCentavos) - Math.abs(b.montoCentavos - montoCentavos)
    if (cerca !== 0) return cerca
    if (a.fechaPago !== b.fechaPago) return a.fechaPago.localeCompare(b.fechaPago)
    return a.numero.localeCompare(b.numero, 'es', { numeric: true })
  })
}

function normalizarBanco(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** El nombre de una cuenta nuestra, si el banco del cheque se puede reconocer. Si no, null. */
export function bancoIdentificado(bancoEmisor: string | null | undefined, conocidos: readonly string[]): string | null {
  const raw = bancoEmisor?.trim()
  if (!raw) return null
  const needle = normalizarBanco(raw)
  if (!needle) return null
  const ordenados = [...conocidos].sort((a, b) => normalizarBanco(b).length - normalizarBanco(a).length)
  for (const nombre of ordenados) {
    const clave = normalizarBanco(nombre)
    if (clave.length < 3) continue
    if (needle === clave || needle.includes(clave)) return nombre
  }
  return null
}

function sugerirOtroBanco(
  bancoNombre: string,
  bancos: readonly BancoFilaHoy[],
  montoPorBanco: ReadonlyMap<string, number>,
): string | null {
  const otros = bancos
    .filter((banco) => banco.bancoNombre !== bancoNombre)
    .map((banco) => ({
      nombre: banco.bancoNombre,
      margen:
        banco.saldoAhoraCentavos + (banco.descubiertoCentavos ?? 0) - (montoPorBanco.get(banco.bancoNombre) ?? 0),
    }))
    .sort((a, b) => b.margen - a.margen || a.nombre.localeCompare(b.nombre, 'es'))
  return otros[0]?.nombre ?? null
}

/**
 * Cheques emitidos que se debitan mañana hábil, más los de hoy que todavía no figuran debitados.
 * El impacto usa el saldo de cada banco nuestro. Si el banco del cheque no se reconoce, no se suma.
 */
export function armarChequesADebitar(input: {
  cheques: readonly ChequeEnHoy[]
  hoy: string
  bancos: readonly BancoFilaHoy[]
}): ChequesADebitarHoy {
  const manana = mananaHabil(input.hoy)
  const conocidos = input.bancos.map((banco) => banco.bancoNombre)
  const preparados = input.cheques
    .filter(
      (cheque) =>
        chequeEmitidoVigente(cheque) && (cheque.fechaPago === input.hoy || cheque.fechaPago === manana),
    )
    .map((cheque) => {
      const bancoNombre = bancoIdentificado(cheque.bancoEmisor, conocidos)
      const fila: ChequeADebitarFila & { bancoNombre: string | null } = {
        id: cheque.id,
        numero: cheque.numero,
        destinatario: cheque.destinatario?.trim() || 'Sin destinatario',
        banco: bancoNombre ?? BANCO_SIN_IDENTIFICAR,
        montoCentavos: cheque.montoCentavos,
        cuando: cheque.fechaPago === input.hoy ? 'Hoy' : 'Mañana',
        bancoNombre,
      }
      return fila
    })
    .sort((a, b) => {
      if (a.cuando !== b.cuando) return a.cuando === 'Hoy' ? -1 : 1
      const sinA = a.banco === BANCO_SIN_IDENTIFICAR ? 1 : 0
      const sinB = b.banco === BANCO_SIN_IDENTIFICAR ? 1 : 0
      if (sinA !== sinB) return sinA - sinB
      if (a.banco !== b.banco) return a.banco.localeCompare(b.banco, 'es')
      return a.numero.localeCompare(b.numero, 'es', { numeric: true })
    })

  const montoPorBanco = new Map<string, number>()
  for (const fila of preparados) {
    if (!fila.bancoNombre) continue
    montoPorBanco.set(fila.bancoNombre, (montoPorBanco.get(fila.bancoNombre) ?? 0) + fila.montoCentavos)
  }

  const impactos: string[] = []
  for (const banco of input.bancos) {
    const monto = montoPorBanco.get(banco.bancoNombre) ?? 0
    if (monto <= 0) continue
    const queda = banco.saldoAhoraCentavos - monto
    impactos.push(`Después de estos cheques, ${banco.bancoNombre} queda en ${formatoPesos(queda)}.`)
    const descubierto = banco.descubiertoCentavos
    const exceso = monto - (banco.saldoAhoraCentavos + (descubierto ?? 0))
    if (descubierto == null || exceso <= 0) continue
    const otro = sugerirOtroBanco(banco.bancoNombre, input.bancos, montoPorBanco)
    let ojo = `Ojo: ${banco.bancoNombre} se pasa ${formatoPesos(exceso)} del descubierto.`
    if (otro) ojo += ` Pasá plata desde ${otro} antes de mañana.`
    impactos.push(ojo)
  }
  if (preparados.some((fila) => fila.bancoNombre == null)) {
    impactos.push('Hay cheques en Banco sin identificar: no los sumé a ningún banco.')
  }

  const filas = preparados.map(({ bancoNombre: _bancoNombre, ...fila }) => fila)
  return {
    filas,
    totalCentavos: filas.reduce((total, fila) => total + fila.montoCentavos, 0),
    impactos,
  }
}
