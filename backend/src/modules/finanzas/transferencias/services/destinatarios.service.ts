import { agendaTimestampToDate, agendaTimestampToIso } from '../../agenda/domain/agendaTimestamps.js'
import { getCompromisoDocument } from '../../agenda/services/agenda.repository.js'
import { bancoNombreDesdeCbu } from '../domain/banco-por-cbu.js'
import { validarCbu, validarCuitOpcional } from '../domain/cbu-cuit.js'
import {
  agruparSugerencias,
  filtrarDestinatarios,
  type DestinatarioTipo,
  type DestinatarioVista,
  type TransferenciaParaSugerencia,
} from '../domain/destinatarios.rules.js'
import { listTransferenciasConfeccionadas } from './transferencias.repository.js'
import {
  createDestinatarioDocument,
  deleteDestinatarioDocument,
  DestinatarioDuplicadoError,
  getDestinatarioDocument,
  listDestinatarioDocuments,
  registrarUsoDestinatarioDocument,
  updateDestinatarioDocument,
  type DestinatarioDocument,
} from './destinatarios.repository.js'

const TIPOS: DestinatarioTipo[] = ['terceros', 'proveedores']

export class DestinatarioHttpError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'DestinatarioHttpError'
    this.status = status
  }
}

function texto(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function esTipo(value: string): value is DestinatarioTipo {
  return TIPOS.includes(value as DestinatarioTipo)
}

function aVista(id: string, data: DestinatarioDocument): DestinatarioVista {
  return {
    id,
    nombre: data.nombre,
    cbu: data.cbu,
    cuit: data.cuit,
    alias: data.alias,
    bancoNombre: data.bancoNombre,
    tipo: data.tipo,
    usos: data.usos,
    ultimoUsoAt: agendaTimestampToIso(data.ultimoUsoAt),
    sugerido: false,
  }
}

async function sugerenciasDesdeHistorial(): Promise<DestinatarioVista[]> {
  const transfers = await listTransferenciasConfeccionadas()
  const candidatas = transfers.filter(
    (row) => row.data.tipo === 'terceros' || row.data.tipo === 'proveedores',
  )
  const sinNombre = [
    ...new Set(
      candidatas
        .filter((row) => !row.data.destinoNombre?.trim() && row.data.compromisoPagoId)
        .map((row) => row.data.compromisoPagoId as string),
    ),
  ]
  const nombres = new Map<string, string>()
  await Promise.all(
    sinNombre.map(async (id) => {
      const compromiso = await getCompromisoDocument(id)
      if (compromiso?.proveedorONombre?.trim()) {
        nombres.set(id, compromiso.proveedorONombre.trim())
      }
    }),
  )

  const paraAgrupar: TransferenciaParaSugerencia[] = candidatas.map((row) => ({
    tipo: row.data.tipo,
    cuentaCreditoCbu: row.data.cuentaCreditoCbu,
    destinoNombre: row.data.destinoNombre ?? null,
    destinoCuit: row.data.destinoCuit ?? null,
    compromisoNombre: row.data.compromisoPagoId ? nombres.get(row.data.compromisoPagoId) ?? null : null,
    fechaMs: agendaTimestampToDate(row.data.fechaConfeccion)?.getTime() ?? 0,
  }))
  return agruparSugerencias(paraAgrupar)
}

export async function listDestinatariosApi(query: { q?: string; tipo?: string }) {
  const q = query.q?.trim().slice(0, 80) ?? ''
  const tipo = query.tipo?.trim() ?? ''
  if (tipo && !esTipo(tipo)) {
    throw new DestinatarioHttpError('El tipo de destinatario no es válido', 400)
  }

  const rows = await listDestinatarioDocuments()
  const vistas =
    rows.length === 0
      ? await sugerenciasDesdeHistorial()
      : rows.map((row) => aVista(row.id, row.data))

  return { destinatarios: filtrarDestinatarios(vistas, q, tipo || undefined) }
}

export async function crearDestinatarioApi(input: { actorUid: string; body: Record<string, unknown> }) {
  const nombre = texto(input.body.nombre)
  if (!nombre) throw new DestinatarioHttpError('El nombre es obligatorio', 400)
  if (nombre.length > 120) throw new DestinatarioHttpError('El nombre es demasiado largo', 400)

  const cbu = validarCbu(texto(input.body.cbu))
  if (!cbu.ok) throw new DestinatarioHttpError(cbu.error, 400)

  const cuit = validarCuitOpcional(texto(input.body.cuit))
  if (!cuit.ok) throw new DestinatarioHttpError(cuit.error, 400)

  const tipo = texto(input.body.tipo)
  if (!esTipo(tipo)) {
    throw new DestinatarioHttpError('El tipo tiene que ser terceros o proveedores', 400)
  }

  const alias = texto(input.body.alias)
  if (alias.length > 40) throw new DestinatarioHttpError('El alias no puede pasar de 40 caracteres', 400)

  try {
    await createDestinatarioDocument({
      cbu: cbu.valor,
      nombre,
      cuit: cuit.valor || null,
      alias: alias || null,
      bancoNombre: bancoNombreDesdeCbu(cbu.valor),
      tipo,
      actorUid: input.actorUid,
    })
  } catch (err) {
    if (err instanceof DestinatarioDuplicadoError || (err instanceof Error && err.name === 'DestinatarioDuplicadoError')) {
      throw new DestinatarioHttpError('Ese CBU ya está en la agenda', 409)
    }
    throw err
  }

  const creado = await getDestinatarioDocument(cbu.valor)
  if (!creado) throw new DestinatarioHttpError('No se pudo leer el destinatario', 500)
  return { destinatario: aVista(creado.id, creado.data) }
}

export async function actualizarDestinatarioApi(input: {
  id: string
  body: Record<string, unknown>
}) {
  const id = input.id.trim()
  if (!id) throw new DestinatarioHttpError('Destinatario inválido', 400)
  if (id.startsWith('sugerencia:')) {
    throw new DestinatarioHttpError(
      'Es una sugerencia del historial. Se guarda en la agenda cuando confecciones la transferencia.',
      400,
    )
  }

  const actual = await getDestinatarioDocument(id)
  if (!actual) throw new DestinatarioHttpError('Destinatario no encontrado', 404)

  const patch: Partial<Pick<DestinatarioDocument, 'nombre' | 'alias' | 'cuit' | 'tipo'>> = {}
  if ('nombre' in input.body) {
    const nombre = texto(input.body.nombre)
    if (!nombre) throw new DestinatarioHttpError('El nombre es obligatorio', 400)
    if (nombre.length > 120) throw new DestinatarioHttpError('El nombre es demasiado largo', 400)
    patch.nombre = nombre
  }
  if ('alias' in input.body) {
    const alias = texto(input.body.alias)
    if (alias.length > 40) throw new DestinatarioHttpError('El alias no puede pasar de 40 caracteres', 400)
    patch.alias = alias || null
  }
  if ('cuit' in input.body) {
    const cuit = validarCuitOpcional(texto(input.body.cuit))
    if (!cuit.ok) throw new DestinatarioHttpError(cuit.error, 400)
    patch.cuit = cuit.valor || null
  }
  if ('tipo' in input.body) {
    const tipo = texto(input.body.tipo)
    if (!esTipo(tipo)) throw new DestinatarioHttpError('El tipo tiene que ser terceros o proveedores', 400)
    patch.tipo = tipo
  }
  if (Object.keys(patch).length === 0) {
    throw new DestinatarioHttpError('No hay cambios para guardar', 400)
  }

  await updateDestinatarioDocument(id, patch)
  const actualizado = await getDestinatarioDocument(id)
  if (!actualizado) throw new DestinatarioHttpError('Destinatario no encontrado', 404)
  return { destinatario: aVista(actualizado.id, actualizado.data) }
}

export async function eliminarDestinatarioApi(idRaw: string) {
  const id = idRaw.trim()
  if (!id) throw new DestinatarioHttpError('Destinatario inválido', 400)
  if (id.startsWith('sugerencia:')) {
    throw new DestinatarioHttpError('Las sugerencias del historial no se pueden borrar de acá', 400)
  }
  try {
    await deleteDestinatarioDocument(id)
  } catch (err) {
    if (err instanceof Error && err.message === 'Destinatario no encontrado') {
      throw new DestinatarioHttpError('Destinatario no encontrado', 404)
    }
    throw err
  }
}

/** Alta o suma de usos después de una confección directa exitosa. No pisa nombre ni alias. */
export async function registrarUsoDestinatario(input: {
  nombre: string
  cbu: string
  cuit: string | null
  tipo: DestinatarioTipo
  actorUid: string
}): Promise<'alta' | 'suma'> {
  return registrarUsoDestinatarioDocument(input)
}
