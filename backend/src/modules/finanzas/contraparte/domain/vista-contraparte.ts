import { esOrigenContraparte, type ContraparteGuardada } from './contraparte.types.js'
import { contraparteDesdeBanco } from './fuente-banco.js'
import { cuitOnceDigitos, nombreContraparteLimpio } from './normalizar.js'

/** Lo que muestra el listado. Si todavía no se guardó la contraparte, usa el texto del banco. */
export function vistaContraparte(data: {
  contraparteNombre?: unknown
  contraparteCuit?: unknown
  contraparteOrigen?: unknown
  depositorDescription?: unknown
  customerCuit?: unknown
}): ContraparteGuardada | null {
  const nombre = nombreContraparteLimpio(data.contraparteNombre)
  const origen = esOrigenContraparte(data.contraparteOrigen) ? data.contraparteOrigen : null
  if (origen === 'manual') {
    return { nombre, cuit: cuitOnceDigitos(data.contraparteCuit), origen: 'manual' }
  }
  if (nombre) {
    return { nombre, cuit: cuitOnceDigitos(data.contraparteCuit), origen }
  }
  return contraparteDesdeBanco(data)
}
