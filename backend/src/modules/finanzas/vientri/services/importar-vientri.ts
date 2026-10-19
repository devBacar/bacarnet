/**
 * Importación de una carpeta de exportación de Vientri a Bacarnet.
 * Escribe SOLO en colecciones propias (vientri*). No toca cheques, agenda ni movimientos existentes.
 * Bacarnet nunca escribe en Vientri ni se conecta a su servidor: solo lee los CSV.
 */
import { CarpetaInvalidaError, procesarCarpeta } from '../domain/procesar.js'
import { ARCHIVOS_REQUERIDOS } from '../domain/control.js'
import {
  cerrarImportacion,
  contarColeccion,
  crearImportacion,
  guardarEstado,
  sincronizarColeccion,
  VIENTRI_CHEQUES,
  VIENTRI_PENDIENTES,
  VIENTRI_PERSONAS,
  type ConteoEscritura,
} from './vientri.repository.js'

export type LeerArchivo = (nombre: string) => Promise<string | null>

/** Si una carga completa trae menos de esta proporción de cheques que los que ya hay, se frena (copia incompleta). */
export const PROPORCION_MINIMA = 0.95

export interface ResultadoImportacion {
  ok: boolean
  importacionId: string | null
  fechaDatos: string | null
  mensaje: string
  simulado: boolean
  conteos?: Record<string, ConteoEscritura>
  resumen?: Record<string, unknown>
}

export async function importarVientri(opts: {
  leer: LeerArchivo
  carpeta: string
  origen: 'script' | 'programada' | 'manual'
  actor: string
  simular?: boolean
  forzar?: boolean
  /** Nombre del zip de Drive, si vino de ahí: sirve para no importar dos veces el mismo. */
  archivo?: string
}): Promise<ResultadoImportacion> {
  const simular = opts.simular === true
  const textos = new Map<string, string>()
  for (const nombre of ['_control.csv', 'tipos_comprobante.csv', ...ARCHIVOS_REQUERIDOS]) {
    const t = await opts.leer(nombre)
    if (t !== null) textos.set(nombre, t)
  }

  let proc
  try {
    proc = procesarCarpeta(textos)
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err)
    if (!simular) {
      const id = await crearImportacion({ carpeta: opts.carpeta, origen: opts.origen, actor: opts.actor, ok: false })
      const verificacion = err instanceof CarpetaInvalidaError ? err.verificacion : []
      await cerrarImportacion(id, { ok: false, mensaje, verificacion })
    }
    return { ok: false, importacionId: null, fechaDatos: null, mensaje, simulado: simular }
  }

  const resumen = {
    personas: proc.personas.length,
    cheques: proc.cheques.length,
    chequesEmitidos: proc.cheques.filter((c) => c.direccion === 'emitido').length,
    chequesRecibidos: proc.cheques.filter((c) => c.direccion === 'recibido').length,
    chequesEnCartera: proc.cheques.filter((c) => c.estado === 'en_cartera').length,
    chequesARevisar: proc.cheques.filter((c) => c.revisar.length > 0).length,
    pendientesPagar: proc.pendientes.filter((p) => p.lado === 'pagar').length,
    pendientesCobrar: proc.pendientes.filter((p) => p.lado === 'cobrar').length,
    pendientesRevisar: proc.pendientes.filter((p) => p.lado === 'revisar').length,
    cruceCheques: proc.resumenCheques,
  }

  const completo = proc.control.modo === 'completo'
  if (!completo) {
    return {
      ok: false,
      importacionId: null,
      fechaDatos: proc.control.fechaDatos,
      mensaje: 'Por ahora solo se aceptan exportaciones completas (sin -Desde).',
      simulado: simular,
      resumen,
    }
  }

  if (!opts.forzar) {
    const actuales = await contarColeccion(VIENTRI_CHEQUES)
    if (actuales > 0 && proc.cheques.length < actuales * PROPORCION_MINIMA) {
      return {
        ok: false,
        importacionId: null,
        fechaDatos: proc.control.fechaDatos,
        mensaje: `La exportación trae ${proc.cheques.length} cheques y hoy hay ${actuales}: parece incompleta. No se importó.`,
        simulado: simular,
        resumen,
      }
    }
  }

  const importacionId = simular
    ? 'simulacion'
    : await crearImportacion({
        carpeta: opts.carpeta,
        origen: opts.origen,
        actor: opts.actor,
        fechaDatos: proc.control.fechaDatos,
        modo: proc.control.modo,
        verificacion: proc.verificacion,
      })

  const comunes = { importacionId, borrarFaltantes: completo, simular }
  const fechaDatos = proc.control.fechaDatos
  const conteos: Record<string, ConteoEscritura> = {}
  conteos.personas = await sincronizarColeccion({
    ...comunes,
    coleccion: VIENTRI_PERSONAS,
    docs: proc.personas.map((p) => ({ id: `per-${p.vientriId}`, data: p })),
  })
  conteos.cheques = await sincronizarColeccion({
    ...comunes,
    coleccion: VIENTRI_CHEQUES,
    docs: proc.cheques.map((c) => ({ id: c.clave, data: { ...c, conRevisar: c.revisar.length > 0 } })),
  })
  conteos.pendientes = await sincronizarColeccion({
    ...comunes,
    coleccion: VIENTRI_PENDIENTES,
    docs: proc.pendientes.map((p) => ({ id: p.clave, data: { ...p, conRevisar: p.revisar.length > 0 } })),
  })

  const mensaje = `Importado: ${resumen.cheques} cheques, ${resumen.pendientesPagar} a pagar, ${resumen.pendientesCobrar} a cobrar.`
  if (!simular) {
    await cerrarImportacion(importacionId, { ok: true, mensaje, resumen, conteos })
    await guardarEstado({
      fechaDatos,
      archivo: opts.archivo ?? null,
      importadoAt: new Date(),
      importacionId,
      ok: true,
      mensaje,
      resumen: { ...resumen, tiposComprobante: proc.tiposComprobante.length },
    })
  }
  return { ok: true, importacionId, fechaDatos, mensaje, simulado: simular, conteos, resumen }
}
