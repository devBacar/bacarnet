import { CONTRAPARTE_VACIA, type ContraparteGuardada } from './contraparte.types.js'
import { cuitOnceDigitos, nombreContraparteLimpio } from './normalizar.js'

/**
 * La primera fuente con nombre gana. `manual` no se pisa, aunque el nombre esté vacío:
 * si alguien lo borró, no lo vuelve a completar el automático.
 */
export function elegirContraparte(input: {
  actual: ContraparteGuardada
  candidatos: Array<ContraparteGuardada | null>
}): ContraparteGuardada {
  if (input.actual.origen === 'manual') {
    return {
      nombre: nombreContraparteLimpio(input.actual.nombre),
      cuit: cuitOnceDigitos(input.actual.cuit),
      origen: 'manual',
    }
  }
  for (const candidato of input.candidatos) {
    const nombre = nombreContraparteLimpio(candidato?.nombre)
    if (!candidato || !nombre || !candidato.origen || candidato.origen === 'manual') continue
    return {
      nombre,
      cuit: cuitOnceDigitos(candidato.cuit),
      origen: candidato.origen,
    }
  }
  return CONTRAPARTE_VACIA
}
