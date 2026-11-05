import { Router, type Response } from 'express'
import { requireFinanzasPermiso, requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { parseMultipartUpload } from '../../../drive/parseMultipartUpload.js'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { clavesDeProveedor, listProveedoresFinancierosDocs } from '../../agenda/services/proveedores-financieros.repository.js'
import {
  agregarAliasProveedorFinanciero,
  agregarProveedorFinanciero,
  ProveedorFinancieroError,
  quitarAliasProveedorFinanciero,
} from '../../agenda/services/proveedores-financieros.service.js'
import { esCompraIva } from '../domain/clasificar-ocasional.js'
import { parsearUsdSuelto } from '../domain/parsear-obs.js'
import type { TipoOperacionManual } from '../domain/cheque-ocasional.types.js'
import { normalizarDocOcasional } from '../domain/normalizar-doc-ocasional.js'
import {
  aprenderPatron,
  camposDeLaClasificacion,
  chequesDeLaMismaOperacion,
  formaObs,
  numerosDeChequeEnObs,
  validarClasificacion,
  yaTieneTipo,
} from '../domain/patrones-ocasionales.js'
import { guardarPatronOcasional, leerPatronOcasional } from '../services/patrones-ocasionales.repository.js'
import { armarCatalogoProveedores, type ProveedorCatalogoEntrada } from '../domain/catalogo-proveedores.js'
import {
  importarChequesOcasionales,
  sincronizarDerivadosEnBase,
  VIENTRI_CHEQUES_OCASIONALES,
} from '../services/importar-cheques-ocasionales.js'
import type { ChequeOcasionalDoc } from '../domain/cheque-ocasional.types.js'
import { analizarOcasionalesVsEmitidos } from '../domain/analisis-ocasionales-emitidos.js'
import { analizarInteresVsRenovaciones } from '../domain/analisis-interes-renovacion.js'
import { reconstruirCadenas, clasificarCheques, resumirCostoFinanciero } from '../domain/cadena-renovacion.js'
import { agruparOperacionesRenovacion } from '../domain/operacion-renovacion.js'
import { armarSeguimiento } from '../domain/seguimiento.js'
import { MESES_VENTANA, restarMeses } from '../domain/ventana.js'
import type { FiltroSeguimiento, OperacionPersistida } from '../domain/seguimiento.types.js'
import { recalcularSeguimiento, VIENTRI_OPERACIONES_RENOVACION } from '../services/recalcular-seguimiento.js'
import { leerCompletos, reconstruirCompletos } from '../services/completos-ocasionales.js'
import { VIENTRI_CHEQUES } from '../services/vientri.repository.js'
import { dentroDelRangoMonto, leerRangoMonto } from '../../cheques/domain/filtro-monto.js'

export const finanzasChequesOcasionalesRouter = Router()
finanzasChequesOcasionalesRouter.use(requireWorkspaceUser, requireViewFinanzas)

const POR_PAGINA = 50

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

async function leerTodos(): Promise<ChequeOcasionalDoc[]> {
  const snap = await adminDb().collection(VIENTRI_CHEQUES_OCASIONALES).get()
  // La marca se calcula al leer: los docs guardados antes de que existiera no la tienen hasta la próxima importación.
  return snap.docs.map((d) => {
    const doc = d.data() as ChequeOcasionalDoc
    return { ...doc, esCompraIva: esCompraIva(doc.beneficiarioNormalizado ?? '', doc.obsOriginal ?? '') }
  })
}

finanzasChequesOcasionalesRouter.get('/',async (req, res) => {
  try {
    const todos = await leerTodos()

    const filtro = (typeof req.query.filtro === 'string' ? req.query.filtro : '') as
      | '' | 'revisar' | 'con_renovacion' | 'con_usd' | 'compra_iva'
    const q = typeof req.query.q === 'string' ? normalizar(req.query.q.trim()) : ''
    const page = Math.max(1, Number(req.query.page) || 1)

    let filtrados = todos.filter(
      (d) => !d.baja && !d.revisar.some((r) => r.toLowerCase().includes('imposible')),
    )
    if (filtro === 'revisar') filtrados = filtrados.filter((d) => d.revisar.length > 0)
    else if (filtro === 'con_renovacion') filtrados = filtrados.filter((d) => d.renovacionDe.length > 0 || d.renovadoPor.length > 0)
    else if (filtro === 'con_usd') filtrados = filtrados.filter((d) => d.operacionUsd !== null)
    else if (filtro === 'compra_iva') filtrados = filtrados.filter((d) => d.esCompraIva === true)

    if (q) {
      filtrados = filtrados.filter((d) =>
        normalizar(`${d.beneficiario} ${d.numeroCheque} ${d.obsOriginal} ${d.estado}`).includes(q),
      )
    }

    const rangoMonto = leerRangoMonto(
      typeof req.query.montoDesde === 'string' ? req.query.montoDesde : undefined,
      typeof req.query.montoHasta === 'string' ? req.query.montoHasta : undefined,
    )
    filtrados = filtrados.filter((d) => dentroDelRangoMonto(d.montoCentavos, rangoMonto))

    filtrados.sort((a, b) => {
      const fa = a.fechaVencimiento ?? ''
      const fb = b.fechaVencimiento ?? ''
      return fb.localeCompare(fa)
    })

    const total = filtrados.length
    const totalCentavos = filtrados.reduce((s, d) => s + d.montoCentavos, 0)
    const pages = Math.max(1, Math.ceil(total / POR_PAGINA))
    const start = (page - 1) * POR_PAGINA
    const items = filtrados.slice(start, start + POR_PAGINA)

    res.json({ cheques: items, total, totalCentavos, page, pages })
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] listar', err)
    res.status(500).json({ error: 'No se pudieron listar los cheques ocasionales' })
  }
})

