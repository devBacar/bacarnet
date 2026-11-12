import { Router, type Response } from 'express'
import { requireFinanzasPermiso, requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { parseMultipartUpload } from '../../../drive/parseMultipartUpload.js'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { clavesDeProveedor, listProveedoresFinancierosDocs, mapaProveedoresFinancieros } from '../../agenda/services/proveedores-financieros.repository.js'
import {
  agregarAliasProveedorFinanciero,
  agregarProveedorFinanciero,
  fusionarProveedoresFinancieros,
  ProveedorFinancieroError,
  quitarAliasProveedorFinanciero,
  quitarProveedorFinanciero,
  renombrarProveedorFinanciero,
} from '../../agenda/services/proveedores-financieros.service.js'
import { claveGrupoOtroPago, esCompraIva, esOtroPago } from '../domain/clasificar-ocasional.js'
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
import { interesAparteDe, operacionesDelCheque } from '../domain/operaciones-del-cheque.js'
import { armarSeguimiento } from '../domain/seguimiento.js'
import { analizarARevisar } from '../domain/analisis-revisar.js'
import { agruparOperacionesUsd, resumirUsdPorProveedor } from '../domain/operaciones-usd.js'
import { armarPropuestaRenovacion, chequesElegidosDelGrupo } from '../domain/propuesta-renovacion.js'
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
      | '' | 'revisar' | 'con_renovacion' | 'con_usd' | 'compra_iva' | 'otros_pagos'
    const q = typeof req.query.q === 'string' ? normalizar(req.query.q.trim()) : ''
    const page = Math.max(1, Number(req.query.page) || 1)

    let filtrados = todos.filter(
      (d) => !d.baja && !d.revisar.some((r) => r.toLowerCase().includes('imposible')),
    )
    if (filtro === 'revisar') filtrados = filtrados.filter((d) => d.revisar.length > 0)
    else if (filtro === 'con_renovacion') filtrados = filtrados.filter((d) => d.renovacionDe.length > 0 || d.renovadoPor.length > 0)
    else if (filtro === 'con_usd') filtrados = filtrados.filter((d) => d.operacionUsd !== null)
    else if (filtro === 'compra_iva') filtrados = filtrados.filter((d) => d.esCompraIva === true)
    else if (filtro === 'otros_pagos') filtrados = filtrados.filter((d) => esOtroPago(d.beneficiarioNormalizado ?? '', d.obsOriginal ?? ''))

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

    const total = filtrados.length
    const totalCentavos = filtrados.reduce((s, d) => s + d.montoCentavos, 0)

    if (filtro === 'otros_pagos') {
      // Se pagina por grupo (emisión + OBS + beneficiario) para que un grupo nunca quede partido entre páginas.
      const grupos = new Map<string, ChequeOcasionalDoc[]>()
      for (const d of filtrados) {
        const k = claveGrupoOtroPago(d)
        const g = grupos.get(k)
        if (g) g.push(d)
        else grupos.set(k, [d])
      }
      const ordenados = [...grupos.values()]
        .map((g) => g.sort((a, b) => (a.fechaVencimiento ?? '').localeCompare(b.fechaVencimiento ?? '')))
        .sort((a, b) => (b[0].fechaEmision ?? '').localeCompare(a[0].fechaEmision ?? '')
          || a[0].beneficiarioNormalizado.localeCompare(b[0].beneficiarioNormalizado))
      const pages = Math.max(1, Math.ceil(ordenados.length / POR_PAGINA))
      const start = (page - 1) * POR_PAGINA
      const items = ordenados.slice(start, start + POR_PAGINA).flat()
      res.json({ cheques: items, total, totalCentavos, page, pages })
      return
    }

    filtrados.sort((a, b) => {
      const fa = a.fechaVencimiento ?? ''
      const fb = b.fechaVencimiento ?? ''
      return fb.localeCompare(fa)
    })

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
    const [pool, catalogo] = await Promise.all([leerCompletos(), mapaProveedoresFinancieros()])
    const cadenas = reconstruirCadenas(pool)
    const resumen = resumirCostoFinanciero(cadenas, catalogo)

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

    const operacionesUsdAgrupadas = agruparOperacionesUsd(usdItems, catalogo)
    const usdPorProveedor = resumirUsdPorProveedor(operacionesUsdAgrupadas)
    const totalMontoUsd = operacionesUsdAgrupadas.reduce((s, op) => s + op.montoUsd, 0)
    const sumaPonderadaTc = operacionesUsdAgrupadas.reduce((s, op) => s + op.montoUsd * op.cotizacion, 0)
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
      usdPorProveedor,
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

/**
 * Responde enseguida. Los cheques ya guardados se re-enganchan aparte con POST /proveedores-financieros/sincronizar-cheques,
 * que la pantalla dispara en segundo plano (recorre toda la base y tarda).
 */
async function responderCambioDeProveedores(res: Response, extra: Record<string, unknown>) {
  res.json(extra)
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

/** Re-engancha los cheques ya guardados con la lista actual de proveedores, sin esperar a la próxima importación. */
finanzasChequesOcasionalesRouter.post(
  '/proveedores-financieros/sincronizar-cheques',
  requireFinanzasPermiso('finanzas_cheques'),
  async (_req, res) => {
    try {
      res.json({ chequesActualizados: await sincronizarDerivadosEnBase() })
    } catch (err) {
      manejarErrorProveedor(res, err, 'actualizar los cheques')
    }
  },
)

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

finanzasChequesOcasionalesRouter.patch(
  '/proveedores-financieros/:id',
  requireFinanzasPermiso('finanzas_cheques'),
  async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>
      const proveedor = await renombrarProveedorFinanciero(req.params.id, body.nombre)
      await responderCambioDeProveedores(res, { proveedor })
    } catch (err) {
      manejarErrorProveedor(res, err, 'cambiar el nombre del proveedor')
    }
  },
)

