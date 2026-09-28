import { agendaTimestampToIso } from '../../agenda/domain/agendaTimestamps.js'
import {
  claveNombreCategoria,
  normalizarColorCategoria,
  validarNombreCategoria,
} from '../domain/categoria-movimiento.js'
import {
  createCategoriaMovimientoDocument,
  deleteCategoriaMovimientoDocument,
  getCategoriaMovimientoDocument,
  listCategoriaMovimientoDocuments,
  type CategoriaMovimientoDocument,
} from './categorias-movimientos.repository.js'
import { countMovimientosPorCategoria, desasignarCategoriaEnMovimientos } from './movimientos.repository.js'
import { deleteReglasDeCategoria } from './reglas-categorizacion.repository.js'

export interface CategoriaMovimientoApi {
  id: string
  nombre: string
  color: string | null
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

function serialize(id: string, data: CategoriaMovimientoDocument, usos: number): CategoriaMovimientoApi {
  return {
    id,
    nombre: data.nombre,
    color: data.color ?? null,
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
  const id = await createCategoriaMovimientoDocument({
    nombre,
    nombreKey: key,
    color,
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
