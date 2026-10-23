import type { MonedaInversion } from './inversion.types.js'

/** 1234567 centavos → "$ 12.345,67" (o "US$ 12.345,67"). */
export function montoTexto(centavos: number, moneda: MonedaInversion = 'ARS'): string {
  const signo = centavos < 0 ? '-' : ''
  const abs = Math.abs(Math.round(centavos))
  const enteros = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const dec = String(abs % 100).padStart(2, '0')
  return `${signo}${moneda === 'USD' ? 'US$' : '$'} ${enteros},${dec}`
}

/** Deja ver solo los últimos 4 números de un CUIT, DNI o CBU. */
export function enmascarar(valor: string | null | undefined): string | null {
  if (!valor) return null
  const digitos = valor.replace(/\D/g, '')
  if (digitos.length <= 4) return '…' + digitos
  return '…' + digitos.slice(-4)
}
