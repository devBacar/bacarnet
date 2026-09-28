import { agendaTimestampToIso } from '../../agenda/domain/agendaTimestamps.js'
import {
  claveNombreCategoria,
  normalizarColorCategoria,
  validarNombreCategoria,
} from '../domain/categoria-movimiento.js'
import {
  createCategoriaMovimientoDocument,
  getCategoriaMovimientoDocument,
  listCategoriaMovimientoDocuments,
  type CategoriaMovimientoDocument,
} from './categorias-movimientos.repository.js'

export interface CategoriaMovimientoApi {
  id: string
  nombre: string
  color: string | null
  createdAt: string | null
  createdBy: string
}

function serialize(id: string, data: CategoriaMovimientoDocument): CategoriaMovimientoApi {
  return {
    id,
    nombre: data.nombre,
    color: data.color ?? null,
    createdAt: agendaTimestampToIso(data.createdAt),
    createdBy: data.createdBy,
  }
}

export async function listCategoriasMovimientosApi(): Promise<CategoriaMovimientoApi[]> {
  const rows = await listCategoriaMovimientoDocuments()
  return rows
    .map((row) => serialize(row.id, row.data))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
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
  if (ya) return { categoria: serialize(ya.id, ya.data), creada: false }

  const color = normalizarColorCategoria(input.body.color, nombre)
  const id = await createCategoriaMovimientoDocument({
    nombre,
    nombreKey: key,
    color,
    createdBy: input.actorUid,
  })
  const creada = await getCategoriaMovimientoDocument(id)
  if (!creada) throw new Error('No se pudo leer la categoría recién creada')
  return { categoria: serialize(creada.id, creada.data), creada: true }
}
