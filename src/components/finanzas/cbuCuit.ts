/**
 * Misma regla que backend/src/modules/finanzas/transferencias/domain/cbu-cuit.ts.
 * CBU: dígitos verificadores del BCRA. CUIT: dígito verificador de AFIP.
 */

const PESOS_CBU_BANCO = [7, 1, 3, 9, 7, 1, 3] as const
const PESOS_CBU_CUENTA = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3] as const
const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const

/** Tope de observaciones de Interbanking (idinternomuylargo). */
export const MAX_OBSERVACION_INTERBANKING = 60

export function soloDigitos(raw: string): string {
  return raw.replace(/\D/g, '')
}

function digitoVerificador(digitos: string, pesos: readonly number[]): number {
  let suma = 0
  for (let i = 0; i < pesos.length; i += 1) {
    suma += Number(digitos[i]) * pesos[i]!
  }
  return (10 - (suma % 10)) % 10
}

export function cbuEsValido(raw: string): boolean {
  const cbu = soloDigitos(raw)
  if (!/^\d{22}$/.test(cbu)) return false
  const banco = digitoVerificador(cbu.slice(0, 7), PESOS_CBU_BANCO)
  if (banco !== Number(cbu[7])) return false
  const cuenta = digitoVerificador(cbu.slice(8, 21), PESOS_CBU_CUENTA)
  return cuenta === Number(cbu[21])
}

export function cuitEsValido(raw: string): boolean {
  const cuit = soloDigitos(raw)
  if (!/^\d{11}$/.test(cuit)) return false
  let suma = 0
  for (let i = 0; i < PESOS_CUIT.length; i += 1) {
    suma += Number(cuit[i]) * PESOS_CUIT[i]!
  }
  const resto = suma % 11
  const esperado = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto
  return esperado === Number(cuit[10])
}

export type ValidacionIdentificador =
  | { ok: true; valor: string }
  | { ok: false; error: string }

export function validarCbu(raw: string): ValidacionIdentificador {
  const cbu = soloDigitos(raw)
  if (!cbu) return { ok: false, error: 'Ingresá el CBU' }
  if (!/^\d{22}$/.test(cbu)) return { ok: false, error: 'El CBU tiene que tener 22 dígitos' }
  if (!cbuEsValido(cbu)) {
    return { ok: false, error: 'El CBU no supera la validación del dígito verificador del BCRA' }
  }
  return { ok: true, valor: cbu }
}

export function validarCuitOpcional(raw: string | null | undefined): ValidacionIdentificador {
  if (raw == null || !String(raw).trim()) return { ok: true, valor: '' }
  const cuit = soloDigitos(String(raw))
  if (!/^\d{11}$/.test(cuit)) return { ok: false, error: 'El CUIT tiene que tener 11 dígitos' }
  if (!cuitEsValido(cuit)) return { ok: false, error: 'El CUIT no es válido (dígito verificador)' }
  return { ok: true, valor: cuit }
}