/** El proveedor de la URL absorbe al de `seVaId`: se lleva sus nombres y el otro se da de baja. */
finanzasChequesOcasionalesRouter.post(
  '/proveedores-financieros/:id/fusionar',
  requireFinanzasPermiso('finanzas_cheques'),
  async (req, res) => {
    try {
      const body = req.body as Record<string, unknown>
      const proveedor = await fusionarProveedoresFinancieros(req.params.id, body.seVaId, req.authedUser!.uid)
      await responderCambioDeProveedores(res, { proveedor })
    } catch (err) {
      manejarErrorProveedor(res, err, 'juntar los proveedores')
    }
  },
)

/** Baja lógica: el proveedor deja de enganchar cheques y sus nombres vuelven a "Sin asignar". No se borra. */
finanzasChequesOcasionalesRouter.delete(
  '/proveedores-financieros/:id',
  requireFinanzasPermiso('finanzas_cheques'),
  async (req, res) => {
    try {
      await quitarProveedorFinanciero(req.params.id, req.authedUser!.uid)
      res.status(204).send()
    } catch (err) {
      manejarErrorProveedor(res, err, 'dar de baja el proveedor')
    }
  },
)

/**
 * Revisión asistida: los cheques "A revisar" juntos por operación (mismo beneficiario, emisión y OBS), cada grupo
 * con las explicaciones posibles y la cuenta que las respalda. Solo lectura.
 */
