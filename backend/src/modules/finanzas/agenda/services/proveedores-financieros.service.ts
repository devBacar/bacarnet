import { agendaTimestampToIso } from '../domain/agendaTimestamps.js'
import { normalizarNombre } from '../domain/normalizar-nombre.js'
import { aplicarFusion, aplicarRenombre } from '../domain/proveedores-financieros-cambios.js'
import {
  clavesDeProveedor,
  crearProveedorFinancieroDoc,
  darDeBajaProveedorFinancieroDoc,
  fusionarProveedoresDocs,
  getProveedorFinancieroDoc,
  guardarAliasDoc,
  guardarNombreDoc,
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

export async function renombrarProveedorFinanciero(id: string, nombreRaw: unknown): Promise<ProveedorFinancieroVista> {
  if (typeof nombreRaw !== 'string') throw new ProveedorFinancieroError('Escribí el nombre del proveedor', 400)
  const nombre = nombreRaw.trim().replace(/\s+/g, ' ')
  if (!nombre) throw new ProveedorFinancieroError('Escribí el nombre del proveedor', 400)
  if (nombre.length > 120) throw new ProveedorFinancieroError('El nombre es demasiado largo', 400)

  const data = await getProveedorFinancieroDoc(id)
  if (!data) throw new ProveedorFinancieroError('Proveedor no encontrado', 404)

  const dueno = await buscarDuenoDeNombre(normalizarNombre(nombre))
  if (dueno && dueno.id !== id) throw new ProveedorFinancieroError(`Ese nombre ya pertenece a ${dueno.nombre}`, 400)

  const cambios = aplicarRenombre({ nombre: data.nombre, nombreNormalizado: data.nombreNormalizado, alias: data.alias ?? [] }, nombre)
  await guardarNombreDoc(id, cambios)
  return aVista(id, { ...data, ...cambios })
}

/** `quedaId` absorbe a `seVaId`: se lleva todos sus nombres y el otro se da de baja. */
export async function fusionarProveedoresFinancieros(
  quedaId: string,
  seVaIdRaw: unknown,
  uid: string,
): Promise<ProveedorFinancieroVista> {
  if (typeof seVaIdRaw !== 'string' || !seVaIdRaw.trim()) {
    throw new ProveedorFinancieroError('Elegí el proveedor a juntar', 400)
  }
  const seVaId = seVaIdRaw.trim()
  if (seVaId === quedaId) throw new ProveedorFinancieroError('No se puede juntar un proveedor consigo mismo', 400)

  const [queda, seVa] = await Promise.all([getProveedorFinancieroDoc(quedaId), getProveedorFinancieroDoc(seVaId)])
  if (!queda || !seVa) throw new ProveedorFinancieroError('Proveedor no encontrado', 404)

  const resultado = aplicarFusion(
    { nombre: queda.nombre, nombreNormalizado: queda.nombreNormalizado, alias: queda.alias ?? [] },
    { nombre: seVa.nombre, nombreNormalizado: seVa.nombreNormalizado, alias: seVa.alias ?? [] },
  )
  await fusionarProveedoresDocs(quedaId, resultado.alias, seVaId, uid)
  return aVista(quedaId, { ...queda, alias: resultado.alias })
}

/** Baja lógica: el proveedor deja de enganchar cheques pero no se borra. */
export async function quitarProveedorFinanciero(id: string, uid = ''): Promise<void> {
  if (!id?.trim()) throw new ProveedorFinancieroError('Falta el proveedor', 400)
  const ok = await darDeBajaProveedorFinancieroDoc(id, uid)
  if (!ok) throw new ProveedorFinancieroError('Proveedor no encontrado', 404)
}
