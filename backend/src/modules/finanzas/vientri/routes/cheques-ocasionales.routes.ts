import { Router } from 'express'
import { requireFinanzasPermiso, requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { parseMultipartUpload } from '../../../drive/parseMultipartUpload.js'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { importarChequesOcasionales, VIENTRI_CHEQUES_OCASIONALES } from '../services/importar-cheques-ocasionales.js'
import { VIENTRI_CHEQUES } from '../services/vientri.repository.js'
import type { ChequeOcasionalDoc } from '../domain/cheque-ocasional.types.js'
import type { VientriChequeDoc } from '../domain/tipos.js'
import { reconstruirCadenas, clasificarCheques, resumirCostoFinanciero } from '../domain/cadena-renovacion.js'
import { normalizarNombre } from '../../agenda/domain/normalizar-nombre.js'

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

/**
 * Completa los eslabones viejos que están referenciados en `renovacionDe` pero no están
 * en `vientriChequesOcasionales` (ej. porque el CSV exportó solo PAGADO=0), buscándolos
 * en `vientriCheques`, y resuelve los links inversos `renovadoPor`.
 */
async function leerActivosConEslabonesDeVientri(activos: ChequeOcasionalDoc[]): Promise<ChequeOcasionalDoc[]> {
  const clonados: ChequeOcasionalDoc[] = activos.map((d) => ({
    ...d,
    renovacionDe: [...d.renovacionDe],
    renovadoPor: [...d.renovadoPor],
  }))

  const porNumero = new Map<string, ChequeOcasionalDoc>()
  for (const d of clonados) {
    if (d.numeroCheque) {
      porNumero.set(d.numeroCheque, d)
      const corto = d.numeroCheque.split('-').pop()
      if (corto && corto !== d.numeroCheque) porNumero.set(corto, d)
    }
  }

  const faltantes = new Set<string>()
  for (const d of clonados) {
    for (const numViejo of d.renovacionDe) {
      if (!porNumero.has(numViejo)) faltantes.add(numViejo)
    }
  }

  if (faltantes.size > 0) {
    // Cruzar primero contra la colección `cheques` (por número completo o sufijo corto)
    const chSnap = await adminDb().collection('cheques').get()
    for (const doc of chSnap.docs) {
      const ch = doc.data() as Record<string, unknown>
      const numCompleto = String(ch.numero ?? '').trim()
      if (!numCompleto) continue
      const numCorto = (numCompleto.split('-').pop() || '').trim()
      const matchKey = faltantes.has(numCompleto)
        ? numCompleto
        : faltantes.has(numCorto)
          ? numCorto
          : null
      if (!matchKey) continue
      if (porNumero.has(numCompleto)) continue

      const benef = String(ch.beneficiarioRealFinanciero ?? ch.destinatario ?? '').trim()
      const benefNorm = normalizarNombre(benef)
      const estadoStr = String(ch.estadoBancario ?? ch.estado ?? 'Renovado')

      const sintetico: ChequeOcasionalDoc = {
        numeroCheque: numCompleto,
        beneficiario: benef,
        beneficiarioNormalizado: benefNorm,
        beneficiarioFormal: null,
        beneficiarioCuit: null,
        montoCentavos: typeof ch.montoCentavos === 'number' ? ch.montoCentavos : 0,
        fechaVencimiento: typeof ch.fechaPago === 'string' ? ch.fechaPago : null,
        fechaEmision: typeof ch.fechaEmision === 'string' ? ch.fechaEmision : null,
        estadoCodigo: null,
        estado: estadoStr,
        pagado: ch.estado === 'debitado' || ch.estado === 'renovado' || ch.fechaAcreditacion != null,
        esProveedorFinanciero: true,
        tipoProveedor: 'financiero',
        esRenovacion: false,
        renovacionDe: Array.isArray(ch.renovacionDe) ? (ch.renovacionDe as string[]) : [],
        renovadoPor: [],
        operacionUsd: null,
        tasaExplicita: null,
        obsOriginal: typeof ch.observaciones === 'string' ? ch.observaciones : '',
        revisar: [],
        vientriId: 0,
        vientriChqId: null,
        baja: false,
      }

      clonados.push(sintetico)
      porNumero.set(numCompleto, sintetico)
      if (numCorto && numCorto !== numCompleto) porNumero.set(numCorto, sintetico)
      faltantes.delete(matchKey)
      if (faltantes.size === 0) break
    }
  }

  if (faltantes.size > 0) {
    const vSnap = await adminDb().collection(VIENTRI_CHEQUES).get()
    for (const doc of vSnap.docs) {
      const v = doc.data() as VientriChequeDoc
      if (v.baja) continue
      const numCompleto = (v.numero || '').trim()
      const numCorto = (v.serie || numCompleto.split('-').pop() || '').trim()
      const matchKey = faltantes.has(numCompleto)
        ? numCompleto
        : faltantes.has(numCorto)
          ? numCorto
          : null
      if (!matchKey) continue

      const numeroCheque = numCompleto || numCorto
      if (porNumero.has(numeroCheque)) continue

      const benef = (v.destinatario ?? v.entregadoA?.nombre ?? '').trim()
      const benefNorm = normalizarNombre(benef)
      const vientriId = v.vientriChqocaId ?? v.vientriChqId ?? 0

      const sintetico: ChequeOcasionalDoc = {
        numeroCheque,
        beneficiario: benef,
        beneficiarioNormalizado: benefNorm,
        beneficiarioFormal: null,
        beneficiarioCuit: null,
        montoCentavos: v.montoCentavos ?? 0,
        fechaVencimiento: v.fechaVencimiento ?? null,
        fechaEmision: v.fechaEmision ?? null,
        estadoCodigo: v.estadoVientriId ?? null,
        estado: v.estadoVientri || v.estado || 'Renovado',
        pagado: v.fechaConciliado !== null || v.estado === 'debitado' || v.estado === 'renovado',
        esProveedorFinanciero: true,
        tipoProveedor: 'financiero',
        esRenovacion: false,
        renovacionDe: [],
        renovadoPor: [],
        operacionUsd: null,
        tasaExplicita: null,
        obsOriginal: '',
        revisar: v.revisar ?? [],
        vientriId,
        vientriChqId: null,
        baja: false,
      }

      clonados.push(sintetico)
      porNumero.set(numeroCheque, sintetico)
      if (numCorto && numCorto !== numeroCheque) porNumero.set(numCorto, sintetico)
      faltantes.delete(matchKey)
      if (faltantes.size === 0) break
    }
  }

  for (const nuevo of clonados) {
    for (const numViejo of nuevo.renovacionDe) {
      const viejo = porNumero.get(numViejo)
      if (viejo && !viejo.renovadoPor.includes(nuevo.numeroCheque)) {
        viejo.renovadoPor.push(nuevo.numeroCheque)
      }
    }
  }

  return clonados
}

finanzasChequesOcasionalesRouter.get('/', async (req, res) => {
  try {
    const todos = await leerTodos()

    const filtro = (typeof req.query.filtro === 'string' ? req.query.filtro : '') as
      | '' | 'financiero' | 'gasto_real' | 'con_renovacion' | 'con_usd'
    const q = typeof req.query.q === 'string' ? normalizar(req.query.q.trim()) : ''
    const page = Math.max(1, Number(req.query.page) || 1)

    let filtrados = todos.filter((d) => !d.baja)
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
        normalizar(`${d.beneficiario} ${d.numeroCheque} ${d.obsOriginal} ${d.estado}`).includes(q),
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
    const todos = await leerTodos()
    const activos = todos.filter((d) => !d.baja)
    const completos = await leerActivosConEslabonesDeVientri(activos)
    const cadenas = reconstruirCadenas(completos)
    const clasificados = clasificarCheques(completos, cadenas)
    res.json({ cadenas, clasificados })
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] cadenas', err)
    res.status(500).json({ error: 'No se pudieron calcular las cadenas de renovación' })
  }
})