finanzasChequesOcasionalesRouter.get('/revisar-asistido', async (_req, res) => {
  try {
    const [todosCrudos, pool, catalogo] = await Promise.all([leerTodos(), leerCompletos(), mapaProveedoresFinancieros()])
    const grupos = analizarARevisar(todosCrudos.map(normalizarDocOcasional), catalogo, agruparOperacionesRenovacion(pool))
    res.json({
      grupos,
      totales: {
        grupos: grupos.length,
        cheques: grupos.reduce((s, g) => s + g.cheques.filter((c) => c.aRevisar).length, 0),
        conSugerenciaFuerte: grupos.filter((g) => g.hipotesis.some((h) => h.fuerza === 'fuerte')).length,
        sinSugerencia: grupos.filter((g) => g.hipotesis.length === 0).length,
      },
    })
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] revisar-asistido', err)
    res.status(500).json({ error: 'No se pudo armar la revisión' })
  }
})

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
    const [snap, catalogo, conInteres] = await Promise.all([
      adminDb().collection(VIENTRI_OPERACIONES_RENOVACION).get(),
      mapaProveedoresFinancieros(),
      // Solo los cheques con interés confirmado: el interés que cada renovación pagó aparte.
      adminDb().collection(VIENTRI_CHEQUES_OCASIONALES).where('interesDe', '!=', null).get(),
    ])
    const operaciones = snap.docs.map((d) => {
      const { huella, importacionId, actualizadoAt, ...rest } = d.data() as OperacionPersistida & Record<string, unknown>
      return rest as OperacionPersistida
    })
    const docsInteres = conInteres.docs.map((d) => normalizarDocOcasional(d.data() as ChequeOcasionalDoc))
    res.json(armarSeguimiento(operaciones, hoyArgentina(), filtro, catalogo, docsInteres))
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
    const body = (req.body ?? {}) as { tipo?: unknown; datos?: unknown; aplicarAIguales?: unknown; chequesDelGrupo?: unknown }
    const validado = validarClasificacion(body.tipo, body.datos, elegido.data.obsOriginal)
    if (!validado.ok) {
      res.status(400).json({ error: validado.error })
      return
    }
    const tipo = body.tipo as TipoOperacionManual
    const uid = req.authedUser!.uid

    const col = adminDb().collection(VIENTRI_CHEQUES_OCASIONALES)
    const ids = new Set<string>([elegido.id])
    // Número de cheque de cada doc: un interés guarda a qué operación corresponde cada cheque por separado.
    const numeros = new Map<string, string>([[elegido.id, elegido.data.numeroCheque]])
    const elegidosAMano = Array.isArray(body.chequesDelGrupo) ? body.chequesDelGrupo.map(String) : null
    if (elegidosAMano || body.aplicarAIguales !== false) {
      const snap = await col.get()
      const todos = snap.docs.map((d) => ({ id: d.id, ...normalizarDocOcasional(d.data() as ChequeOcasionalDoc) }))
      const propio = todos.find((d) => d.id === elegido.id) ?? { id: elegido.id, ...normalizarDocOcasional(elegido.data) }
      const grupo = chequesDeLaMismaOperacion(propio, todos)
      if (elegidosAMano) {
        // Finanzas eligió a mano qué cheques del grupo son de esta operación: se les aplica aunque ya tuvieran el dato.
        for (const d of chequesElegidosDelGrupo(propio, grupo, elegidosAMano)) {
          ids.add(d.id)
          numeros.set(d.id, d.numeroCheque)
        }
      } else {
        for (const d of grupo) {
          if (!yaTieneTipo(d, tipo, validado.datos)) {
            ids.add(d.id)
            numeros.set(d.id, d.numeroCheque)
          }
        }
      }
    }

    const marca = { clasificacionManual: { tipo, uid, fecha: new Date().toISOString() } }
    const camposDe = (id: string) => ({ ...camposDeLaClasificacion(tipo, validado.datos, numeros.get(id) ?? ''), ...marca })
    const lista = [...ids]
    for (let i = 0; i < lista.length; i += 400) {
      const batch = adminDb().batch()
      for (const id of lista.slice(i, i + 400)) batch.set(col.doc(id), camposDe(id), { merge: true })
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

    const porNumero = new Map<string, ChequeOcasionalDoc>()
    for (const d of pool) {
      if (d.numeroCheque) {
        porNumero.set(d.numeroCheque, d)
        const corto = d.numeroCheque.split('-').pop()
        if (corto && corto !== d.numeroCheque) porNumero.set(corto, d)
      }
    }

    const actualEnCompletos = porNumero.get(cheque.numeroCheque) ?? cheque
    // Finanzas mira la renovación por operación (todos los viejos contra todos los nuevos), no cheque a cheque.
    const { origen: operacionOrigen, renovacion: operacionRenovacion } = operacionesDelCheque(
      actualEnCompletos.numeroCheque,
      agruparOperacionesRenovacion(pool),
    )

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

    const [todosCrudos, catalogo] = await Promise.all([leerTodos(), mapaProveedoresFinancieros()])
    const todos = todosCrudos.map(normalizarDocOcasional)
    const mismaOperacion = chequesDeLaMismaOperacion(cheque, todos).length

    res.json({
      // Los completos se reconstruyen aparte: los datos que se marcan a mano o se recalculan salen del doc vivo.
      cheque: {
        ...actualEnCompletos,
        revisar: cheque.revisar ?? [],
        operacionUsd: cheque.operacionUsd ?? null,
        rolEnOperacion: cheque.rolEnOperacion ?? null,
        renovacionDe: cheque.renovacionDe?.length ? cheque.renovacionDe : actualEnCompletos.renovacionDe,
        sugerencia: cheque.sugerencia ?? null,
        interesSugerido: cheque.interesSugerido ?? null,
        clasificacionManual: cheque.clasificacionManual ?? null,
      },
      lecturaObs: {
        usd: parsearUsdSuelto(cheque.obsOriginal),
        numerosDeCheque: numerosDeChequeEnObs(cheque.obsOriginal),
      },
      mismaOperacion,
      propuestaRenovacion: armarPropuestaRenovacion(normalizarDocOcasional(cheque), todos, catalogo),
      operacionOrigen: operacionOrigen ? { ...operacionOrigen, interesAparte: interesAparteDe(operacionOrigen, todos, catalogo) } : null,
      operacionRenovacion: operacionRenovacion ? { ...operacionRenovacion, interesAparte: interesAparteDe(operacionRenovacion, todos, catalogo) } : null,
      renovacionDeDetalle,
      renovadoPorDetalle,
    })
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] detalle', err)
    res.status(500).json({ error: 'No se pudo obtener el cheque ocasional' })
  }
})