finanzasChequesOcasionalesRouter.get('/cadenas', async (_req, res) => {
  try {
    const pool = await leerCompletos()
    const cadenas = reconstruirCadenas(pool)
    const clasificados = clasificarCheques(pool, cadenas)
    res.json({ cadenas, clasificados })
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] cadenas', err)
    res.status(500).json({ error: 'No se pudieron calcular las cadenas de renovación' })
  }
})

finanzasChequesOcasionalesRouter.get('/resumen', async (_req, res) => {
  try {
    const pool = await leerCompletos()
    const cadenas = reconstruirCadenas(pool)
    const resumen = resumirCostoFinanciero(cadenas)

    // Stats solo de docs reales (no sintéticos)
    const activos = pool.filter((d) => d.vientriId !== 0)
    const validos = activos.filter(
      (d) => !d.revisar.some((r) => r.toLowerCase().includes('imposible')),
    )
    const pendientes = validos.filter((d) => !d.pagado && d.estadoCodigo !== 5)
    const revisarItems = validos.filter((d) => d.revisar.length > 0)
    const renovItems = validos.filter((d) => d.renovacionDe.length > 0 || d.renovadoPor.length > 0)
    const usdItems = validos.filter((d) => d.operacionUsd !== null)

    const sumMonto = (arr: ChequeOcasionalDoc[]) => arr.reduce((s, d) => s + d.montoCentavos, 0)

    let totalMontoUsd = 0
    let sumaPonderadaTc = 0
    const gruposUsdMap = new Map<
      string,
      {
        beneficiario: string
        beneficiarioNormalizado: string
        fechaEmision: string | null
        montoUsd: number
        cotizacion: number
        equivalenteCentavos: number
        cantidadCheques: number
        sumaChequesCentavos: number
        obsComun: string
        cheques: Array<{ numeroCheque: string; montoCentavos: number; fechaVencimiento: string | null; fechaEmision: string | null }>
      }
    >()

    for (const d of usdItems) {
      if (d.operacionUsd) {
        const key = `${d.beneficiarioNormalizado}|${d.operacionUsd.montoUsd}|${d.operacionUsd.cotizacion}|${d.fechaEmision ?? ''}`
        const detalleCheque = { numeroCheque: d.numeroCheque, montoCentavos: d.montoCentavos, fechaVencimiento: d.fechaVencimiento, fechaEmision: d.fechaEmision }
        const existente = gruposUsdMap.get(key)
        if (existente) {
          existente.cantidadCheques += 1
          existente.sumaChequesCentavos += d.montoCentavos
          existente.cheques.push(detalleCheque)
        } else {
          gruposUsdMap.set(key, {
            beneficiario: d.beneficiario,
            beneficiarioNormalizado: d.beneficiarioNormalizado,
            fechaEmision: d.fechaEmision,
            montoUsd: d.operacionUsd.montoUsd,
            cotizacion: d.operacionUsd.cotizacion,
            equivalenteCentavos: Math.round(d.operacionUsd.montoUsd * d.operacionUsd.cotizacion * 100),
            cantidadCheques: 1,
            sumaChequesCentavos: d.montoCentavos,
            obsComun: d.obsOriginal,
            cheques: [detalleCheque],
          })
          totalMontoUsd += d.operacionUsd.montoUsd
          sumaPonderadaTc += d.operacionUsd.montoUsd * d.operacionUsd.cotizacion
        }
      }
    }
    const operacionesUsdAgrupadas = [...gruposUsdMap.values()].sort(
      (a, b) => b.sumaChequesCentavos - a.sumaChequesCentavos,
    )
    const cotizacionPromedioUsd = totalMontoUsd > 0 ? Math.round(sumaPonderadaTc / totalMontoUsd) : 0

    const porMesMap = new Map<string, { mes: string; cantidad: number; montoCentavos: number }>()
    for (const d of pendientes) {
      const mes = d.fechaVencimiento ? d.fechaVencimiento.slice(0, 7) : 'Sin fecha'
      const cur = porMesMap.get(mes)
      if (cur) {
        cur.cantidad += 1
        cur.montoCentavos += d.montoCentavos
      } else {
        porMesMap.set(mes, { mes, cantidad: 1, montoCentavos: d.montoCentavos })
      }
    }
    const porMes = [...porMesMap.values()].sort((a, b) => a.mes.localeCompare(b.mes))

    res.json({
      totalCheques: validos.length,
      totalMontoCentavos: sumMonto(validos),
      pendientesCantidad: pendientes.length,
      pendientesMontoCentavos: sumMonto(pendientes),
      fechasImposiblesCantidad: 0,
      revisarCantidad: revisarItems.length,
      revisarMontoCentavos: sumMonto(revisarItems),
      conRenovacion: renovItems.length,
      conUsd: usdItems.length,
      operacionesUsdUnicas: operacionesUsdAgrupadas.length,
      operacionesUsdAgrupadas,
      totalMontoUsd,
      cotizacionPromedioUsd,
      porMes,
      costoFinanciero: resumen,
    })
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] resumen', err)
    res.status(500).json({ error: 'No se pudo calcular el resumen' })
  }
})

