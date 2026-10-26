import { agendaTimestampToIso } from '../domain/agendaTimestamps.js'
import { normalizarNombre } from '../domain/normalizar-nombre.js'
import {
  borrarProveedorFinancieroDoc,
  crearProveedorFinancieroDoc,
  findProveedorFinancieroPorNombreNormalizado,
  listProveedoresFinancierosDocs,
  type ProveedorFinancieroVista,
} from './proveedores-financieros.repository.js'

export class ProveedorFinancieroError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function aVista(id: string, data: { nombre: string; creadoPor: string; createdAt: unknown }): ProveedorFinancieroVista {
  return {
    id,
    nombre: data.nombre,
    creadoPor: data.creadoPor,
    createdAt: agendaTimestampToIso(data.createdAt),
  }
}

export async function listarProveedoresFinancieros(): Promise<ProveedorFinancieroVista[]> {
  const rows = await listProveedoresFinancierosDocs()
  return rows
    .map((row) => aVista(row.id, row.data))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export async function agregarProveedorFinanciero(nombreRaw: unknown, uid: string): Promise<ProveedorFinancieroVista> {
  if (typeof nombreRaw !== 'string') {
    throw new ProveedorFinancieroError('Escribí el nombre del proveedor', 400)
  }
  const nombre = nombreRaw.trim()
  if (!nombre) throw new ProveedorFinancieroError('Escribí el nombre del proveedor', 400)
  if (nombre.length > 120) throw new ProveedorFinancieroError('El nombre es demasiado largo', 400)

  const clave = normalizarNombre(nombre)
  if (!clave) throw new ProveedorFinancieroError('Escribí el nombre del proveedor', 400)

  const existente = await findProveedorFinancieroPorNombreNormalizado(clave)
  if (existente) {
    throw new ProveedorFinancieroError('Ese proveedor ya está en la lista', 400)
  }

  const id = await crearProveedorFinancieroDoc(nombre, uid)
  return {
    id,
    nombre,
    creadoPor: uid,
    createdAt: new Date().toISOString(),
  }
}

export async function quitarProveedorFinanciero(id: string): Promise<void> {
  if (!id?.trim()) throw new ProveedorFinancieroError('Falta el proveedor', 400)
  const ok = await borrarProveedorFinancieroDoc(id)
  if (!ok) throw new ProveedorFinancieroError('Proveedor no encontrado', 404)
}
