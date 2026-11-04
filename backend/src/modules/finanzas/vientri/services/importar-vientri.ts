/**
 * Importación de una carpeta de exportación de Vientri a Bacarnet.
 * Escribe SOLO en colecciones propias (vientri*). No toca cheques, agenda ni movimientos existentes.
 * Bacarnet nunca escribe en Vientri ni se conecta a su servidor: solo lee los CSV.
 */
import { sincronizarChequesDesdeVientri } from '../../cheques/services/sincronizar-desde-vientri.js'
import { ARCHIVOS_COMBUSTIBLE_OPCIONALES, ARCHIVOS_VENTAS_OPCIONALES, CarpetaInvalidaError, procesarCarpeta } from '../domain/procesar.js'
import { ARCHIVOS_REQUERIDOS } from '../domain/control.js'
import { aplicarVentana, MESES_VENTANA, restarMeses } from '../domain/ventana.js'
import { marcarRenovadosPorCadena } from '../domain/cheques-renovados.js'
import { armarChequesOcasionales, importarChequesOcasionales } from './importar-cheques-ocasionales.js'
import { agendaVientriActivada, sincronizarAgenda } from './sincronizar-agenda.js'
import { sincronizarAgendaCheques } from './sincronizar-agenda-cheques.js'
import {
  cerrarImportacion,
  contarColeccion,
  crearImportacion,
  guardarEstado,
  guardarLimpieza,
  leerEstado,
  sincronizarColeccion,
  VIENTRI_ART,
  VIENTRI_CHEQUES,
  VIENTRI_COMPRAS_COMBUSTIBLE,
  VIENTRI_COMPROBANTES,
  VIENTRI_ITEMS_COMPROBANTE,
  VIENTRI_PENDIENTES,
  VIENTRI_PERSONAS,
  VIENTRI_UNEGOCIO,
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
  for (const nombre of ['_control.csv', 'tipos_comprobante.csv', ...ARCHIVOS_REQUERIDOS, ...ARCHIVOS_VENTAS_OPCIONALES, ...ARCHIVOS_COMBUSTIBLE_OPCIONALES]) {
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

  // Cheques ocasionales (proveedores financieros) ya renovados: no deben seguir pendientes en la
  // Agenda aunque Vientri nunca los marque "pagados" (se reemplazan, no se cobran). La única señal
  // confiable sale del texto de OBS en cheques_propios.csv; si no está, se sigue sin este cruce.
  try {
    const propios = textos.get('cheques_propios.csv')
    const primeraLinea = (propios ?? '').split('\n', 1)[0]?.replace('\r', '') ?? ''
    if (propios && primeraLinea.split(';').includes('obs')) {
      const desde = restarMeses(proc.control.fechaDatos, MESES_VENTANA)
      const { docs: ocasionales } = await armarChequesOcasionales({ csv: propios, desde })
      proc = { ...proc, cheques: marcarRenovadosPorCadena(proc.cheques, ocasionales) }
    }
  } catch (err) {
    console.error('[importar-vientri] no se pudo cruzar cadenas de renovación de cheques ocasionales (se sigue sin el cruce)', err)
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

  // Ventas (tablero "Ventas"): aditivo, no toca nada de lo anterior. Si items/unegocio/art no vinieron
  // en esta exportación, igual se sincronizan los comprobantes (con idUnegocio null).
  try {
    conteos.ventasComprobantes = await sincronizarColeccion({
      ...comunes,
      coleccion: VIENTRI_COMPROBANTES,
      docs: proc.ventas.comprobantes.map((c) => ({ id: `cmp-${c.id}`, data: c })),
    })
    if (proc.ventas.items.length > 0) {
      conteos.ventasItems = await sincronizarColeccion({
        ...comunes,
        coleccion: VIENTRI_ITEMS_COMPROBANTE,
        docs: proc.ventas.items.map((i) => ({ id: i.id, data: i })),
      })
    }
    conteos.ventasUnegocio = await sincronizarColeccion({
      ...comunes,
      coleccion: VIENTRI_UNEGOCIO,
      docs: proc.ventas.unegocio.map((u) => ({ id: `un-${u.id}`, data: u })),
    })
    if (proc.ventas.art.length > 0) {
      conteos.ventasArt = await sincronizarColeccion({
        ...comunes,
        coleccion: VIENTRI_ART,
        docs: proc.ventas.art.map((a) => ({ id: `art-${a.id}`, data: a })),
      })
    }
  } catch (err) {
    console.error('[importar-vientri] sync de ventas falló (la importación de cheques/pendientes se completó)', err)
  }

  // Combustible (tablero "Combustible"): aditivo, no toca nada de lo anterior. Vacío si
  // compras_combustible.csv todavía no vino en esta exportación.
  try {
    if (proc.combustible.compras.length > 0) {
      conteos.combustibleCompras = await sincronizarColeccion({
        ...comunes,
        coleccion: VIENTRI_COMPRAS_COMBUSTIBLE,
        docs: proc.combustible.compras.map((c) => ({ id: `cmp-${c.id}`, data: c })),
      })
    }
  } catch (err) {
    console.error('[importar-vientri] sync de combustible falló (la importación de cheques/pendientes se completó)', err)
  }

  // Agenda: se calcula siempre; se escribe solo si está activada (vientriEstado/config.agenda) y no es simulación.
  const agendaActiva = await agendaVientriActivada()
  const escribirAgenda = agendaActiva && !simular
  const agenda = await sincronizarAgenda({
    pendientesEnVentana: pendientes,
    todosLosPendientes: proc.pendientes,
    fechaDatos,
    escribir: escribirAgenda,
    plazos: proc.plazos,
    desglosesPago: proc.desglosesPago,
  })
  const agendaCheques = await sincronizarAgendaCheques({
    chequesEnVentana: cheques,
    todosLosCheques: proc.cheques,
    fechaDatos,
    escribir: escribirAgenda,
  })
  const resumenFinal = {
    ...resumen,
    agenda: { activa: agendaActiva, ...agenda },
    agendaCheques: { activa: agendaActiva, ...agendaCheques },
  }

  const mensaje = `Importado: ${resumen.cheques} cheques, ${resumen.pendientesPagar} a pagar, ${resumen.pendientesCobrar} a cobrar.`
  if (!simular) {
    await cerrarImportacion(importacionId, { ok: true, mensaje, resumen: resumenFinal, conteos })
    await guardarLimpieza({ fechaDatos, desde: ventana.desde, items: ventana.limpieza })
    await guardarEstado({
      fechaDatos,
      archivo: opts.archivo ?? null,
      importadoAt: new Date(),
      importacionId,
      ok: true,
      mensaje,
      resumen: { ...resumenFinal, tiposComprobante: proc.tiposComprobante.length },
    })

    try {
      const syncResult = await sincronizarChequesDesdeVientri(opts.actor)
      console.log('[importar-vientri] sync cheques:', syncResult.insertados, 'ins', syncResult.actualizados, 'upd')
    } catch (err) {
      console.error('[importar-vientri] sync cheques falló (la importación se completó)', err)
    }

    // Cheques ocasionales (cadenas de renovación, operaciones USD): salen del campo obs de cheques_propios.csv.
    // Si la exportación es vieja y no trae obs, se sigue con la carga manual de CSV.
    try {
      const propios = textos.get('cheques_propios.csv')
      const primeraLinea = (propios ?? '').split('\n', 1)[0].replace('\r', '')
      if (propios && primeraLinea.split(';').includes('obs')) {
        const oca = await importarChequesOcasionales({ csv: propios, origen: 'script', actor: opts.actor, desde: ventana.desde })
        console.log('[importar-vientri] cheques ocasionales:', oca.mensaje)
      } else {
        console.log('[importar-vientri] cheques_propios.csv sin columna obs: cheques ocasionales sin actualizar')
      }
    } catch (err) {
      console.error('[importar-vientri] cheques ocasionales falló (la importación se completó)', err)
    }
  }
  return { ok: true, importacionId, fechaDatos, mensaje, simulado: simular, conteos, resumen: resumenFinal }
}