finanzasChequesOcasionalesRouter.get('/resumen', async (_req, res) => {
  try {
    const todos = await leerTodos()
    const activos = todos.filter((d) => !d.baja)
    const completos = await leerActivosConEslabonesDeVientri(activos)
    const cadenas = reconstruirCadenas(completos)
    const resumen = resumirCostoFinanciero(cadenas)

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
    const renovItems = activos.filter((d) => d.renovacionDe.length > 0 || d.renovadoPor.length > 0)
    const usdItems = activos.filter((d) => d.operacionUsd !== null)

    const sumMonto = (arr: ChequeOcasionalDoc[]) => arr.reduce((s, d) => s + d.montoCentavos, 0)

    let totalMontoUsd = 0
    let sumaPonderadaTc = 0
    const gruposUsdMap = new Map<
      string,
      {
        beneficiario: string
        beneficiarioNormalizado: string
        montoUsd: number
        cotizacion: number
        equivalenteCentavos: number
        cantidadCheques: number
        sumaChequesCentavos: number
        cheques: string[]
      }
    >()

    for (const d of usdItems) {
      if (d.operacionUsd) {
        const key = `${d.beneficiarioNormalizado}|${d.operacionUsd.montoUsd}|${d.operacionUsd.cotizacion}`
        const existente = gruposUsdMap.get(key)
        if (existente) {
          existente.cantidadCheques += 1
          existente.sumaChequesCentavos += d.montoCentavos
          existente.cheques.push(d.numeroCheque)
        } else {
          gruposUsdMap.set(key, {
            beneficiario: d.beneficiario,
            beneficiarioNormalizado: d.beneficiarioNormalizado,
            montoUsd: d.operacionUsd.montoUsd,
            cotizacion: d.operacionUsd.cotizacion,
            equivalenteCentavos: Math.round(d.operacionUsd.montoUsd * d.operacionUsd.cotizacion * 100),
            cantidadCheques: 1,
            sumaChequesCentavos: d.montoCentavos,
            cheques: [d.numeroCheque],
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
      totalCheques: activos.length,
      totalMontoCentavos: sumMonto(validos),
      pendientesCantidad: pendientes.length,
      pendientesMontoCentavos: sumMonto(pendientes),
      fechasImposiblesCantidad: activos.length - validos.length,
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


// Debe ir después de '/cadenas' y '/resumen' para no capturarlas como :id
finanzasChequesOcasionalesRouter.get('/:id', async (req, res) => {
  try {
    const snap = await adminDb().collection(VIENTRI_CHEQUES_OCASIONALES).doc(req.params.id).get()
    if (!snap.exists) {
      res.status(404).json({ error: 'Cheque ocasional no encontrado' })
      return
    }
    const cheque = snap.data() as ChequeOcasionalDoc
    const todos = await leerTodos()
    const activos = todos.filter((d) => !d.baja)
    const completos = await leerActivosConEslabonesDeVientri(activos)
    const cadenas = reconstruirCadenas(completos)
    const clasificados = clasificarCheques(completos, cadenas)

    const porNumero = new Map<string, ChequeOcasionalDoc>()
    for (const d of completos) {
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