finanzasChequesOcasionalesRouter.post('/importar', requireFinanzasPermiso('finanzas_cheques'), async (req, res) => {
  const actorUid = req.authedUser?.uid
  if (!actorUid) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }
  try {
    const parsed = await parseMultipartUpload(req)
    if (!parsed.file) {
      res.status(400).json({ error: 'No se recibió ningún archivo' })
      return
    }
    const ext = parsed.file.originalname.split('.').pop()?.toLowerCase()
    if (ext !== 'csv' && ext !== 'txt') {
      res.status(400).json({ error: 'Solo se aceptan archivos .csv' })
      return
    }
    const csv = parsed.file.buffer.toString('utf-8')
    // Misma ventana que la importación completa de Vientri: no se traen cheques de más de 12 meses atrás.
    const desdeQuery = typeof req.query.desde === 'string' ? req.query.desde : ''
    const desde = /^\d{4}-\d{2}-\d{2}$/.test(desdeQuery) ? desdeQuery : restarMeses(hoyArgentina(), MESES_VENTANA)
    const resultado = await importarChequesOcasionales({
      csv,
      origen: 'manual',
      actor: actorUid,
      simular: false,
      desde,
    })
    res.status(resultado.ok ? 200 : 500).json(resultado.ok ? resultado : { error: resultado.mensaje })
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] importar', err)
    const message = err instanceof Error ? err.message : 'No se pudo importar el CSV'
    res.status(400).json({ error: message })
  }
})


