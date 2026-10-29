/**
 * Trae la exportación de Vientri más nueva desde la carpeta de Drive y la importa.
 * La usan la tarea programada de cada mañana y el botón "Traer datos de Vientri ahora".
 * Si el zip más nuevo ya se importó, no hace nada (no gasta escrituras).
 */
import { hayQueImportar, leerZipVientri } from '../domain/zip.js'
import { importarVientri, type ResultadoImportacion } from './importar-vientri.js'
import { buscarUltimoZipVientri, descargarZipVientri } from './leer-drive.js'
import { leerEstado, soltarCandado, tomarCandado } from './vientri.repository.js'

export type ResultadoTraer =
  | { estado: 'importado'; archivo: string; mensaje: string; fechaDatos: string | null; resultado: ResultadoImportacion }
  | { estado: 'sin_novedades'; archivo: string; mensaje: string; fechaDatos: string | null }
  | { estado: 'sin_archivo'; mensaje: string }
  | { estado: 'ocupado'; mensaje: string }
  | { estado: 'error'; archivo: string | null; mensaje: string }

export async function traerVientriDesdeDrive(opts: {
  origen: 'programada' | 'manual'
  actor: string
}): Promise<ResultadoTraer> {
  const zip = await buscarUltimoZipVientri()
  if (!zip) {
    return { estado: 'sin_archivo', mensaje: 'No hay ninguna exportación de Vientri en la carpeta de Drive.' }
  }

  const ultimo = await leerEstado()
  if (!hayQueImportar(ultimo ? { archivo: ultimo.archivo, ok: ultimo.ok } : null, zip.nombre)) {
    return {
      estado: 'sin_novedades',
      archivo: zip.nombre,
      fechaDatos: ultimo?.fechaDatos ?? null,
      mensaje: 'Bacarnet ya tiene la última copia de Vientri. Todavía no hay una más nueva.',
    }
  }

  if (!(await tomarCandado(opts.actor))) {
    return { estado: 'ocupado', mensaje: 'Ya se están trayendo los datos de Vientri. Probá de nuevo en unos minutos.' }
  }
  try {
    const textos = await leerZipVientri(await descargarZipVientri(zip.id))
    const resultado = await importarVientri({
      leer: async (nombre) => textos.get(nombre) ?? null,
      carpeta: `drive:${zip.nombre}`,
      origen: opts.origen,
      actor: opts.actor,
      archivo: zip.nombre,
    })
    if (!resultado.ok) return { estado: 'error', archivo: zip.nombre, mensaje: resultado.mensaje }
    return {
      estado: 'importado',
      archivo: zip.nombre,
      fechaDatos: resultado.fechaDatos,
      mensaje: resultado.mensaje,
      resultado,
    }
  } catch (err) {
    return { estado: 'error', archivo: zip.nombre, mensaje: err instanceof Error ? err.message : String(err) }
  } finally {
    await soltarCandado()
  }
}

export type ResultadoIniciarTraer =
  | { estado: 'en_progreso'; archivo: string; mensaje: string }
  | { estado: 'sin_novedades'; archivo: string; fechaDatos: string | null; mensaje: string }
  | { estado: 'sin_archivo'; mensaje: string }
  | { estado: 'ocupado'; mensaje: string }

/**
 * Para el botón "Traer datos de Vientri ahora": solo decide si hay algo nuevo y toma el
 * candado (rápido), y dispara la descarga+importación en segundo plano sin esperarla, para
 * que el pedido HTTP no se cuelgue con el minuto largo que tarda bajar e importar el zip.
 * El estado real se consulta después con /estado (candado tomado = todavía importando).
 */
export async function iniciarTraerVientriDesdeDrive(opts: { actor: string }): Promise<ResultadoIniciarTraer> {
  const zip = await buscarUltimoZipVientri()
  if (!zip) {
    return { estado: 'sin_archivo', mensaje: 'No hay ninguna exportación de Vientri en la carpeta de Drive.' }
  }

  const ultimo = await leerEstado()
  if (!hayQueImportar(ultimo ? { archivo: ultimo.archivo, ok: ultimo.ok } : null, zip.nombre)) {
    return {
      estado: 'sin_novedades',
      archivo: zip.nombre,
      fechaDatos: ultimo?.fechaDatos ?? null,
      mensaje: 'Bacarnet ya tiene la última copia de Vientri. Todavía no hay una más nueva.',
    }
  }

  if (!(await tomarCandado(opts.actor))) {
    return { estado: 'ocupado', mensaje: 'Ya se están trayendo los datos de Vientri. Probá de nuevo en unos minutos.' }
  }

  void importarEnSegundoPlano(zip, opts.actor)

  return {
    estado: 'en_progreso',
    archivo: zip.nombre,
    mensaje: 'Importando los datos de Vientri. Volvé en un minuto y actualizá la pantalla.',
  }
}

async function importarEnSegundoPlano(zip: { id: string; nombre: string }, actor: string): Promise<void> {
  try {
    const textos = await leerZipVientri(await descargarZipVientri(zip.id))
    const resultado = await importarVientri({
      leer: async (nombre) => textos.get(nombre) ?? null,
      carpeta: `drive:${zip.nombre}`,
      origen: 'manual',
      actor,
      archivo: zip.nombre,
    })
    if (!resultado.ok) console.error('[finanzas/vientri] traer-ahora en segundo plano falló:', resultado.mensaje)
  } catch (err) {
    console.error('[finanzas/vientri] traer-ahora en segundo plano error:', err)
  } finally {
    await soltarCandado()
  }
}
