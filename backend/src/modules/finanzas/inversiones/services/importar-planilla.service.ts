import { randomUUID } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import * as XLSX from 'xlsx'
import { adminDb } from '../../../../lib/firebase/admin.js'
import type { AuthedUser } from '../../../auth/middleware.js'
import { horizonteSinVencimiento } from '../domain/condiciones.js'
import { generarCronograma, totalesDe } from '../domain/cronograma.js'
import { hoyArgentina } from '../domain/fechas.js'
import {
  encadenar,
  historialDe,
  idInversionImportada,
  interpretar,
  leerInversoresDeHoja,
  mesDeHoja,
  normalizar,
  type Cadena,
} from '../domain/importar-planilla.js'
import type { CondicionesInversion, InversionDocumentBase } from '../domain/inversion.types.js'
import { ErrorValidacion, numeroInversion } from '../domain/validar.js'
import {
  crearInversorDoc,
  getConfigInversiones,
  INVERSIONES_COLLECTION,
  listInversoresDocs,
  normalizarNombre,
  siguienteNumeroInversion,
} from './inversores.repository.js'

const IMPORTACIONES_COLLECTION = 'inversionesImportaciones'
const VENCE_MS = 30 * 60 * 1000

/** Lo que se guarda entre la vista previa y la confirmación (para crear exactamente lo que se vio). */
interface Propuesta {
  fila: number
  id: string
  inversorNombre: string
  condiciones: CondicionesInversion | null
  observacionPlanilla: string | null
  cuotaPlanilla: string | null
  inicioPlanilla: string
  historialPlanilla: Array<{ mes: string; fecha: string; montoCentavos: number }>
}

function libroDe(buffer: Buffer): XLSX.WorkBook {
  try {
    return XLSX.read(buffer, { type: 'buffer' })
  } catch {
    throw new ErrorValidacion('No pude abrir el archivo. Tiene que ser la planilla de compromisos en Excel (.xlsx).')
  }
}

function celdas(wb: XLSX.WorkBook, hoja: string): unknown[][] {
  return XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, raw: true, defval: null }) as unknown[][]
}

/** Hojas mensuales hasta la elegida (por defecto, la más nueva). */
function hojasHasta(wb: XLSX.WorkBook, elegida: string | null): { hojas: string[]; hoja: string } {
  const mensuales = wb.SheetNames.filter((n) => mesDeHoja(n)).sort((a, b) => mesDeHoja(a)!.localeCompare(mesDeHoja(b)!))
  if (mensuales.length === 0) throw new ErrorValidacion('No encontré hojas "Compromisos MM.AAAA" en el archivo.')
  const hoja = elegida && mensuales.includes(elegida) ? elegida : mensuales.at(-1)!
  return { hojas: [...mensuales].reverse(), hoja }
}