// ── Catálogo de proveedores financieros (nombre + alias) y beneficiarios sin asignar ──────────────

async function armarCatalogo() {
  const [docs, filas] = await Promise.all([leerTodos(), listProveedoresFinancierosDocs()])
  const proveedores: ProveedorCatalogoEntrada[] = filas.map((f) => ({
    id: f.id,
    nombre: f.data.nombre,
    alias: f.data.alias ?? [],
    claves: clavesDeProveedor(f.data),
  }))
  return armarCatalogoProveedores(docs, proveedores)
}

/** Después de tocar nombres o alias, los cheques ya guardados se re-enganchan sin esperar a la próxima importación. */
async function responderCambioDeProveedores(res: Response, extra: Record<string, unknown>) {
  const chequesActualizados = await sincronizarDerivadosEnBase()
  res.json({ ...extra, chequesActualizados })
}

function manejarErrorProveedor(res: Response, err: unknown, accion: string) {
  if (err instanceof ProveedorFinancieroError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  console.error(`[finanzas/cheques-ocasionales] ${accion}`, err)
  res.status(500).json({ error: `No se pudo ${accion}` })
}

finanzasChequesOcasionalesRouter.get('/proveedores-financieros', async (_req, res) => {
  try {
    res.json(await armarCatalogo())
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] catálogo de proveedores', err)
    res.status(500).json({ error: 'No se pudo cargar el catálogo de proveedores financieros' })
  }
})

finanzasChequesOcasionalesRouter.post('/proveedores-financieros', requireFinanzasPermiso('finanzas_cheques'), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>
    const proveedor = await agregarProveedorFinanciero(body.nombre, req.authedUser!.uid)
    await responderCambioDeProveedores(res.status(201), { proveedor })
  } catch (err) {
    manejarErrorProveedor(res, err, 'agregar el proveedor financiero')
  }
})

finanzasChequesOcasionalesRouter.post(
  '/proveedores-financieros/:id/alias',
  requireFinanzasPermiso('finanzas_cheques'),
  async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>
      const proveedor = await agregarAliasProveedorFinanciero(req.params.id, body.alias)
      await responderCambioDeProveedores(res, { proveedor })
    } catch (err) {
      manejarErrorProveedor(res, err, 'agregar el nombre alternativo')
    }
  },
)

finanzasChequesOcasionalesRouter.delete(
  '/proveedores-financieros/:id/alias',
  requireFinanzasPermiso('finanzas_cheques'),
  async (req, res) => {
    try {
      const proveedor = await quitarAliasProveedorFinanciero(req.params.id, req.query.alias)
      await responderCambioDeProveedores(res, { proveedor })
    } catch (err) {
      manejarErrorProveedor(res, err, 'sacar el nombre alternativo')
    }
  },
)

finanzasChequesOcasionalesRouter.get('/operaciones-renovacion', async (_req, res) => {
  try {
    const pool = await leerCompletos()
    const operaciones = agruparOperacionesRenovacion(pool)
    const vinculadas = operaciones.filter(o => o.vinculada)
    const explicitas = vinculadas.filter(o => o.tipoVinculo === 'explicito')
    const implicitas = vinculadas.filter(o => o.tipoVinculo === 'implicito')
    const sinMatch = operaciones.filter(o => !o.vinculada)
    res.json({
      operaciones,
      total: operaciones.length,
      resumen: {
        vinculadas: vinculadas.length,
        explicitas: explicitas.length,
        implicitas: implicitas.length,
        sinMatch: sinMatch.length,
      },
    })
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] operaciones-renovacion', err)
    res.status(500).json({ error: 'No se pudieron calcular las operaciones de renovación' })
  }
})

function hoyArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
}

/**
 * Seguimiento de operaciones de renovación, agrupado por beneficiario.
 * Lee la colección persistida (se recalcula en cada importación); abierta/cerrada se calcula con la fecha de hoy.
 * Query: `estado=abiertas` (default) | `todas`.
 */
finanzasChequesOcasionalesRouter.get('/seguimiento', async (req, res) => {
  try {
    const filtro: FiltroSeguimiento = req.query.estado === 'todas' ? 'todas' : 'abiertas'
    const snap = await adminDb().collection(VIENTRI_OPERACIONES_RENOVACION).get()
    const operaciones = snap.docs.map((d) => {
      const { huella, importacionId, actualizadoAt, ...rest } = d.data() as OperacionPersistida & Record<string, unknown>
      return rest as OperacionPersistida
    })
    res.json(armarSeguimiento(operaciones, hoyArgentina(), filtro))
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] seguimiento', err)
    res.status(500).json({ error: 'No se pudo obtener el seguimiento de renovaciones' })
  }
})

/**
 * Fuerza el recálculo del seguimiento sin necesidad de re-importar.
 * Lee los docs existentes de vientriChequesOcasionales y recalcula.
 */
finanzasChequesOcasionalesRouter.post('/seguimiento/recalcular', requireFinanzasPermiso('finanzas_cheques'), async (req, res) => {
  try {
    const docs = await leerTodos()
    const resultado = await recalcularSeguimiento({
      docs,
      importacionId: `manual-${Date.now()}`,
      borrarFaltantes: true,
    })
    res.json({ ok: true, operaciones: resultado.operaciones, conteo: resultado.conteo })
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] recalcular seguimiento', err)
    res.status(500).json({ error: 'No se pudo recalcular el seguimiento' })
  }
})

/**
 * Un solo botón para recalcular todo sin re-importar: avisos y datos derivados de cada cheque (proveedores, alias,
 * USD leído del OBS, renovaciones), los cheques completos y el seguimiento de renovaciones. Sin CSV.
 */
/** Avisos y datos derivados de cada cheque, cheques completos y seguimiento. Lanza con el paso que falló. */
async function recalcularTodoOcasionales() {
  let paso = 'los avisos de los cheques'
  try {
    const chequesActualizados = await sincronizarDerivadosEnBase()
    paso = 'los cheques completos'
    const completos = await reconstruirCompletos()
    paso = 'el seguimiento de renovaciones'
    const seguimiento = await recalcularSeguimiento({
      docs: await leerTodos(),
      importacionId: `manual-${Date.now()}`,
      borrarFaltantes: true,
    })
    return { chequesActualizados, completos: completos.total, operaciones: seguimiento.operaciones }
  } catch (err) {
    throw new Error(`No se pudo recalcular ${paso}`, { cause: err })
  }
}

finanzasChequesOcasionalesRouter.post('/recalcular-todo', requireFinanzasPermiso('finanzas_cheques'), async (_req, res) => {
  try {
    res.json({ ok: true, ...(await recalcularTodoOcasionales()) })
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] recalcular todo', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'No se pudo recalcular' })
  }
})

finanzasChequesOcasionalesRouter.post('/completos/recalcular', requireFinanzasPermiso('finanzas_cheques'), async (_req, res) => {
  try {
    const resultado = await reconstruirCompletos()
    res.json({ ok: true, ...resultado })
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] recalcular completos', err)
    res.status(500).json({ error: 'No se pudo recalcular los cheques completos' })
  }
})

finanzasChequesOcasionalesRouter.get('/analisis-emitidos', async (_req, res) => {
  try {
    const ocasionales = await leerTodos()
    const snap = await adminDb().collection(VIENTRI_CHEQUES).get()
    const vientriCheques = snap.docs.map((d) => d.data() as import('../domain/tipos.js').VientriChequeDoc)
    res.json(analizarOcasionalesVsEmitidos(ocasionales, vientriCheques))
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] analisis-emitidos', err)
    res.status(500).json({ error: 'No se pudo realizar el análisis' })
  }
})

