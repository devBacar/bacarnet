import { randomUUID } from 'node:crypto'
import type { AuthedUser } from '../../../auth/middleware.js'
import {
  createCajaDoc,
  listCajasDocs,
} from '../../cajachica/services/caja.repository.js'
import type { CajaMoneda } from '../../cajachica/domain/caja.types.js'

/**
 * Caja principal activa de la moneda (solo hay una por moneda).
 * Si no existe, la crea con el usuario que sincroniza como responsable.
 */
export async function asegurarCajaPrincipal(moneda: CajaMoneda, user: AuthedUser): Promise<string> {
  const existentes = await listCajasDocs()
  const hallada = existentes.find(
    ({ data }) => data.tipo === 'principal' && data.moneda === moneda && data.estado !== 'inactiva',
  )
  if (hallada) return hallada.id

  const id = randomUUID()
  try {
    await createCajaDoc({
      id,
      nombre: 'Caja principal',
      tipo: 'principal',
      moneda,
      cajaPadreId: null,
      responsableUid: user.uid,
      createdBy: user.uid,
    })
    return id
  } catch (err) {
    // Carrera: otro pedido creó la principal entre el listado y el create.
    const mensaje = err instanceof Error ? err.message : ''
    if (!mensaje.includes('Ya existe una caja principal')) throw err
    const otraVez = await listCajasDocs()
    const recien = otraVez.find(
      ({ data }) => data.tipo === 'principal' && data.moneda === moneda && data.estado !== 'inactiva',
    )
    if (!recien) throw err
    return recien.id
  }
}
