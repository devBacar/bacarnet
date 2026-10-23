import type { ConfigInversiones, InversionDocumentBase, MonedaInversion } from '../domain/inversion.types.js'
import { enmascarar } from '../domain/textos.js'
import { ErrorValidacion, NoEncontrado, validarConfig, validarInversorDatos } from '../domain/validar.js'
import { resumenesDeInversiones } from './inversiones.service.js'
import {
  actualizarInversorDoc,
  crearInversorDoc,
  getConfigInversiones,
  getInversorDoc,
  guardarConfigInversiones,
  isoDe,
  listInversionesDocs,
  listInversoresDocs,
  normalizarNombre,
  type EstadoInversor,
  type InversorDocument,
} from './inversores.repository.js'

function capitalVigenteDe(inversiones: InversionDocumentBase[]): Record<MonedaInversion, number> {
  const total: Record<MonedaInversion, number> = { ARS: 0, USD: 0 }
  for (const inv of inversiones) {
    if (inv.estado === 'vigente') total[inv.moneda] += inv.capitalCentavos
  }
  return total
}

function resumenDe(id: string, d: InversorDocument, inversiones: InversionDocumentBase[]) {
  return {
    id,
    nombre: d.nombre,
    tipoPersona: d.tipoPersona ?? null,
    documentoMascara: enmascarar(d.cuit ?? d.dni),
    estado: d.estado,
    inversionesVigentes: inversiones.filter((i) => i.estado === 'vigente').length,
    capitalVigente: capitalVigenteDe(inversiones),
  }
}

export async function listarInversores() {
  const [inversores, inversiones] = await Promise.all([listInversoresDocs(), listInversionesDocs()])
  const porInversor = new Map<string, InversionDocumentBase[]>()
  for (const { data } of inversiones) {
    const lista = porInversor.get(data.inversorId) ?? []
    lista.push(data)
    porInversor.set(data.inversorId, lista)
  }
  return inversores
    .map(({ id, data }) => resumenDe(id, data, porInversor.get(id) ?? []))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export async function fichaInversor(id: string) {
  const [d, { items }] = await Promise.all([getInversorDoc(id), resumenesDeInversiones(id)])
  if (!d) throw new NoEncontrado('No encontré ese inversor.')
  return {
    id,
    nombre: d.nombre,
    tipoPersona: d.tipoPersona ?? null,
    cuit: d.cuit ?? null,
    dni: d.dni ?? null,
    email: d.email ?? null,
    telefono: d.telefono ?? null,
    domicilio: d.domicilio ?? null,
    cbuArs: d.cbuArs ?? null,
    cuentaUsd: d.cuentaUsd ?? null,
    inscriptoGanancias: d.inscriptoGanancias ?? null,
    observaciones: d.observaciones ?? null,
    estado: d.estado,
    inversiones: items.map((i) => i.resumen),
    createdAt: isoDe(d.createdAt),
    updatedAt: isoDe(d.updatedAt),
  }
}

async function asegurarNombreLibre(nombre: string, exceptoId?: string): Promise<void> {
  const buscado = normalizarNombre(nombre)
  const todos = await listInversoresDocs()
  if (todos.some(({ id, data }) => id !== exceptoId && data.nombreNormalizado === buscado)) {
    throw new ErrorValidacion('Ya hay un inversor con ese nombre. Buscalo en la lista o usá otro nombre.')
  }
}

export async function crearInversor(raw: unknown, uid: string) {
  const datos = validarInversorDatos(raw)
  await asegurarNombreLibre(datos.nombre)
  const id = await crearInversorDoc(datos, uid)
  return fichaInversor(id)
}

export async function editarInversor(id: string, raw: unknown, uid: string) {
  if (!(await getInversorDoc(id))) throw new NoEncontrado('No encontré ese inversor.')
  const datos = validarInversorDatos(raw)
  await asegurarNombreLibre(datos.nombre, id)
  await actualizarInversorDoc(id, datos, uid)
  return fichaInversor(id)
}

/** Baja lógica: un inversor con inversiones vigentes no se puede pasar a inactivo. */
export async function cambiarEstadoInversor(id: string, estado: unknown, uid: string) {
  if (estado !== 'activo' && estado !== 'inactivo') throw new ErrorValidacion('El estado no es válido.')
  if (!(await getInversorDoc(id))) throw new NoEncontrado('No encontré ese inversor.')
  if (estado === 'inactivo') {
    const inversiones = await listInversionesDocs(id)
    const abiertas = inversiones.filter(({ data }) =>
      ['borrador', 'pendiente_aprobacion', 'vigente'].includes(data.estado),
    )
    if (abiertas.length > 0) {
      throw new ErrorValidacion('No se puede dar de baja: tiene inversiones vigentes o en trámite.')
    }
  }
  await actualizarInversorDoc(id, { estado: estado as EstadoInversor }, uid)
  return fichaInversor(id)
}

/** La pantalla no necesita el número correlativo. */
export async function leerConfig(): Promise<Omit<ConfigInversiones, 'ultimoNumero'>> {
  const { ultimoNumero: _n, ...resto } = await getConfigInversiones()
  return resto
}

export async function guardarConfig(raw: unknown, uid: string) {
  const config = validarConfig(raw, await getConfigInversiones())
  await guardarConfigInversiones(config, uid)
  return leerConfig()
}
