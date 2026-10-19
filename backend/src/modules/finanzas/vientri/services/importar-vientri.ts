/**
 * Importación de una carpeta de exportación de Vientri a Bacarnet.
 * Escribe SOLO en colecciones propias (vientri*). No toca cheques, agenda ni movimientos existentes.
 * Bacarnet nunca escribe en Vientri ni se conecta a su servidor: solo lee los CSV.
 */
import { CarpetaInvalidaError, procesarCarpeta } from '../domain/procesar.js'
import { ARCHIVOS_REQUERIDOS } from '../domain/control.js'
import { aplicarVentana } from '../domain/ventana.js'
import {
  cerrarImportacion,
  contarColeccion,
  crearImportacion,
  guardarEstado,
  guardarLimpieza,
  leerEstado,
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

  // Solo lo que le sirve a Finanzas: últimos 12 meses (ver domain/ventana.ts).
  const ventana = aplicarVentana(proc.cheques, proc.pendientes, proc.control.fechaDatos)
  const cheques = ventana.cheques
  const pendientes = ventana.pendientes

  const resumen = {
    personas: proc.personas.length,
    desde: ventana.desde,
    chequesEnExportacion: proc.cheques.length,
    cheques: cheques.length,
    chequesEmitidos: cheques.filter((c) => c.direccion === 'emitido').length,
    chequesRecibidos: cheques.filter((c) => c.direccion === 'recibido').length,
    chequesEnCartera: cheques.filter((c) => c.estado === 'en_cartera').length,
    chequesARevisar: cheques.filter((c) => c.revisar.length > 0).length,
    chequesFueraDeVentana: ventana.fuera.cheques,
    chequesParaLimpiar: ventana.limpieza.length,
    pendientesPagar: pendientes.filter((p) => p.lado === 'pagar').length,
    pendientesCobrar: pendientes.filter((p) => p.lado === 'cobrar').length,
    pendientesRevisar: pendientes.filter((p) => p.lado === 'revisar').length,
    pendientesFueraDeVentana: ventana.fuera.pendientes,
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
    // Se compara el total de la exportación (antes de filtrar) con el de la importación anterior.
    const anterior = await leerEstado()
    const previo = Number(anterior?.resumen?.chequesEnExportacion) || (await contarColeccion(VIENTRI_CHEQUES))
    if (previo > 0 && proc.cheques.length < previo * PROPORCION_MINIMA) {
      return {
        ok: false,
        importacionId: null,
        fechaDatos: proc.control.fechaDatos,
        mensaje: `La exportación trae ${proc.cheques.length} cheques y la anterior traía ${previo}: parece incompleta. No se importó.`,
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
    docs: cheques.map((c) => ({ id: c.clave, data: { ...c, conRevisar: c.revisar.length > 0 } })),
  })
  conteos.pendientes = await sincronizarColeccion({
    ...comunes,
    coleccion: VIENTRI_PENDIENTES,
    docs: pendientes.map((p) => ({ id: p.clave, data: { ...p, conRevisar: p.revisar.length > 0 } })),
  })

  const mensaje = `Importado: ${resumen.cheques} cheques, ${resumen.pendientesPagar} a pagar, ${resumen.pendientesCobrar} a cobrar.`
  if (!simular) {
    await cerrarImportacion(importacionId, { ok: true, mensaje, resumen, conteos })
    await guardarLimpieza({ fechaDatos, desde: ventana.desde, items: ventana.limpieza })
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
