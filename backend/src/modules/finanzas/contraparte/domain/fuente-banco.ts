import type { ContraparteGuardada } from './contraparte.types.js'
import { cuitOnceDigitos, nombreContraparteLimpio } from './normalizar.js'

/** El banco a veces manda nombre y CUIT. Si solo hay CUIT, esta fuente no resuelve. */
export function contraparteDesdeBanco(input: {
  depositorDescription?: unknown
  customerCuit?: unknown
}): ContraparteGuardada | null {
  const nombre = nombreContraparteLimpio(input.depositorDescription)
  if (!nombre) return null
  return {
    nombre,
    cuit: cuitOnceDigitos(input.customerCuit),
    origen: 'banco',
  }
}
