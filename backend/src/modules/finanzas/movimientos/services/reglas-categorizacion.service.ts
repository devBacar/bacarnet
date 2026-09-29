import { agendaTimestampToIso } from '../../agenda/domain/agendaTimestamps.js'
import { claveDescripcionRegla, validarDescripcionRegla } from '../domain/regla-categorizacion.js'
import { SEMILLA_CATEGORIAS_MOVIMIENTOS } from '../domain/reglas-semilla.js'
import { crearCategoriaMovimientoApi } from './categorias-movimientos.service.js'
import { getCategoriaMovimientoDocument } from './categorias-movimientos.repository.js'
import { asignarCategoriaPorDescripcion } from './movimientos.repository.js'
import {
  createReglaCategorizacionDocument,
  findReglaPorDescripcion,
  getReglaCategorizacionDocument,
  listReglaCategorizacionDocuments,
  updateReglaCategoria,
  type ReglaCategorizacionDocument,
} from './reglas-categorizacion.repository.js'

export interface ReglaCategorizacionApi {
  id: string
  descripcionExacta: string
  categoriaId: string
  createdAt: string | null
  createdBy: string
}

export class ReglaCategorizacionError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ReglaCategorizacionError'
    this.status = status
  }
}

function serialize(id: string, data: ReglaCategorizacionDocument): ReglaCategorizacionApi {
  return {
    id,
    descripcionExacta: data.descripcionExacta,
    categoriaId: data.categoriaId,
    createdAt: agendaTimestampToIso(data.createdAt),
    createdBy: data.createdBy,
  }
}

export async function listReglasCategorizacionApi(): Promise<ReglaCategorizacionApi[]> {
  const rows = await listReglaCategorizacionDocuments()
  return rows
    .map((row) => serialize(row.id, row.data))
    .sort((a, b) => a.descripcionExacta.localeCompare(b.descripcionExacta, 'es'))
}

/**
 * Crea (o redirige) la regla y categoriza retroactivamente TODOS los movimientos
 * existentes con esa descripción exacta, en cualquier cuenta.
 */
export async function crearReglaCategorizacion(input: {
  actorUid: string
  descripcionExacta: unknown
  categoriaId: unknown
}): Promise<{ regla: ReglaCategorizacionApi; creada: boolean; movimientosActualizados: number }> {
  const descripcion = validarDescripcionRegla(input.descripcionExacta)
  if (typeof input.categoriaId !== 'string' || !input.categoriaId.trim()) {
    throw new ReglaCategorizacionError('Elegí una categoría para la regla', 400)
  }
  const categoria = await getCategoriaMovimientoDocument(input.categoriaId.trim())
  if (!categoria) throw new ReglaCategorizacionError('La categoría no existe', 404)

  const key = claveDescripcionRegla(descripcion)
  const existente = await findReglaPorDescripcion(key)
  let id: string
  let creada: boolean
  if (existente) {
    id = existente.id
    creada = false
    if (existente.data.categoriaId !== categoria.id) {
      await updateReglaCategoria({ id, categoriaId: categoria.id, updatedBy: input.actorUid })
    }
  } else {
    id = await createReglaCategorizacionDocument({
      descripcionExacta: descripcion,
      descripcionKey: key,
      categoriaId: categoria.id,
      createdBy: input.actorUid,
    })
    creada = true
  }

  const movimientosActualizados = await asignarCategoriaPorDescripcion({
    descripcionExacta: descripcion,
    categoriaId: categoria.id,
  })

  const guardada = await getReglaCategorizacionDocument(id)
  if (!guardada) throw new Error('No se pudo leer la regla recién guardada')
  return { regla: serialize(guardada.id, guardada.data), creada, movimientosActualizados }
}

export interface SemillaResultado {
  categorias: Array<{ nombre: string; id: string; creada: boolean }>
  reglas: Array<{ descripcionExacta: string; categoria: string; creada: boolean; movimientosActualizados: number }>
}

/** Carga la semilla inicial. Idempotente: reutiliza categorías y reglas ya existentes. */
export async function sembrarReglasCategorizacion(input: { actorUid: string }): Promise<SemillaResultado> {
  const resultado: SemillaResultado = { categorias: [], reglas: [] }
  for (const semilla of SEMILLA_CATEGORIAS_MOVIMIENTOS) {
    const { categoria, creada } = await crearCategoriaMovimientoApi({
      actorUid: input.actorUid,
      body: { nombre: semilla.nombre, color: semilla.color },
    })
    resultado.categorias.push({ nombre: categoria.nombre, id: categoria.id, creada })
    for (const descripcion of semilla.descripciones) {
      const regla = await crearReglaCategorizacion({
        actorUid: input.actorUid,
        descripcionExacta: descripcion,
        categoriaId: categoria.id,
      })
      resultado.reglas.push({
        descripcionExacta: descripcion,
        categoria: categoria.nombre,
        creada: regla.creada,
        movimientosActualizados: regla.movimientosActualizados,
      })
    }
  }
  return resultado
}
