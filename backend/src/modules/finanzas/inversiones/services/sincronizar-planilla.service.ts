import type { AuthedUser } from '../../../auth/middleware.js'
import { confirmar, vistaPrevia } from './importar-planilla.service.js'
import { aprobarInversionAutomatica } from './inversiones.service.js'
import { descargarPlanillaInversoresDesdeDrive } from './planilla-drive.service.js'

const NOTA_AUTOAPROBACION = 'Aprobada sola: está vigente en la planilla de Inversores.'

/**
 * "Sincronizar ahora": trae la planilla de Google Sheets, carga lo nuevo y lo aprueba de una,
 * porque si está en la planilla ya está vigente y aprobado (no pasa por "Para aprobar").
 * Lo que ya estaba cargado no se duplica (ids fijos, ver importar-planilla.ts).
 */
export async function sincronizarPlanillaInversores(user: AuthedUser) {
  const archivo = await descargarPlanillaInversoresDesdeDrive(user.email)
  const previa = await vistaPrevia(archivo, null, user)
  const filasAIncluir = previa.filas.filter((f) => f.ok && f.incluir).map((f) => f.fila)

  if (filasAIncluir.length === 0) {
    return {
      creadas: 0,
      inversoresNuevos: 0,
      aprobadas: 0,
      erroresAprobacion: [] as string[],
      avisos: previa.avisos,
      resumen: previa.resumen,
      mensaje: 'La planilla no tiene filas nuevas para cargar.',
    }
  }

  const resultado = await confirmar(previa.token, filasAIncluir, user)
  let aprobadas = 0
  const erroresAprobacion: string[] = []
  for (const id of resultado.creadasIds) {
    try {
      await aprobarInversionAutomatica(id, user, NOTA_AUTOAPROBACION)
      aprobadas += 1
    } catch (err) {
      erroresAprobacion.push(`${id}: ${err instanceof Error ? err.message : 'no se pudo aprobar'}`)
    }
  }

  const partes = [`${resultado.creadas} inversiones nuevas`, `${aprobadas} aprobadas solas`]
  if (resultado.inversoresNuevos) partes.push(`${resultado.inversoresNuevos} inversores nuevos`)
  if (erroresAprobacion.length) partes.push(`${erroresAprobacion.length} quedaron sin aprobar (revisalas a mano)`)

  return {
    creadas: resultado.creadas,
    inversoresNuevos: resultado.inversoresNuevos,
    aprobadas,
    erroresAprobacion,
    avisos: previa.avisos,
    resumen: previa.resumen,
    mensaje: partes.join(' · ') + '.',
  }
}
