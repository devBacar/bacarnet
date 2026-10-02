import * as XLSX from 'xlsx'
import type {
  ChequeDireccion,
  ChequeEstado,
  ChequeImportRow,
  ChequeOrigen,
  ChequeTipo,
} from '../domain/cheque.types.js'
import {
  countChequesFiltrados,
  findExistingNumeros,
  insertCheques,
  pageCheques,
  resumenDiario,
  sumChequesCentavos,
  sumChequesPorDireccion,
  type ChequeListadoItem,
  type ChequesFiltro,
} from './cheques.repository.js'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const PAGE_DEFAULT = 50
const PAGE_MAX = 100

// ── Listado API ──────────────────────────────────────────────────────

export interface ChequesListadoQuery {
  direccion?: string
  origen?: string
  estado?: string
  tipo?: string
  desde?: string
  hasta?: string
  page?: string
  limit?: string
}

export interface ChequesListadoResponse {
  direccion: ChequeDireccion | null
  origen: ChequeOrigen | null
  estado: ChequeEstado | null
  tipo: ChequeTipo | null
  desde: string | null
  hasta: string | null
  page: number
  limit: number
  total: number
  totalCentavos: number
  recibidosCentavos: number
  emitidosCentavos: number
  cheques: ChequeListadoItem[]
}

function parsePositiveInt(raw: string | undefined, fallback: number, max: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) throw new Error('page y limit tienen que ser enteros mayores a 0')
  return Math.min(n, max)
}

function validDireccion(raw: string | undefined): ChequeDireccion | null {
  if (!raw) return null
  if (raw !== 'recibido' && raw !== 'emitido') throw new Error(`direccion inválida: ${raw}`)
  return raw
}

function validOrigen(raw: string | undefined): ChequeOrigen | null {
  if (!raw) return null
  const valid: ChequeOrigen[] = ['cliente', 'tercero', 'propio']
  if (!valid.includes(raw as ChequeOrigen)) throw new Error(`origen inválido: ${raw}`)
  return raw as ChequeOrigen
}

const VALID_ESTADOS: ChequeEstado[] = [
  'en_cartera', 'depositado', 'vendido', 'rechazado',
  'pendiente', 'debitado',
]

function validEstado(raw: string | undefined): ChequeEstado | null {
  if (!raw) return null
  if (!VALID_ESTADOS.includes(raw as ChequeEstado)) throw new Error(`estado inválido: ${raw}`)
  return raw as ChequeEstado
}

function validTipo(raw: string | undefined): ChequeTipo | null {
  if (!raw) return null
  if (raw !== 'echeq' && raw !== 'fisico') throw new Error(`tipo inválido: ${raw}`)
  return raw
}

export async function listChequesApi(query: ChequesListadoQuery): Promise<ChequesListadoResponse> {
  const direccion = validDireccion(query.direccion?.trim())
  const origen = validOrigen(query.origen?.trim())
  const estado = validEstado(query.estado?.trim())
  const tipo = validTipo(query.tipo?.trim())
  const desde = query.desde?.trim() || null
  const hasta = query.hasta?.trim() || null
  if (desde && !ISO_DATE.test(desde)) throw new Error('desde debe tener formato AAAA-MM-DD')
  if (hasta && !ISO_DATE.test(hasta)) throw new Error('hasta debe tener formato AAAA-MM-DD')
  if (desde && hasta && desde > hasta) throw new Error('desde no puede ser posterior a hasta')

  const page = parsePositiveInt(query.page, 1, 10_000)
  const limit = parsePositiveInt(query.limit, PAGE_DEFAULT, PAGE_MAX)
  const offset = (page - 1) * limit
  const filtro: ChequesFiltro = { direccion, origen, estado, tipo, desde, hasta }
  const baseFiltro = { origen, estado, tipo, desde, hasta }

  const [total, totalCentavos, porDireccion, cheques] = await Promise.all([
    countChequesFiltrados(filtro),
    sumChequesCentavos(filtro),
    sumChequesPorDireccion(baseFiltro),
    pageCheques({ filtro, offset, limit }),
  ])

  return {
    direccion, origen, estado, tipo, desde, hasta,
    page, limit, total, totalCentavos,
    recibidosCentavos: porDireccion.recibidosCentavos,
    emitidosCentavos: porDireccion.emitidosCentavos,
    cheques,
  }
}

