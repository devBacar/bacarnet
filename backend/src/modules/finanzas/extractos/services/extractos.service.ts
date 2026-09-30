import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'
import type { CuentaDocument } from '../../domain/cuenta.types.js'
import { dateIdInArgentina, getCuentaDocument } from '../../services/cuentas.repository.js'
import { listCategoriaMovimientoDocuments } from '../../movimientos/services/categorias-movimientos.repository.js'
import { movimientosBancariosCollection } from '../../movimientos/services/movimientos.repository.js'
import {
  reglaAplicableDesdeDocumento,
  type ReglaCategorizacionAplicable,
} from '../../movimientos/domain/regla-categorizacion.js'
import { listReglaCategorizacionDocuments } from '../../movimientos/services/reglas-categorizacion.repository.js'
import { aplicarCategorias } from '../domain/categoria-fila.js'
import { controlarExtracto } from '../domain/control-extracto.js'
import { ExtractoConsultaError } from '../domain/extracto.errors.js'
import { generarExcelExtracto, nombreArchivoExtracto } from '../domain/extracto-excel.js'
import type {
  FilaExtractoVista,
  ItemControl,
  MovimientoControlable,
  ResumenExtracto,
  ResultadoControl,
} from '../domain/extracto.types.js'
import { validarPeriodoExtracto } from '../domain/periodo.js'
import { armarFilasExtracto } from '../domain/saldo-corrido.js'
import { fetchExtracto } from '../adapters/interbanking-extractos.js'

export interface ExtractoConsulta {
  cuenta: {
    id: string
    bancoNombre: string
    tipo: string
    tipoLabel: string
    numeroCuenta: string
  }
  desde: string
  hasta: string
  resumen: ResumenExtracto
  filas: FilaExtractoVista[]
  control: {
    coincide: boolean
    faltanEnBacarnet: ItemControl[]
    sobranEnBacarnet: ItemControl[]
    porDia: ResultadoControl['porDia']
  }
  archivo: string
}

function textoONull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const texto = value.trim()
  return texto ? texto : null
}

function voucherDe(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return null
  return Math.trunc(value)
}

function correlativoDe(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.trunc(value)
}

function esCuentaDeExtracto(data: CuentaDocument): boolean {
  if (data.tipo !== 'CC' || data.moneda !== 'ARS') return false
  if (data.origenSaldo === 'manual') return false
  return true
}

async function exigirCuenta(cuentaId: string): Promise<{ id: string; data: CuentaDocument }> {
  const id = cuentaId.trim()
  if (!id) throw new ExtractoConsultaError('Elegí una cuenta.')
  const cuenta = await getCuentaDocument(id)
  if (!cuenta) throw new ExtractoConsultaError('No encontramos esa cuenta.')
  if (!esCuentaDeExtracto(cuenta.data)) {
    throw new ExtractoConsultaError('Esta cuenta no tiene extracto del banco. Elegí una cuenta corriente en pesos.')
  }
  return cuenta
}

async function listarMovimientosBacarnet(
  cuentaId: string,
  desde: string,
  hasta: string,
): Promise<MovimientoControlable[]> {
  const filas: MovimientoControlable[] = []
  let cursor: QueryDocumentSnapshot | null = null
  for (;;) {
    let query = movimientosBancariosCollection()
      .where('cuentaId', '==', cuentaId)
      .where('fechaProceso', '>=', desde)
      .where('fechaProceso', '<=', hasta)
      .orderBy('fechaProceso', 'asc')
      .limit(400)
    if (cursor) query = query.startAfter(cursor)
    const snap = await query.get()
    if (snap.empty) break
    for (const doc of snap.docs) {
      const data = doc.data()
      const tipo = data.tipo === 'credito' ? 'credito' : data.tipo === 'debito' ? 'debito' : null
      if (!tipo || typeof data.montoCentavos !== 'number') continue
      filas.push({
        fechaProceso: typeof data.fechaProceso === 'string' ? data.fechaProceso : '',
        tipo,
        montoCentavos: data.montoCentavos,
        descripcion: typeof data.descripcion === 'string' ? data.descripcion : '',
        codeDescriptionIb: textoONull(data.codeDescriptionIb),
        customerCuit: textoONull(data.customerCuit),
        operationCodeBank: typeof data.operationCodeBank === 'string' ? data.operationCodeBank : '',
        operationCodeIb: typeof data.operationCodeIb === 'string' ? data.operationCodeIb : '',
        voucherNumber: voucherDe(data.voucherNumber),
        correlativeNumber: correlativoDe(data.correlativeNumber),
        depositorDescription: textoONull(data.depositorDescription),
        categoriaId: typeof data.categoriaId === 'string' && data.categoriaId ? data.categoriaId : null,
      })
    }
    cursor = snap.docs[snap.docs.length - 1] ?? null
    if (snap.size < 400) break
  }
  return filas
}