export async function vistaPrevia(archivo: Buffer, hojaElegida: string | null, user: AuthedUser) {
  const wb = libroDe(archivo)
  const { hojas, hoja } = hojasHasta(wb, hojaElegida)
  const mesTope = mesDeHoja(hoja)!
  const leidas = hojas.filter((h) => mesDeHoja(h)! <= mesTope).map((h) => leerInversoresDeHoja(celdas(wb, h), h))
  const avisosHojas = leidas.flatMap((h) => h.avisos)
  const config = await getConfigInversiones()
  const hoy = hoyArgentina()
  const [inversores, existentes] = await Promise.all([
    listInversoresDocs(),
    adminDb().collection(INVERSIONES_COLLECTION).where('importada', '==', true).get(),
  ])
  const yaImportadas = new Set(existentes.docs.map((d) => d.id))
  const porNombre = new Map(inversores.map(({ id, data }) => [data.nombreNormalizado, id]))

  const propuestas: Propuesta[] = []
  const filas = encadenar(leidas).map((cadena: Cadena) => {
    const actual = cadena.meses.at(-1)!
    const r = interpretar(actual, config)
    const id = idInversionImportada(cadena)
    const historial = historialDe(cadena)
    let totales = null
    if (r.condiciones) {
      try {
        totales = totalesDe(generarCronograma(r.condiciones, {}, null, { hasta: horizonteSinVencimiento(hoy, config) }))
      } catch (err) {
        r.errores.push(err instanceof Error ? err.message : 'No pude calcular las cuotas.')
      }
    }
    propuestas.push({
      fila: actual.fila,
      id,
      inversorNombre: actual.concepto,
      condiciones: r.errores.length ? null : r.condiciones,
      observacionPlanilla: actual.observacion,
      cuotaPlanilla: actual.cuotaTexto,
      inicioPlanilla: cadena.meses[0].mes,
      historialPlanilla: historial,
    })
    const c = r.condiciones
    return {
      fila: actual.fila,
      ok: r.errores.length === 0,
      errores: r.errores,
      avisos: [...r.avisos, ...cadena.revisar],
      inversorNombre: actual.concepto,
      inversorExistenteId: porNombre.get(normalizarNombre(actual.concepto)) ?? null,
      observacionPlanilla: actual.observacion,
      cuotaPlanilla: actual.cuotaTexto,
      importeMesCentavos: actual.importeCentavos,
      moneda: actual.moneda,
      capitalCentavos: actual.deudaCentavos,
      fechaAlta: c?.fechaAlta ?? null,
      sistema: c?.sistema ?? null,
      sinVencimiento: c?.sinVencimiento ?? false,
      tasaMensualPct: c && c.tasa.tipo === 'fija' ? Math.round((c.tasa.tnaPct / 12) * 10000) / 10000 : null,
      cantidadCuotas: c && !c.sinVencimiento ? c.cantidadCuotas : null,
      cuotasPagadas: r.cuotasPagadas,
      interpretacion: r.texto,
      totales,
      incluir: !yaImportadas.has(id),
      desdeMes: cadena.meses[0].mes,
      mesesEncontrados: cadena.meses.length,
      pagosEncontrados: historial.length,
      yaImportada: yaImportadas.has(id),
    }
  })

  const token = randomUUID()
  await adminDb()
    .collection(IMPORTACIONES_COLLECTION)
    .doc(token)
    .set({ propuestas, hoja, creadoPor: user.uid, venceMs: Date.now() + VENCE_MS, createdAt: Timestamp.now() })

  const nombresNuevos = new Set(filas.filter((f) => !f.inversorExistenteId).map((f) => normalizar(f.inversorNombre)))
  return {
    token,
    hojas,
    hoja,
    avisos: avisosHojas,
    filas,
    resumen: {
      total: filas.length,
      ok: filas.filter((f) => f.ok).length,
      conErrores: filas.filter((f) => !f.ok).length,
      inversoresNuevos: nombresNuevos.size,
    },
  }
}

/**
 * Crea lo elegido en la vista previa. Idempotente: cada inversión tiene id fijo y se crea solo si no existe;
 * el inversor se reusa por nombre. Las inversiones quedan "Para aprobar" (las revisa el Líder).
 * Las filas que no se pudieron interpretar crean solo el inversor.
 */