export function hoyArgentina(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

export async function getResumenDiario() {
  const hoy = hoyArgentina()
  return { fecha: hoy, ...(await resumenDiario(hoy)) }
}

// ── Shared helpers ──────────────────────────────────────────────────

const FISICO_RE = /^\d{3}-\d{3}-\d{4}-\d{8}$/

function detectTipo(numero: string): ChequeTipo {
  if (numero.toUpperCase().startsWith('E-CHEQ')) return 'echeq'
  return FISICO_RE.test(numero.trim()) ? 'fisico' : 'echeq'
}

function parseMontoCentavos(raw: string | number | null | undefined): number {
  if (raw == null) return 0
  if (typeof raw === 'number') return Math.round(raw * 100)
  const s = String(raw).replace(/[$.]/g, '').replace(',', '.').trim()
  const n = parseFloat(s)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

const MESES_ES: Record<string, string> = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', set: '09', sep: '09', oct: '10', nov: '11', dic: '12',
}

function parseSpanishDate(raw: string): string {
  if (!raw) return ''
  let s = raw.trim()
  if (ISO_DATE.test(s)) return s

  s = s.replace(/^[A-Za-zÀ-ɏ]{2,4}\.\s+/, '')
  if (ISO_DATE.test(s)) return s

  if (s.includes('T')) {
    const d = new Date(s)
    if (!isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    }
  }

  const m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (m) {
    const mes = MESES_ES[m[2].toLowerCase()]
    if (mes) return `${m[3]}-${mes}-${m[1].padStart(2, '0')}`
  }

  const parts = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (parts) {
    const y = parts[3].length === 2 ? `20${parts[3]}` : parts[3]
    return `${y}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
  }

  return ''
}

function formatExcelDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDateMDY(raw: string): string {
  if (!raw) return ''
  const s = raw.trim()
  if (ISO_DATE.test(s)) return s
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return parseSpanishDate(s)
  const y = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

function inferEstadoRecibido(raw: string): ChequeEstado {
  const norm = raw.toLowerCase().trim()
  if (norm.includes('vendido')) return 'vendido'
  if (norm.includes('depositado')) return 'depositado'
  if (norm.includes('rechazado')) return 'rechazado'
  return 'en_cartera'
}

export interface ImportResult {
  insertados: number
  ignorados: number
  duplicados: number
  errores: string[]
}

// ── Paste import (JSON rows) ────────────────────────────────────────

export interface IngresarChequesRow {
  numero: string
  emisor: string
  fechaEmision: string
  fechaPago: string
  montoPesos: string
  cmc7: string
  endosante: string
  bancoEmisor: string
  tipo: ChequeTipo
  condicion: string
}

export async function ingresarChequesPegados(input: {
  direccion: ChequeDireccion
  origen: ChequeOrigen
  rows: IngresarChequesRow[]
  actorUid: string
}): Promise<ImportResult> {
  const importRows: ChequeImportRow[] = []
  const errores: string[] = []
  let ignorados = 0

  for (let i = 0; i < input.rows.length; i++) {
    const r = input.rows[i]
    const numero = r.numero.trim()
    const montoCentavos = parseMontoCentavos(r.montoPesos)

    if (!numero && montoCentavos === 0) {
      ignorados++
      continue
    }
    if (!numero) {
      errores.push(`Fila ${i + 1}: sin número de cheque`)
      ignorados++
      continue
    }
    if (montoCentavos <= 0) {
      errores.push(`Fila ${i + 1}: importe inválido`)
      ignorados++
      continue
    }

    const endosanteRaw = r.endosante.trim() || null
    const endosante = endosanteRaw && endosanteRaw.toUpperCase() !== 'AL PORTADOR' ? endosanteRaw : null

    const emisorRaw = r.emisor.trim()
    const cuitMatch = emisorRaw.match(/CUIT\s+([\d-]+)/)
    const emisorCuit = cuitMatch ? cuitMatch[1] : ''
    const emisorNombre = emisorRaw.replace(/\n?CUIT\s+[\d-]+/, '').trim()

    importRows.push({
      numero,
      tipo: r.tipo,
      direccion: input.direccion,
      origen: input.origen,
      emisor: emisorNombre || emisorRaw,
      emisorCuit,
      fechaEmision: parseSpanishDate(r.fechaEmision),
      fechaPago: parseSpanishDate(r.fechaPago),
      montoCentavos,
      fechaRecibido: null,
      fechaEntregado: null,
      cliente: null,
      destinatario: null,
      estado: inferEstadoRecibido(r.condicion),
      utilizado: null,
      endosante,
      bancoEmisor: r.bancoEmisor.trim() || null,
      cmc7: r.cmc7.trim() || null,
      observaciones: null,
    })
  }

  if (importRows.length === 0) {
    return { insertados: 0, ignorados, duplicados: 0, errores: [...errores, 'No se encontraron cheques válidos'] }
  }

  const existing = await findExistingNumeros(
    input.direccion,
    importRows.map((r) => r.numero),
  )
  const nuevos = importRows.filter((r) => !existing.has(r.numero))
  const duplicados = importRows.length - nuevos.length

  if (nuevos.length === 0) {
    return { insertados: 0, ignorados, duplicados, errores }
  }

  const insertados = await insertCheques({ rows: nuevos, createdBy: input.actorUid })
  return { insertados, ignorados, duplicados, errores }
}

// ── Excel import ────────────────────────────────────────────────────

type RawRow = Record<string, unknown>

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 /]/g, '')
    .trim()
}

function cellVal(row: unknown[], idx: number): unknown {
  return idx >= 0 && idx < row.length ? row[idx] : null
}

function cellToStr(val: unknown): string {
  if (val == null) return ''
  if (val instanceof Date) return formatExcelDate(val)
  return String(val).trim()
}

function cellToDate(val: unknown): string {
  if (val == null) return ''
  if (val instanceof Date) return formatExcelDate(val)
  if (typeof val === 'string' && val.includes('T')) {
    const d = new Date(val)
    if (!isNaN(d.getTime())) {
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    }
  }
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  return parseSpanishDate(String(val))
}

function cellToDateMDY(val: unknown): string {
  if (val == null) return ''
  if (val instanceof Date) return formatExcelDate(val)
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val)
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  return parseDateMDY(String(val))
}

// ── Detect format ────────────────────────────────────────────────────

type ExcelFormato =
  | 'recibidos'
  | 'emitidos-488'
  | 'emitidos-488-ext'
  | 'emitidos-vientri'
  | 'recibidos-32'
  | 'recibidos-informe'
  | 'desconocido'

function detectarFormato(rows: unknown[][]): { formato: ExcelFormato; headerIdx: number } {
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = rows[i]
    if (!row) continue
    const cells = row.map((c) => normalize(cellToStr(c)))
    if (cells.includes('cheque') && cells.includes('cliente')) {
      return { formato: 'recibidos', headerIdx: i }
    }
    if (cells.includes('nro') && cells.includes('destinatario')) {
      return { formato: 'emitidos-488', headerIdx: i }
    }
    if (cells.some((c) => c.includes('numero de cheque')) && cells.some((c) => c.includes('fecha op'))) {
      return { formato: 'emitidos-vientri', headerIdx: i }
    }
    if (cells.some((c) => c.includes('n cheque')) && cells.some((c) => c.includes('emitido'))) {
      return { formato: 'recibidos-32', headerIdx: i }
    }
    if (cells.includes('nro') && cells.includes('dmafecvto') && cells.some((c) => c.includes('bancodes'))) {
      return { formato: 'emitidos-488-ext', headerIdx: i }
    }
    if (cells.includes('nro') && cells.includes('fecemision') && cells.some((c) => c.includes('bancodes'))) {
      return { formato: 'recibidos-informe', headerIdx: i }
    }
  }
  return { formato: 'desconocido', headerIdx: -1 }
}

// ── Parser: recibidos ───────────────────────────────────────────────

const CHEQUE_FIELD_RE = /CH\s*N°\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)/i
const CHEQUE_PREFIX_RE = /^(UTILIZADO|DEPOSITADO|VENDIDO|RECHAZADO)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i

function parseChequePrefix(blob: string): { prefixEstado: string | null; prefixFechaVto: string } {
  const m = CHEQUE_PREFIX_RE.exec(blob)
  if (!m) return { prefixEstado: null, prefixFechaVto: '' }
  return {
    prefixEstado: m[1].toLowerCase(),
    prefixFechaVto: parseSpanishDate(m[2]),
  }
}

function parseRecibidosSheet(
  rows: unknown[][],
  headerIdx: number,
): { parsed: ChequeImportRow[]; errores: string[]; ignorados: number } {
  const header = rows[headerIdx].map((c) => normalize(cellToStr(c)))
  const col = (name: string) => header.indexOf(name)

  const iCheque = col('cheque')
  const iCliente = col('cliente')
  const iRecibido = col('recibido')
  const iEntregado = col('entregado')
  const iImporte = col('importe')
  const iVto = header.findIndex((h) => h.includes('fec') && h.includes('vto'))
  const iEstado = col('estado')

  const byNumero = new Map<string, ChequeImportRow>()
  const errores: string[] = []
  let ignorados = 0

  for (let ri = headerIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri]
    if (!row) continue

    const idVal = cellVal(row, 1)
    if (typeof idVal !== 'number') continue

    const importeRaw = cellVal(row, iImporte)
    const montoCentavos = parseMontoCentavos(importeRaw as string | number | null)
    if (montoCentavos <= 0) {
      ignorados++
      continue
    }

    const chequeStr = cellToStr(cellVal(row, iCheque))
    const match = CHEQUE_FIELD_RE.exec(chequeStr)
    if (!match) {
      errores.push(`Fila ${ri + 1}: no se pudo parsear el campo Cheque`)
      ignorados++
      continue
    }

    const numero = match[1].trim()
    const emisor = match[2].trim()
    const bancoEmisor = match[3].trim()

    const { prefixEstado, prefixFechaVto } = parseChequePrefix(chequeStr)

    const estadoRaw = cellToStr(cellVal(row, iEstado))

    const fechaVtoCol = parseSpanishDate(cellToStr(cellVal(row, iVto)))
    const fechaPago = fechaVtoCol || prefixFechaVto

    const detalle = prefixEstado
      ? `${prefixEstado === 'utilizado' ? 'Utilizado' : 'En cartera'}${prefixFechaVto ? ` ${prefixFechaVto}` : ''}`
      : null

    const existing = byNumero.get(numero)
    if (existing) {
      if (detalle && !existing.observaciones) existing.observaciones = detalle
      if (prefixEstado === 'utilizado') existing.utilizado = true
      continue
    }

    byNumero.set(numero, {
      numero,
      tipo: detectTipo(numero),
      direccion: 'recibido',
      origen: 'tercero',
      montoCentavos,
      fechaEmision: '',
      fechaPago,
      fechaRecibido: parseSpanishDate(cellToStr(cellVal(row, iRecibido))),
      fechaEntregado: parseSpanishDate(cellToStr(cellVal(row, iEntregado))) || null,
      emisor,
      emisorCuit: '',
      bancoEmisor: bancoEmisor || null,
      cliente: cellToStr(cellVal(row, iCliente)) || null,
      endosante: null,
      destinatario: null,
      estado: inferEstadoRecibido(estadoRaw),
      utilizado: prefixEstado === 'utilizado',
      cmc7: null,
      observaciones: detalle,
    })
  }

  return { parsed: [...byNumero.values()], errores, ignorados }
}

// ── Parser: emitidos (reporte 488) ──────────────────────────────────

function parseEmitidos488Sheet(
  rows: unknown[][],
  headerIdx: number,
): { parsed: ChequeImportRow[]; errores: string[]; ignorados: number } {
  const header = rows[headerIdx].map((c) => normalize(cellToStr(c)))
  const col = (name: string) => header.indexOf(name)

  const iNro = col('nro')
  const iDmaEmision = col('dmafecemision')
  const iDmaVto = col('dmafecvto')
  const iDestinatario = col('destinatario')
  const iImporte = col('importe')
  const iUtilizado = col('utilizado')
  const iRechazado = col('rechazado')

  const parsed: ChequeImportRow[] = []
  const errores: string[] = []
  let ignorados = 0

  for (let ri = headerIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri]
    if (!row) continue

    const nroRaw = cellToStr(cellVal(row, iNro))
    if (!nroRaw) continue

    const importeRaw = cellVal(row, iImporte)
    const montoCentavos = parseMontoCentavos(importeRaw as string | number | null)
    if (montoCentavos <= 0) {
      errores.push(`Fila ${ri + 1}: importe inválido`)
      ignorados++
      continue
    }

    const rechazado = cellVal(row, iRechazado) === true
    const utilizado = cellVal(row, iUtilizado) === true

    let estado: ChequeEstado
    if (rechazado) estado = 'rechazado'
    else if (utilizado) estado = 'debitado'
    else estado = 'pendiente'

    parsed.push({
      numero: nroRaw,
      tipo: detectTipo(nroRaw),
      direccion: 'emitido',
      origen: 'propio',
      montoCentavos,
      fechaEmision: parseSpanishDate(cellToStr(cellVal(row, iDmaEmision))),
      fechaPago: parseSpanishDate(cellToStr(cellVal(row, iDmaVto))),
      fechaRecibido: null,
      fechaEntregado: null,
      emisor: '',
      emisorCuit: '',
      bancoEmisor: null,
      cliente: null,
      endosante: null,
      destinatario: cellToStr(cellVal(row, iDestinatario)) || null,
      estado,
      utilizado,
      cmc7: null,
      observaciones: null,
    })
  }

  return { parsed, errores, ignorados }
}

// ── Parser: emitidos (Vientri grilla) ──────────────────────────────

function inferEstadoEmitidoVientri(raw: string): ChequeEstado | null {
  const norm = raw.toLowerCase().trim()
  if (norm.includes('renovado')) return null
  if (norm.includes('rechazado')) return 'rechazado'
  if (norm.includes('pago confirmado') || norm.includes('resumen bancario')) return 'debitado'
  if (norm.includes('abonado')) return 'debitado'
  if (norm.includes('pago a proveedor')) return 'debitado'
  if (!norm) return 'pendiente'
  return 'debitado'
}

function parseEmitidosVientriSheet(
  rows: unknown[][],
  headerIdx: number,
): { parsed: ChequeImportRow[]; errores: string[]; ignorados: number } {
  const header = rows[headerIdx].map((c) => normalize(cellToStr(c)))

  const iDestinatario = header.findIndex((h) => h.includes('destinatario'))
  const iNumero = header.findIndex((h) => h.includes('numero de cheque'))
  const iFechaOP = header.findIndex((h) => h.includes('fecha op'))
  const iFecVto = header.findIndex((h) => h === 'fecvto')
  const iImporte = header.indexOf('importe')
  const iBanco = header.indexOf('banco')
  const iEstado = header.indexOf('estado')

  const parsed: ChequeImportRow[] = []
  const errores: string[] = []
  let ignorados = 0

  for (let ri = headerIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri]
    if (!row) continue

    const nroRaw = cellToStr(cellVal(row, iNumero))
    if (!nroRaw) continue

    const montoCentavos = parseMontoCentavos(cellVal(row, iImporte) as string | number | null)
    if (montoCentavos <= 0) {
      ignorados++
      continue
    }

    const estadoRaw = cellToStr(cellVal(row, iEstado))
    const estado = inferEstadoEmitidoVientri(estadoRaw)
    if (estado === null) {
      ignorados++
      continue
    }

    parsed.push({
      numero: nroRaw,
      tipo: detectTipo(nroRaw),
      direccion: 'emitido',
      origen: 'propio',
      montoCentavos,
      fechaEmision: cellToDate(cellVal(row, iFechaOP)),
      fechaPago: cellToDate(cellVal(row, iFecVto)),
      fechaRecibido: null,
      fechaEntregado: null,
      emisor: '',
      emisorCuit: '',
      bancoEmisor: cellToStr(cellVal(row, iBanco)) || null,
      cliente: null,
      endosante: null,
      destinatario: cellToStr(cellVal(row, iDestinatario)) || null,
      estado,
      utilizado: estado === 'debitado',
      cmc7: null,
      observaciones: null,
    })
  }

  return { parsed, errores, ignorados }
}

// ── Parser: emitidos (reporte-488 extendido con banco) ─────────────

function parseEmitidos488ExtSheet(
  rows: unknown[][],
  headerIdx: number,
): { parsed: ChequeImportRow[]; errores: string[]; ignorados: number } {
  const header = rows[headerIdx].map((c) => normalize(cellToStr(c)))

  const iDes = header.indexOf('des')
  const iNro = header.indexOf('nro')
  const iFecCmp = header.findIndex((h) => h === 'feccmp' || h === 'dmafeccmp')
  const iFecVto = header.findIndex((h) => h === 'fecvto' || h === 'dmafecvto')
  const iImporte = header.indexOf('importe')
  const iBanco = header.findIndex((h) => h === 'bancodes')
  const iEstado = header.findIndex((h) => h === 'estadochdes')
  const iRechazado = header.indexOf('rechazado')

  const parsed: ChequeImportRow[] = []
  const errores: string[] = []
  let ignorados = 0

  for (let ri = headerIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri]
    if (!row) continue

    const nroRaw = cellToStr(cellVal(row, iNro))
    if (!nroRaw) continue

    const montoCentavos = parseMontoCentavos(cellVal(row, iImporte) as string | number | null)
    if (montoCentavos <= 0) {
      ignorados++
      continue
    }

    const estadoRaw = cellToStr(cellVal(row, iEstado))
    const rechazado = String(cellVal(row, iRechazado)).toLowerCase() === 'true'

    const estado = rechazado ? 'rechazado' : inferEstadoEmitidoVientri(estadoRaw)
    if (estado === null) {
      ignorados++
      continue
    }

    parsed.push({
      numero: nroRaw,
      tipo: detectTipo(nroRaw),
      direccion: 'emitido',
      origen: 'propio',
      montoCentavos,
      fechaEmision: cellToDate(cellVal(row, iFecCmp)),
      fechaPago: cellToDate(cellVal(row, iFecVto)),
      fechaRecibido: null,
      fechaEntregado: null,
      emisor: '',
      emisorCuit: '',
      bancoEmisor: cellToStr(cellVal(row, iBanco)) || null,
      cliente: null,
      endosante: null,
      destinatario: cellToStr(cellVal(row, iDes)) || null,
      estado,
      utilizado: estado === 'debitado',
      cmc7: null,
      observaciones: null,
    })
  }

  return { parsed, errores, ignorados }
}

// ── Parser: recibidos (reporte-32) ─────────────────────────────────

function parseRecibidos32Sheet(
  rows: unknown[][],
  headerIdx: number,
): { parsed: ChequeImportRow[]; errores: string[]; ignorados: number } {
  const header = rows[headerIdx].map((c) => normalize(cellToStr(c)))

  const iBanco = header.indexOf('banco')
  const iEmisor = header.findIndex((h) => h.includes('emisor') && h.includes('cheque'))
  const iCuit = header.findIndex((h) => h.includes('cuit'))
  const iNCheque = header.findIndex((h) => h.includes('n cheque'))
  const iEmitido = header.findIndex((h) => h.includes('emitido'))
  const iVto = header.findIndex((h) => h.includes('vencimiento'))
  const iImporte = header.indexOf('importe')
  const iEstado = header.indexOf('estado')

  const parsed: ChequeImportRow[] = []
  const errores: string[] = []
  let ignorados = 0

  for (let ri = headerIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri]
    if (!row) continue

    const nroRaw = cellToStr(cellVal(row, iNCheque))
    if (!nroRaw) continue

    const montoCentavos = parseMontoCentavos(cellVal(row, iImporte) as string | number | null)
    if (montoCentavos <= 0) {
      ignorados++
      continue
    }

    const emisorRaw = cellToStr(cellVal(row, iEmisor))
    const emisorParts = emisorRaw.split('/')
    const emisor = emisorParts[0]?.trim() || emisorParts[1]?.trim() || emisorRaw

    parsed.push({
      numero: nroRaw,
      tipo: detectTipo(nroRaw),
      direccion: 'recibido',
      origen: 'tercero',
      montoCentavos,
      fechaEmision: cellToDate(cellVal(row, iEmitido)),
      fechaPago: cellToDateMDY(cellVal(row, iVto)),
      fechaRecibido: null,
      fechaEntregado: null,
      emisor,
      emisorCuit: cellToStr(cellVal(row, iCuit)),
      bancoEmisor: cellToStr(cellVal(row, iBanco)) || null,
      cliente: null,
      endosante: null,
      destinatario: null,
      estado: iEstado >= 0 ? inferEstadoRecibido(cellToStr(cellVal(row, iEstado))) : 'en_cartera',
      utilizado: null,
      cmc7: null,
      observaciones: null,
    })
  }

  return { parsed, errores, ignorados }
}

// ── Parser: recibidos (informe) ────────────────────────────────────

function parseRecibidosInformeSheet(
  rows: unknown[][],
  headerIdx: number,
): { parsed: ChequeImportRow[]; errores: string[]; ignorados: number } {
  const header = rows[headerIdx].map((c) => normalize(cellToStr(c)))

  const iNro = header.indexOf('nro')
  const iFecEmision = header.indexOf('fecemision')
  const iFecVto = header.indexOf('fecvto')
  const iImporte = header.indexOf('importe')
  const iBanco = header.findIndex((h) => h === 'bancodes')
  const iCuit = header.findIndex((h) => h === 'peremicuit')
  const iFirma = header.indexOf('firma')
  const iEstado = header.findIndex((h) => h === 'estadochdes')

  const parsed: ChequeImportRow[] = []
  const errores: string[] = []
  let ignorados = 0

  for (let ri = headerIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri]
    if (!row) continue

    const nroRaw = cellToStr(cellVal(row, iNro))
    if (!nroRaw) continue

    const montoCentavos = parseMontoCentavos(cellVal(row, iImporte) as string | number | null)
    if (montoCentavos <= 0) {
      ignorados++
      continue
    }

    const firmaRaw = cellToStr(cellVal(row, iFirma))
    const firmaParts = firmaRaw.split('/')
    const emisor = firmaParts[0]?.trim() || firmaParts[1]?.trim() || firmaRaw

    const estadoRaw = cellToStr(cellVal(row, iEstado))

    parsed.push({
      numero: nroRaw,
      tipo: detectTipo(nroRaw),
      direccion: 'recibido',
      origen: 'tercero',
      montoCentavos,
      fechaEmision: cellToDate(cellVal(row, iFecEmision)),
      fechaPago: cellToDateMDY(cellVal(row, iFecVto)),
      fechaRecibido: null,
      fechaEntregado: null,
      emisor,
      emisorCuit: cellToStr(cellVal(row, iCuit)),
      bancoEmisor: cellToStr(cellVal(row, iBanco)) || null,
      cliente: null,
      endosante: null,
      destinatario: null,
      estado: inferEstadoRecibido(estadoRaw),
      utilizado: null,
      cmc7: null,
      observaciones: null,
    })
  }

  return { parsed, errores, ignorados }
}

// ── Main Excel import ───────────────────────────────────────────────

export async function importChequesExcel(input: {
  buffer: Buffer
  actorUid: string
}): Promise<ImportResult> {
  const workbook = XLSX.read(input.buffer, { type: 'buffer', cellDates: true })
  const allRows: ChequeImportRow[] = []
  const errores: string[] = []
  let ignorados = 0

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })
    if (rawRows.length === 0) continue

    const { formato, headerIdx } = detectarFormato(rawRows)

    let result: { parsed: ChequeImportRow[]; errores: string[]; ignorados: number } | null = null

    if (formato === 'recibidos') {
      result = parseRecibidosSheet(rawRows, headerIdx)
    } else if (formato === 'emitidos-488') {
      result = parseEmitidos488Sheet(rawRows, headerIdx)
    } else if (formato === 'emitidos-vientri') {
      result = parseEmitidosVientriSheet(rawRows, headerIdx)
    } else if (formato === 'recibidos-32') {
      result = parseRecibidos32Sheet(rawRows, headerIdx)
    } else if (formato === 'emitidos-488-ext') {
      result = parseEmitidos488ExtSheet(rawRows, headerIdx)
    } else if (formato === 'recibidos-informe') {
      result = parseRecibidosInformeSheet(rawRows, headerIdx)
    } else {
      errores.push(`Hoja "${sheetName}": formato no reconocido`)
    }

    if (result) {
      allRows.push(...result.parsed)
      errores.push(...result.errores)
      ignorados += result.ignorados
    }
  }

  if (allRows.length === 0) {
    return { insertados: 0, ignorados, duplicados: 0, errores: [...errores, 'No se encontraron cheques válidos en el archivo'] }
  }

  const recibidos = allRows.filter((r) => r.direccion === 'recibido')
  const emitidos = allRows.filter((r) => r.direccion === 'emitido')

  const [existRec, existEm] = await Promise.all([
    recibidos.length > 0 ? findExistingNumeros('recibido', recibidos.map((r) => r.numero)) : new Set<string>(),
    emitidos.length > 0 ? findExistingNumeros('emitido', emitidos.map((r) => r.numero)) : new Set<string>(),
  ])

  const nuevos = allRows.filter((r) => {
    const existing = r.direccion === 'recibido' ? existRec : existEm
    return !existing.has(r.numero)
  })
  const duplicados = allRows.length - nuevos.length

  if (nuevos.length === 0) {
    return { insertados: 0, ignorados, duplicados, errores }
  }

  const insertados = await insertCheques({ rows: nuevos, createdBy: input.actorUid })
  return { insertados, ignorados, duplicados, errores }
}
