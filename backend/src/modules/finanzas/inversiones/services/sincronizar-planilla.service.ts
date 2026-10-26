import type { AuthedUser } from '../../../auth/middleware.js'
import { getInversionDoc } from './inversiones.repository.js'
import { aprobarInversion, aprobarInversionAutomatica } from './inversiones.service.js'
import { confirmar, vistaPrevia } from './importar-planilla.service.js'
import { asegurarCajaPrincipal } from './caja-principal-inversiones.js'
import { descargarPlanillaInversoresDesdeDrive } from './planilla-drive.service.js'

const NOTA_AUTOAPROBACION = 'Aprobada sola: está vigente en la planilla de Inversores.'
/** Clave fija del ingreso de capital al sincronizar (idempotente por inversión). */
const CLAVE_CAPITAL_CAJA = 'pla-caja-1'

/**
 * "Sincronizar ahora": trae la planilla de Google Sheets, carga lo nuevo y lo aprueba de una,
 * porque si está en la planilla ya está vigente y aprobado (no pasa por "Para aprobar").
 * Lo que ya estaba cargado no se duplica (ids fijos, ver importar-planilla.ts).
 * Capital realmente nuevo (inversor/cadena que no venía de meses anteriores): suma a la Caja principal.
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
  const capitalNuevo = new Set(resultado.capitalNuevoIds)
  let aprobadas = 0
  const erroresAprobacion: string[] = []
  for (const id of resultado.creadasIds) {
    try {
      if (capitalNuevo.has(id)) {
        await aprobarConCapitalEnCaja(id, user)
      } else {
        await aprobarInversionAutomatica(id, user, NOTA_AUTOAPROBACION)
      }
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

/** Aprueba y registra el capital en la Caja principal (mismo camino que ingreso manual en efectivo). */
export async function aprobarConCapitalEnCaja(id: string, user: AuthedUser) {
  const inv = await getInversionDoc(id)
  if (!inv) throw new Error(`No encontré la inversión ${id}`)
  const cajaId = await asegurarCajaPrincipal(inv.moneda, user)
  const detalle = await aprobarInversion(
    id,
    {
      nota: NOTA_AUTOAPROBACION,
      ingreso: {
        clave: CLAVE_CAPITAL_CAJA,
        medio: 'efectivo',
        fecha: inv.fechaAlta,
        montoCentavos: inv.capitalCentavos,
        cajaId,
      },
    },
    user,
  )
  if (detalle && typeof detalle === 'object' && 'ingresoError' in detalle && detalle.ingresoError) {
    throw new Error(String(detalle.ingresoError))
  }
  return detalle
}
