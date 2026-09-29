import { agendaTimestampToIso } from '../../agenda/domain/agendaTimestamps.js'
import {
  claveNombreCategoria,
  normalizarColorCategoria,
  normalizarGrupoCategoria,
  validarNombreCategoria,
} from '../domain/categoria-movimiento.js'
import {
  createCategoriaMovimientoDocument,
  deleteCategoriaMovimientoDocument,
  getCategoriaMovimientoDocument,
  listCategoriaMovimientoDocuments,
  updateCategoriaMovimientoDocument,
  type CategoriaMovimientoDocument,
} from './categorias-movimientos.repository.js'
import {
  countMovimientosPorCategoria,
  desasignarCategoriaEnMovimientos,
  moverCategoriaEnMovimientos,
} from './movimientos.repository.js'
import { deleteReglasDeCategoria, moverReglasDeCategoria } from './reglas-categorizacion.repository.js'

export interface CategoriaMovimientoApi {
  id: string
  nombre: string
  color: string | null
  grupo: string | null
  /** Cantidad de movimientos que la tienen asignada hoy. */
  usos: number
  createdAt: string | null
  createdBy: string
}

export class CategoriaMovimientoError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'CategoriaMovimientoError'
    this.status = status
  }
}

function grupoDe(data: CategoriaMovimientoDocument): string | null {
  return typeof data.grupo === 'string' && data.grupo.trim() ? data.grupo : null
}

function serialize(id: string, data: CategoriaMovimientoDocument, usos: number): CategoriaMovimientoApi {
  return {
    id,
    nombre: data.nombre,
    color: data.color ?? null,
    grupo: grupoDe(data),
    usos,
    createdAt: agendaTimestampToIso(data.createdAt),
    createdBy: data.createdBy,
  }
}

/** Lista ordenada por las más usadas primero; a igual uso, por nombre. */
export async function listCategoriasMovimientosApi(): Promise<CategoriaMovimientoApi[]> {
  const rows = await listCategoriaMovimientoDocuments()
  const usos = await Promise.all(rows.map((row) => countMovimientosPorCategoria(row.id)))
  return rows
    .map((row, index) => serialize(row.id, row.data, usos[index] ?? 0))
    .sort((a, b) => b.usos - a.usos || a.nombre.localeCompare(b.nombre, 'es'))
}

export async function crearCategoriaMovimientoApi(input: {
  actorUid: string
  body: Record<string, unknown>
}): Promise<{ categoria: CategoriaMovimientoApi; creada: boolean }> {
  const nombreRaw = typeof input.body.nombre === 'string' ? input.body.nombre : ''
  const nombre = validarNombreCategoria(nombreRaw)
  const key = claveNombreCategoria(nombre)
  const existentes = await listCategoriaMovimientoDocuments()
  const ya = existentes.find((row) => row.data.nombreKey === key)
  if (ya) {
    return { categoria: serialize(ya.id, ya.data, await countMovimientosPorCategoria(ya.id)), creada: false }
  }

  const color = normalizarColorCategoria(input.body.color, nombre)
  const grupo = normalizarGrupoCategoria(input.body.grupo)
  const id = await createCategoriaMovimientoDocument({
    nombre,
    nombreKey: key,
    color,
    grupo,
    createdBy: input.actorUid,
  })
  const creada = await getCategoriaMovimientoDocument(id)
  if (!creada) throw new Error('No se pudo leer la categoría recién creada')
  return { categoria: serialize(creada.id, creada.data, 0), creada: true }
}

/**
 * Borra la categoría. Los movimientos que la tenían quedan sin categoría (no se
 * borran) y las reglas de auto-categorización que apuntaban a ella se eliminan.
 */
export async function eliminarCategoriaMovimientoApi(input: {
  categoriaId: string
}): Promise<{ movimientosDesasignados: number; reglasEliminadas: number }> {
  const id = input.categoriaId.trim()
  if (!id) throw new CategoriaMovimientoError('Id de categoría inválido', 400)
  const categoria = await getCategoriaMovimientoDocument(id)
  if (!categoria) throw new CategoriaMovimientoError('La categoría no existe', 404)

  const reglasEliminadas = await deleteReglasDeCategoria(id)
  const movimientosDesasignados = await desasignarCategoriaEnMovimientos(id)
  await deleteCategoriaMovimientoDocument(id)
  return { movimientosDesasignados, reglasEliminadas }
}

export async function actualizarCategoriaMovimientoApi(input: {
  categoriaId: string
  body: Record<string, unknown>
}): Promise<CategoriaMovimientoApi> {
  const id = input.categoriaId.trim()
  if (!id) throw new CategoriaMovimientoError('Id de categoría inválido', 400)
  const actual = await getCategoriaMovimientoDocument(id)
  if (!actual) throw new CategoriaMovimientoError('La categoría no existe', 404)

  const patch: { nombre?: string; nombreKey?: string; color?: string | null; grupo?: string | null } = {}
  let nombre = actual.data.nombre
  if (Object.prototype.hasOwnProperty.call(input.body, 'nombre')) {
    nombre = validarNombreCategoria(typeof input.body.nombre === 'string' ? input.body.nombre : '')
    const key = claveNombreCategoria(nombre)
    const existentes = await listCategoriaMovimientoDocuments()
    const choca = existentes.find((row) => row.id !== id && row.data.nombreKey === key)
    if (choca) throw new CategoriaMovimientoError('Ya hay una categoría con ese nombre', 400)
    patch.nombre = nombre
    patch.nombreKey = key
  }
  if (Object.prototype.hasOwnProperty.call(input.body, 'color')) {
    patch.color = normalizarColorCategoria(input.body.color, nombre)
  }
  if (Object.prototype.hasOwnProperty.call(input.body, 'grupo')) {
    patch.grupo = normalizarGrupoCategoria(input.body.grupo)
  }

  if (Object.keys(patch).length > 0) {
    await updateCategoriaMovimientoDocument(id, patch)
  }
  const guardada = await getCategoriaMovimientoDocument(id)
  if (!guardada) throw new Error('No se pudo leer la categoría recién actualizada')
  return serialize(guardada.id, guardada.data, await countMovimientosPorCategoria(id))
}

/**
 * Pasa movimientos y reglas de una categoría a otra y borra la de origen.
 * No deduplica reglas: si las dos tenían el mismo texto, quedan las dos en el destino.
 */
export async function fusionarCategoriaMovimientoApi(input: {
  categoriaId: string
  destinoId: string
}): Promise<{ movimientosMovidos: number; reglasMovidas: number }> {
  const id = input.categoriaId.trim()
  const destinoId = input.destinoId.trim()
  if (!id) throw new CategoriaMovimientoError('Id de categoría inválido', 400)
  if (!destinoId) throw new CategoriaMovimientoError('Elegí la categoría de destino', 400)
  if (id === destinoId) {
    throw new CategoriaMovimientoError('No se puede fusionar una categoría consigo misma', 400)
  }

  const [origen, destino] = await Promise.all([
    getCategoriaMovimientoDocument(id),
    getCategoriaMovimientoDocument(destinoId),
  ])
  if (!origen) throw new CategoriaMovimientoError('La categoría no existe', 404)
  if (!destino) throw new CategoriaMovimientoError('La categoría de destino no existe', 404)

  const reglasMovidas = await moverReglasDeCategoria(id, destinoId)
  const movimientosMovidos = await moverCategoriaEnMovimientos(id, destinoId)
  await deleteCategoriaMovimientoDocument(id)
  return { movimientosMovidos, reglasMovidas }
}