async function cargarReglas(): Promise<ReglaCategorizacionAplicable[]> {
  const docs = await listReglaCategorizacionDocuments()
  const reglas: ReglaCategorizacionAplicable[] = []
  for (const doc of docs) {
    const regla = reglaAplicableDesdeDocumento(doc.data)
    if (regla) reglas.push(regla)
  }
  return reglas
}

async function cargarNombres(): Promise<Map<string, string>> {
  const docs = await listCategoriaMovimientoDocuments()
  return new Map(docs.map((doc) => [doc.id, doc.data.nombre]))
}

export async function consultarExtracto(input: {
  cuentaId: string
  desde: string
  hasta: string
  hoy?: string
}): Promise<ExtractoConsulta> {
  const hoy = input.hoy ?? dateIdInArgentina(new Date())
  validarPeriodoExtracto(input.desde, input.hasta, hoy)
  const cuenta = await exigirCuenta(input.cuentaId)

  const [banco, nuestros, reglas, nombres] = await Promise.all([
    fetchExtracto({ cuentaId: cuenta.id, desde: input.desde, hasta: input.hasta }),
    listarMovimientosBacarnet(cuenta.id, input.desde, input.hasta),
    cargarReglas(),
    cargarNombres(),
  ])

  const armado = armarFilasExtracto(banco.dias)
  const control = controlarExtracto({
    filas: armado.filas,
    movimientosBacarnet: nuestros,
    dias: banco.dias,
  })
  const categorias = aplicarCategorias(armado.filas, control.categoriaIdPorFila, reglas, nombres)
  const filas: FilaExtractoVista[] = armado.filas.map((fila, indice) => ({
    fecha: fila.fechaProceso,
    concepto: fila.descripcion,
    categoria: categorias[indice] ?? 'Sin clasificar',
    tipo: fila.tipo,
    debitoCentavos: fila.debitoCentavos,
    creditoCentavos: fila.creditoCentavos,
    saldoCentavos: fila.saldoCentavos,
  }))

  const tipoLabel = 'Cuenta corriente'
  return {
    cuenta: {
      id: cuenta.id,
      bancoNombre: banco.bancoNombre,
      tipo: cuenta.data.tipo,
      tipoLabel,
      numeroCuenta: banco.numeroCuenta,
    },
    desde: input.desde,
    hasta: input.hasta,
    resumen: armado.resumen,
    filas,
    control: {
      coincide: control.coincide,
      faltanEnBacarnet: control.faltanEnBacarnet,
      sobranEnBacarnet: control.sobranEnBacarnet,
      porDia: control.porDia,
    },
    archivo: nombreArchivoExtracto({
      bancoNombre: banco.bancoNombre,
      tipo: cuenta.data.tipo,
      desde: input.desde,
      hasta: input.hasta,
    }),
  }
}

export async function excelDeExtracto(input: {
  cuentaId: string
  desde: string
  hasta: string
}): Promise<{ buffer: Buffer; filename: string }> {
  const consulta = await consultarExtracto(input)
  const buffer = generarExcelExtracto({
    bancoNombre: consulta.cuenta.bancoNombre,
    numeroCuenta: consulta.cuenta.numeroCuenta,
    tipoLabel: consulta.cuenta.tipoLabel,
    desde: consulta.desde,
    hasta: consulta.hasta,
    descargadoEl: dateIdInArgentina(new Date()),
    resumen: consulta.resumen,
    filas: consulta.filas,
    control: {
      ...consulta.control,
      categoriaIdPorFila: [],
    },
  })
  return { buffer, filename: consulta.archivo }
}