export async function confirmar(token: unknown, filasRaw: unknown, user: AuthedUser) {
  if (typeof token !== 'string' || !token) throw new ErrorValidacion('Falta la vista previa. Volvé a subir la planilla.')
  if (!Array.isArray(filasRaw) || filasRaw.some((f) => typeof f !== 'number')) throw new ErrorValidacion('Elegí qué filas importar.')
  // Solo se usa lo guardado en la vista previa: del navegador llegan únicamente los números de fila elegidos.
  // La vista previa es de un solo uso: una transacción la marca como consumida (doble clic → error claro).
  const tokenRef = adminDb().collection(IMPORTACIONES_COLLECTION).doc(token)
  const guardada = await adminDb().runTransaction(async (tx) => {
    const d = (await tx.get(tokenRef)).data() as { propuestas: Propuesta[]; venceMs: number; creadoPor: string; consumida?: boolean } | undefined
    if (!d || d.venceMs < Date.now()) throw new ErrorValidacion('La vista previa venció. Volvé a subir la planilla.')
    if (d.creadoPor !== user.uid) throw new ErrorValidacion('Esa vista previa la armó otra persona. Volvé a subir la planilla.')
    if (d.consumida) throw new ErrorValidacion('Esta importación ya se confirmó. Para volver a importar, subí la planilla de nuevo.')
    tx.update(tokenRef, { consumida: true })
    return d
  })
  const elegidas = guardada.propuestas.filter((p) => (filasRaw as number[]).includes(p.fila))

  const config = await getConfigInversiones()
  const hoy = hoyArgentina()
  const porNombre = new Map((await listInversoresDocs()).map(({ id, data }) => [data.nombreNormalizado, id]))
  let inversoresNuevos = 0
  let creadas = 0
  let yaEstaban = 0

  for (const p of elegidas) {
    const clave = normalizarNombre(p.inversorNombre)
    let inversorId = porNombre.get(clave)
    if (!inversorId) {
      inversorId = await crearInversorDoc(
        { nombre: p.inversorNombre, tipoPersona: null, cuit: null, dni: null, email: null, telefono: null, domicilio: null, cbuArs: null, cuentaUsd: null, observaciones: 'Creado desde la planilla de compromisos' },
        user.uid,
        `pla-${clave.replace(/[^a-z0-9]+/g, '-').slice(0, 60)}`,
      )
      porNombre.set(clave, inversorId)
      inversoresNuevos += 1
    }
    if (!p.condiciones) continue

    const ref = adminDb().collection(INVERSIONES_COLLECTION).doc(p.id)
    if ((await ref.get()).exists) {
      yaEstaban += 1
      continue
    }
    const cond = p.condiciones
    const ahora = new Date().toISOString()
    const data: InversionDocumentBase = {
      ...cond,
      numero: numeroInversion(await siguienteNumeroInversion()),
      inversorId,
      inversorNombre: p.inversorNombre,
      estado: 'pendiente_aprobacion',
      cronograma: generarCronograma(cond, {}, null, { hasta: cond.sinVencimiento ? horizonteSinVencimiento(hoy, config) : null }),
      ingresos: [
        {
          id: 'importado',
          medio: 'transferencia',
          fecha: cond.fechaAlta,
          montoCentavos: cond.capitalCentavos,
          cuentaId: null,
          cajaId: null,
          chequeId: null,
          movimientoId: null,
          nota: 'El capital ya había entrado (según la planilla).',
          registradoPor: user.uid,
          registradoPorNombre: user.displayName,
          registradoAt: ahora,
          importado: true,
        },
      ],
      aprobacion: { solicitadaPor: user.uid, solicitadaPorNombre: user.displayName, solicitadaAt: ahora, resueltaPor: null, resueltaPorNombre: null, resueltaAt: null, resultado: null, nota: 'Importada de la planilla' },
      operacionPendiente: null,
      renovacionDe: null,
      renovadaEn: null,
      versionCronograma: 1,
      indiceAlta: null,
      observaciones: [p.observacionPlanilla, p.cuotaPlanilla && p.cuotaPlanilla !== '-' ? `Cuota en la planilla: ${p.cuotaPlanilla}` : null].filter(Boolean).join(' · ') || null,
      importada: true,
      inicioPlanilla: p.inicioPlanilla,
      historialPlanilla: p.historialPlanilla,
    }
    // create(): si otro pedido la creó en el medio, falla y se cuenta como "ya estaba".
    try {
      const batch = adminDb().batch()
      batch.create(ref, data)
      batch.set(ref.collection('historialEstados').doc(), {
        estadoAnterior: null,
        estadoNuevo: 'pendiente_aprobacion',
        fecha: ahora,
        usuario: user.uid,
        usuarioNombre: user.displayName,
        nota: `Importada de la planilla (desde ${p.inicioPlanilla})`,
      })
      await batch.commit()
      creadas += 1
    } catch (err) {
      if ((err as { code?: number }).code === 6) yaEstaban += 1
      else throw err
    }
  }

  const partes = [`${creadas} inversiones quedaron para aprobar`, `${inversoresNuevos} inversores nuevos`]
  if (yaEstaban) partes.push(`${yaEstaban} ya estaban importadas`)
  return { creadas, inversoresNuevos, mensaje: partes.join(' · ') + '.' }
}
