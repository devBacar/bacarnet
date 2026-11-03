import { Router } from 'express'
import { requireFinanzasPermiso, requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { parseMultipartUpload } from '../../../drive/parseMultipartUpload.js'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { importarChequesOcasionales, VIENTRI_CHEQUES_OCASIONALES } from '../services/importar-cheques-ocasionales.js'
import type { ChequeOcasionalDoc } from '../domain/cheque-ocasional.types.js'
import { analizarOcasionalesVsEmitidos } from '../domain/analisis-ocasionales-emitidos.js'
import { analizarInteresVsRenovaciones } from '../domain/analisis-interes-renovacion.js'
import { reconstruirCadenas, clasificarCheques, resumirCostoFinanciero } from '../domain/cadena-renovacion.js'
import { agruparOperacionesRenovacion } from '../domain/operacion-renovacion.js'
import { armarSeguimiento } from '../domain/seguimiento.js'
import type { FiltroSeguimiento, OperacionPersistida } from '../domain/seguimiento.types.js'
import { recalcularSeguimiento, VIENTRI_OPERACIONES_RENOVACION } from '../services/recalcular-seguimiento.js'
import { leerCompletos, reconstruirCompletos } from '../services/completos-ocasionales.js'
import { VIENTRI_CHEQUES } from '../services/vientri.repository.js'
import { matchMontoCentavos } from '../../cheques/services/cheques.repository.js'

export const finanzasChequesOcasionalesRouter = Router()
finanzasChequesOcasionalesRouter.use(requireWorkspaceUser, requireViewFinanzas)

const POR_PAGINA = 50

function normalizar(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

async function leerTodos(): Promise<ChequeOcasionalDoc[]> {
  const snap = await adminDb().collection(VIENTRI_CHEQUES_OCASIONALES).get()
  return snap.docs.map((d) => d.data() as ChequeOcasionalDoc)
}

finanzasChequesOcasionalesRouter.get('/', async (req, res) => {
  try {
    const todos = await leerTodos()

    const filtro = (typeof req.query.filtro === 'string' ? req.query.filtro : '') as
      | '' | 'financiero' | 'gasto_real' | 'con_renovacion' | 'con_usd'
    const q = typeof req.query.q === 'string' ? normalizar(req.query.q.trim()) : ''
    const page = Math.max(1, Number(req.query.page) || 1)

    let filtrados = todos.filter(
      (d) => !d.baja && !d.revisar.some((r) => r.toLowerCase().includes('imposible')),
    )
    const esGastoRealValido = (d: ChequeOcasionalDoc) =>
      !d.esProveedorFinanciero
      && !d.esRenovacion
      && d.renovadoPor.length === 0
      && d.operacionUsd === null
      && d.beneficiario.trim() !== ''
      && !d.revisar.some((r) => r.toLowerCase().includes('imposible'))

    if (filtro === 'financiero') filtrados = filtrados.filter((d) => d.esProveedorFinanciero)
    else if (filtro === 'gasto_real') filtrados = filtrados.filter(esGastoRealValido)
    else if (filtro === 'con_renovacion') filtrados = filtrados.filter((d) => d.renovacionDe.length > 0 || d.renovadoPor.length > 0)
    else if (filtro === 'con_usd') filtrados = filtrados.filter((d) => d.operacionUsd !== null)

    if (q) {
      filtrados = filtrados.filter((d) =>
        normalizar(`${d.beneficiario} ${d.numeroCheque} ${d.obsOriginal} ${d.estado}`).includes(q) || matchMontoCentavos(d.montoCentavos, q),
      )
    }

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
    const finItems = validos.filter((d) => d.esProveedorFinanciero)
    const gastoRealItems = validos.filter(
      (d) =>
        !d.esProveedorFinanciero
        && !d.esRenovacion
        && d.renovadoPor.length === 0
        && d.operacionUsd === null
        && d.beneficiario.trim() !== '',
    )
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
      financieros: finItems.length,
      financierosMontoCentavos: sumMonto(finItems),
      gastoRealCantidad: gastoRealItems.length,
      gastoRealMontoCentavos: sumMonto(gastoRealItems),
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
    const resultado = await importarChequesOcasionales({
      csv,
      origen: 'manual',
      actor: actorUid,
      simular: false,
    })
    res.json(resultado)
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] importar', err)
    const message = err instanceof Error ? err.message : 'No se pudo importar el CSV'
    res.status(400).json({ error: message })
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
finanzasChequesOcasionalesRouter.get('/:id', async (req, res) => {
  try {
    const snap = await adminDb().collection(VIENTRI_CHEQUES_OCASIONALES).doc(req.params.id).get()
    if (!snap.exists) {
      res.status(404).json({ error: 'Cheque ocasional no encontrado' })
      return
    }
    const cheque = snap.data() as ChequeOcasionalDoc
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

    res.json({
      cheque: actualEnCompletos,
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
