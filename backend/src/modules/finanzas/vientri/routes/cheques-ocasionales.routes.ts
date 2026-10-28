import { Router } from 'express'
import { requireViewFinanzas, requireWorkspaceUser } from '../../../auth/middleware.js'
import { adminDb } from '../../../../lib/firebase/admin.js'
import { VIENTRI_CHEQUES_OCASIONALES } from '../services/importar-cheques-ocasionales.js'
import type { ChequeOcasionalDoc } from '../domain/cheque-ocasional.types.js'
import { reconstruirCadenas, clasificarCheques, resumirCostoFinanciero } from '../domain/cadena-renovacion.js'

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

    let filtrados = todos.filter((d) => !d.baja)

    if (filtro === 'financiero') filtrados = filtrados.filter((d) => d.esProveedorFinanciero)
    else if (filtro === 'gasto_real') filtrados = filtrados.filter((d) => !d.esProveedorFinanciero)
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
    const cadenas = reconstruirCadenas(activos)
    const clasificados = clasificarCheques(activos, cadenas)
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
    const cadenas = reconstruirCadenas(activos)
    const resumen = resumirCostoFinanciero(cadenas)

    const totalCheques = activos.length
    const financieros = activos.filter((d) => d.esProveedorFinanciero).length
    const conRenovacion = activos.filter((d) => d.renovacionDe.length > 0 || d.renovadoPor.length > 0).length
    const conUsd = activos.filter((d) => d.operacionUsd !== null).length

    res.json({
      totalCheques,
      financieros,
      conRenovacion,
      conUsd,
      costoFinanciero: resumen,
    })
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] resumen', err)
    res.status(500).json({ error: 'No se pudo calcular el resumen' })
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
    res.json({ cheque: snap.data() as ChequeOcasionalDoc })
  } catch (err) {
    console.error('[finanzas/cheques-ocasionales] detalle', err)
    res.status(500).json({ error: 'No se pudo obtener el cheque ocasional' })
  }
})