finanzasChequesOcasionalesRouter.get('/analisis-interes', async (_req, res) => {
  try {
    const pool = await leerCompletos()
    const operaciones = agruparOperacionesRenovacion(pool)
    res.json(analizarInteresVsRenovaciones(pool, operaciones))
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] analisis-interes', err)
    res.status(500).json({ error: 'No se pudo realizar el análisis de interés vs renovaciones' })
  }
})

// Debe ir después de '/cadenas' y '/resumen' para no capturarlas como :id
/**
 * El id del doc es `oca-<vientriId>`, pero hay bases con docs guardados con el número pelado como id
 * (copias viejas). Si no está por id, se busca por el campo `vientriId`, prefiriendo el que no está dado de baja.
 */
async function buscarOcasionalConId(id: string): Promise<{ id: string; data: ChequeOcasionalDoc } | null> {
  const col = adminDb().collection(VIENTRI_CHEQUES_OCASIONALES)
  const porId = await col.doc(id).get()
  if (porId.exists) return { id: porId.id, data: porId.data() as ChequeOcasionalDoc }

  const vientriId = Number(id.replace(/^oca-/, ''))
  if (!Number.isInteger(vientriId) || vientriId <= 0) return null
  const snap = await col.where('vientriId', '==', vientriId).get()
  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as ChequeOcasionalDoc }))
  return docs.find((d) => !d.data.baja) ?? docs[0] ?? null
}

async function buscarOcasional(id: string): Promise<ChequeOcasionalDoc | null> {
  return (await buscarOcasionalConId(id))?.data ?? null
}

/**
 * Marca a mano el tipo de operación de un cheque (dólares, renovación o interés/capital) cuando el OBS no
 * alcanza para saberlo. Por defecto se aplica también a las demás cuotas de la misma operación (mismo
 * beneficiario, misma emisión y OBS idéntico) que todavía no tengan ese dato. Cada confirmación se guarda
 * como patrón aprendido del beneficiario, para proponerlo en los cheques que lleguen con el mismo formato.
 */
finanzasChequesOcasionalesRouter.post('/:id/clasificar', requireFinanzasPermiso('finanzas_cheques'), async (req, res) => {
  try {
    const elegido = await buscarOcasionalConId(req.params.id)
    if (!elegido) {
      res.status(404).json({ error: 'Cheque ocasional no encontrado' })
      return
    }
    const body = (req.body ?? {}) as { tipo?: unknown; datos?: unknown; aplicarAIguales?: unknown }
    const validado = validarClasificacion(body.tipo, body.datos, elegido.data.obsOriginal)
    if (!validado.ok) {
      res.status(400).json({ error: validado.error })
      return
    }
    const tipo = body.tipo as TipoOperacionManual
    const uid = req.authedUser!.uid

    const col = adminDb().collection(VIENTRI_CHEQUES_OCASIONALES)
    const ids = new Set<string>([elegido.id])
    if (body.aplicarAIguales !== false) {
      const snap = await col.get()
      const todos = snap.docs.map((d) => ({ id: d.id, ...normalizarDocOcasional(d.data() as ChequeOcasionalDoc) }))
      const propio = todos.find((d) => d.id === elegido.id) ?? { id: elegido.id, ...normalizarDocOcasional(elegido.data) }
      for (const d of chequesDeLaMismaOperacion(propio, todos)) {
        if (!yaTieneTipo(d, tipo)) ids.add(d.id)
      }
    }

    const campos = {
      ...camposDeLaClasificacion(tipo, validado.datos),
      clasificacionManual: { tipo, uid, fecha: new Date().toISOString() },
    }
    const lista = [...ids]
    for (let i = 0; i < lista.length; i += 400) {
      const batch = adminDb().batch()
      for (const id of lista.slice(i, i + 400)) batch.set(col.doc(id), campos, { merge: true })
      await batch.commit()
    }

    const clave = {
      beneficiarioNormalizado: elegido.data.beneficiarioNormalizado,
      tipo,
      forma: formaObs(elegido.data.obsOriginal),
    }
    const patron = aprenderPatron(await leerPatronOcasional(clave), elegido.data, tipo, validado.datos)
    await guardarPatronOcasional(patron, uid)

    let recalculado = true
    try {
      await recalcularTodoOcasionales()
    } catch (err) {
      recalculado = false
      console.error('[finanzas/cheques-ocasionales] clasificar: no se pudo recalcular', err)
    }
    res.json({ tipo, datos: validado.datos, cheques: lista.length, confirmaciones: patron.confirmaciones, recalculado })
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] clasificar', err)
    res.status(500).json({ error: 'No se pudo guardar el tipo de operación' })
  }
})

