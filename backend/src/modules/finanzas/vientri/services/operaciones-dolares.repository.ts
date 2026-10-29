import { adminDb } from '../../../../lib/firebase/admin.js'
import { calcularOperacion, validarOperacionInput, type ErrorValidacion } from '../domain/operacion-dolares.js'
import type { OperacionDolares, OperacionDolaresInput } from '../domain/operacion-dolares.types.js'

const COLECCION = 'operacionesDolares'

function coleccion() {
  return adminDb().collection(COLECCION)
}

export async function crearOperacionDolares(
  input: OperacionDolaresInput,
  actor: string,
): Promise<{ ok: true; operacion: OperacionDolares } | { ok: false; errores: ErrorValidacion[] }> {
  const errores = validarOperacionInput(input)
  if (errores.length > 0) return { ok: false, errores }

  const calculado = calcularOperacion(input)
  const ahora = new Date().toISOString()

  const snap = await coleccion().orderBy('numero', 'desc').limit(1).get()
  const ultimoNumero = snap.empty ? 0 : ((snap.docs[0]!.data() as OperacionDolares).numero ?? 0)
  const numero = ultimoNumero + 1
  const id = `op-${String(numero).padStart(4, '0')}`
  const ref = coleccion().doc(id)

  const operacion: OperacionDolares = {
    ...calculado,
    id,
    numero,
    estado: 'activa',
    creadoPor: actor,
    creadoEn: ahora,
    actualizadoEn: ahora,
  }

  await ref.set(operacion)
  return { ok: true, operacion }
}

export async function actualizarOperacionDolares(
  id: string,
  input: OperacionDolaresInput,
  actor: string,
): Promise<{ ok: true; operacion: OperacionDolares } | { ok: false; errores: ErrorValidacion[] } | { ok: false; error: string }> {
  const errores = validarOperacionInput(input)
  if (errores.length > 0) return { ok: false, errores }

  const ref = coleccion().doc(id)
  const snap = await ref.get()
  if (!snap.exists) return { ok: false, error: 'Operación no encontrada' }

  const existente = snap.data() as OperacionDolares
  if (existente.estado === 'anulada') return { ok: false, error: 'No se puede editar una operación anulada' }

  const calculado = calcularOperacion(input)
  const operacion: OperacionDolares = {
    ...calculado,
    id,
    numero: existente.numero,
    estado: 'activa',
    creadoPor: existente.creadoPor,
    creadoEn: existente.creadoEn,
    actualizadoEn: new Date().toISOString(),
  }

  await ref.set(operacion)
  return { ok: true, operacion }
}

export async function anularOperacionDolares(
  id: string,
  _actor: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ref = coleccion().doc(id)
  const snap = await ref.get()
  if (!snap.exists) return { ok: false, error: 'Operación no encontrada' }

  const existente = snap.data() as OperacionDolares
  if (existente.estado === 'anulada') return { ok: false, error: 'La operación ya está anulada' }

  await ref.update({
    estado: 'anulada',
    actualizadoEn: new Date().toISOString(),
  })
  return { ok: true }
}

export async function obtenerOperacionDolares(id: string): Promise<OperacionDolares | null> {
  const snap = await coleccion().doc(id).get()
  return snap.exists ? (snap.data() as OperacionDolares) : null
}

export async function listarOperacionesDolares(): Promise<OperacionDolares[]> {
  const snap = await coleccion().orderBy('fecha', 'desc').get()
  return snap.docs.map((d) => d.data() as OperacionDolares)
}
