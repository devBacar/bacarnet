import { agendaTimestampToIso } from '../domain/agendaTimestamps.js'
import { normalizarNombre } from '../domain/normalizar-nombre.js'
import {
  borrarProveedorFinancieroDoc,
  clavesDeProveedor,
  crearProveedorFinancieroDoc,
  getProveedorFinancieroDoc,
  guardarAliasDoc,
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

function aVista(
  id: string,
  data: { nombre: string; alias?: string[]; creadoPor: string; createdAt: unknown },
): ProveedorFinancieroVista {
  return {
    id,
    nombre: data.nombre,
    alias: data.alias ?? [],
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

  const dueno = await buscarDuenoDeNombre(clave)
  if (dueno) {
    throw new ProveedorFinancieroError(
      dueno.esNombrePrincipal ? 'Ese proveedor ya está en la lista' : `Ese nombre ya está como alias de ${dueno.nombre}`,
      400,
    )
  }

  const id = await crearProveedorFinancieroDoc(nombre, uid)
  return {
    id,
    nombre,
    alias: [],
    creadoPor: uid,
    createdAt: new Date().toISOString(),
  }
}

/** Proveedor que ya usa este nombre normalizado, sea como nombre propio o como alias. */
async function buscarDuenoDeNombre(
  clave: string,
): Promise<{ id: string; nombre: string; esNombrePrincipal: boolean } | null> {
  const rows = await listProveedoresFinancierosDocs()
  for (const row of rows) {
    if (clavesDeProveedor(row.data).includes(clave)) {
      return { id: row.id, nombre: row.data.nombre, esNombrePrincipal: row.data.nombreNormalizado === clave }
    }
  }
  return null
}

function validarAlias(aliasRaw: unknown): { alias: string; clave: string } {
  if (typeof aliasRaw !== 'string') throw new ProveedorFinancieroError('Escribí el nombre alternativo', 400)
  const alias = aliasRaw.trim().replace(/\s+/g, ' ')
  if (!alias) throw new ProveedorFinancieroError('Escribí el nombre alternativo', 400)
  if (alias.length > 120) throw new ProveedorFinancieroError('El nombre es demasiado largo', 400)
  return { alias, clave: normalizarNombre(alias) }
}

export async function agregarAliasProveedorFinanciero(id: string, aliasRaw: unknown): Promise<ProveedorFinancieroVista> {
  const { alias, clave } = validarAlias(aliasRaw)
  const data = await getProveedorFinancieroDoc(id)
  if (!data) throw new ProveedorFinancieroError('Proveedor no encontrado', 404)

  const dueno = await buscarDuenoDeNombre(clave)
  if (dueno) {
    throw new ProveedorFinancieroError(
      dueno.id === id ? 'Ese nombre ya está en este proveedor' : `Ese nombre ya pertenece a ${dueno.nombre}`,
      400,
    )
  }

  const nuevos = [...(data.alias ?? []), alias]
  await guardarAliasDoc(id, nuevos)
  return aVista(id, { ...data, alias: nuevos })
}

export async function quitarAliasProveedorFinanciero(id: string, aliasRaw: unknown): Promise<ProveedorFinancieroVista> {
  const { clave } = validarAlias(aliasRaw)
  const data = await getProveedorFinancieroDoc(id)
  if (!data) throw new ProveedorFinancieroError('Proveedor no encontrado', 404)

  const actuales = data.alias ?? []
  const nuevos = actuales.filter((a) => normalizarNombre(a) !== clave)
  if (nuevos.length === actuales.length) throw new ProveedorFinancieroError('Ese nombre alternativo no está en el proveedor', 404)

  await guardarAliasDoc(id, nuevos)
  return aVista(id, { ...data, alias: nuevos })
}

export async function quitarProveedorFinanciero(id: string): Promise<void> {
  if (!id?.trim()) throw new ProveedorFinancieroError('Falta el proveedor', 400)
  const ok = await borrarProveedorFinancieroDoc(id)
  if (!ok) throw new ProveedorFinancieroError('Proveedor no encontrado', 404)
}