finanzasChequesOcasionalesRouter.get('/:id', async (req, res) => {
  try {
    const cheque = await buscarOcasional(req.params.id)
    if (!cheque) {
      res.status(404).json({ error: 'Cheque ocasional no encontrado' })
      return
    }
    const pool = await leerCompletos()
    const cadenas = reconstruirCadenas(pool)
    const clasificados = clasificarCheques(pool, cadenas)

    const porNumero = new Map<string, ChequeOcasionalDoc>()
    for (const d of pool) {
      if (d.numeroCheque) {
        porNumero.set(d.numeroCheque, d)
        const corto = d.numeroCheque.split('-').pop()
        if (corto && corto !== d.numeroCheque) porNumero.set(corto, d)
      }
    }

    const actualEnCompletos = porNumero.get(cheque.numeroCheque) ?? cheque
    const clasificacion = clasificados.find((c) => c.numeroCheque === cheque.numeroCheque) ?? null
    const cadena = clasificacion?.cadenaId
      ? cadenas.find((c) => c.id === clasificacion.cadenaId) ?? null
      : null

    const renovacionDeDetalle = actualEnCompletos.renovacionDe.map((num) => {
      const v = porNumero.get(num)
      return {
        numeroCheque: v?.numeroCheque ?? num,
        montoCentavos: v?.montoCentavos ?? null,
        fechaVencimiento: v?.fechaVencimiento ?? null,
        estado: v?.estado ?? null,
      }
    })

    const renovadoPorDetalle = actualEnCompletos.renovadoPor.map((num) => {
      const n = porNumero.get(num)
      return {
        numeroCheque: n?.numeroCheque ?? num,
        montoCentavos: n?.montoCentavos ?? null,
        fechaVencimiento: n?.fechaVencimiento ?? null,
        estado: n?.estado ?? null,
      }
    })

    const todos = await leerTodos()
    const mismaOperacion = chequesDeLaMismaOperacion(cheque, todos.map(normalizarDocOcasional)).length

    res.json({
      // Los completos se reconstruyen aparte: los datos que se marcan a mano o se recalculan salen del doc vivo.
      cheque: {
        ...actualEnCompletos,
        revisar: cheque.revisar ?? [],
        operacionUsd: cheque.operacionUsd ?? null,
        rolEnOperacion: cheque.rolEnOperacion ?? null,
        renovacionDe: cheque.renovacionDe?.length ? cheque.renovacionDe : actualEnCompletos.renovacionDe,
        sugerencia: cheque.sugerencia ?? null,
        clasificacionManual: cheque.clasificacionManual ?? null,
      },
      lecturaObs: {
        usd: parsearUsdSuelto(cheque.obsOriginal),
        numerosDeCheque: numerosDeChequeEnObs(cheque.obsOriginal),
      },
      mismaOperacion,
      clasificacion,
      cadena,
      renovacionDeDetalle,
      renovadoPorDetalle,
    })
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] detalle', err)
    res.status(500).json({ error: 'No se pudo obtener el cheque ocasional' })
  }
})
