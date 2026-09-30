import * as XLSX from 'xlsx'
import type { FilaExtractoVista, ItemControl, ResultadoControl, ResumenExtracto } from './extracto.types.js'
import { fechaDma } from './periodo.js'

const FORMATO_PESOS = '#,##0.00'
const FORMATO_FECHA = 'dd/mm/yyyy'

export interface ExtractoExcelInput {
  bancoNombre: string
  numeroCuenta: string
  tipoLabel: string
  desde: string
  hasta: string
  descargadoEl: string
  resumen: ResumenExtracto
  filas: readonly FilaExtractoVista[]
  control: ResultadoControl
}

interface Celda {
  t: 's' | 'n'
  v: string | number
  z?: string
}

/** Pesos con 2 decimales, sin el error de pasar centavos a float a mano. */
export function centavosAPesos(centavos: number): number {
  const signo = centavos < 0 ? -1 : 1
  const abs = Math.abs(Math.trunc(centavos))
  const pesos = Math.trunc(abs / 100)
  const cents = abs % 100
  return signo * Number(`${pesos}.${String(cents).padStart(2, '0')}`)
}

/** Número de serie de Excel (sistema 1900) para una fecha YYYY-MM-DD. */
export function serialExcel(iso: string): number {
  const [year, month, day] = iso.split('-').map((part) => Number(part))
  const utc = Date.UTC(year, month - 1, day)
  const epoch = Date.UTC(1899, 11, 30)
  return Math.round((utc - epoch) / 86_400_000)
}

export function nombreArchivoExtracto(input: {
  bancoNombre: string
  tipo: string
  desde: string
  hasta: string
}): string {
  const banco = input.bancoNombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w .()-]+/g, '')
    .trim()
  const periodo =
    input.desde.slice(0, 7) === input.hasta.slice(0, 7)
      ? input.desde.slice(0, 7)
      : `${input.desde}_${input.hasta}`
  return `Extracto ${banco} ${input.tipo} ${periodo}.xlsx`
}

class Hoja {
  private celdas = new Map<string, Celda>()
  private maxR = 0
  private maxC = 0

  texto(c: number, r: number, valor: string): void {
    this.set(c, r, { t: 's', v: valor })
  }

  pesos(c: number, r: number, centavos: number): void {
    this.set(c, r, { t: 'n', v: centavosAPesos(centavos), z: FORMATO_PESOS })
  }

  fecha(c: number, r: number, iso: string): void {
    this.set(c, r, { t: 'n', v: serialExcel(iso), z: FORMATO_FECHA })
  }

  private set(c: number, r: number, celda: Celda): void {
    this.celdas.set(XLSX.utils.encode_cell({ c, r }), celda)
    if (r > this.maxR) this.maxR = r
    if (c > this.maxC) this.maxC = c
  }

  alLibro(wb: XLSX.WorkBook, nombre: string, cols: XLSX.ColInfo[], merges?: XLSX.Range[]): void {
    const ws: XLSX.WorkSheet = {}
    for (const [addr, celda] of this.celdas) ws[addr] = celda
    ws['!ref'] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: this.maxC, r: this.maxR } })
    ws['!cols'] = cols
    if (merges && merges.length > 0) ws['!merges'] = merges
    ws['!pageSetup'] = {
      orientation: 'landscape',
      paperSize: 9,
      fitToWidth: 1,
      fitToHeight: 0,
    }
    ws['!margins'] = { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 }
    XLSX.utils.book_append_sheet(wb, ws, nombre)
  }
}

function hayDiferencias(control: ResultadoControl): boolean {
  return (
    !control.coincide ||
    control.faltanEnBacarnet.length > 0 ||
    control.sobranEnBacarnet.length > 0 ||
    control.porDia.some((dia) => !dia.coincide)
  )
}

function filaMovimiento(hoja: Hoja, fila: number, item: ItemControl): void {
  hoja.fecha(0, fila, item.fecha)
  hoja.texto(1, fila, item.concepto)
  if (item.tipo === 'debito') hoja.pesos(2, fila, item.montoCentavos)
  else hoja.pesos(3, fila, item.montoCentavos)
}

function armarExtracto(input: ExtractoExcelInput, hoja: Hoja): void {
  hoja.texto(0, 0, 'Extracto bancario')
  const periodo = `${fechaDma(input.desde)} al ${fechaDma(input.hasta)}`
  const textos: Array<[string, string]> = [
    ['Banco', input.bancoNombre],
    ['Cuenta', `${input.tipoLabel} · ${input.numeroCuenta}`],
    ['Período', periodo],
    ['Fuente', 'extracto oficial vía Interbanking'],
  ]
  textos.forEach(([etiqueta, valor], indice) => {
    const fila = etiqueta === 'Fuente' ? 9 : indice + 2
    hoja.texto(0, fila, etiqueta)
    hoja.texto(1, fila, valor)
  })
  const importes: Array<[string, number]> = [
    ['Saldo inicial', input.resumen.saldoInicialCentavos],
    ['Saldo final', input.resumen.saldoFinalCentavos],
    ['Total débitos', input.resumen.totalDebitosCentavos],
    ['Total créditos', input.resumen.totalCreditosCentavos],
  ]
  importes.forEach(([etiqueta, centavos], indice) => {
    hoja.texto(0, indice + 5, etiqueta)
    hoja.pesos(1, indice + 5, centavos)
  })
  hoja.texto(0, 10, 'Fecha de descarga')
  hoja.fecha(1, 10, input.descargadoEl)
  hoja.texto(0, 12, 'Montos en pesos.')

  const encabezado = 14
  const columnas = ['Fecha', 'Concepto del banco', 'Categoría', 'Débito', 'Crédito', 'Saldo']
  columnas.forEach((titulo, columna) => hoja.texto(columna, encabezado, titulo))

  input.filas.forEach((fila, indice) => {
    const r = encabezado + 1 + indice
    hoja.fecha(0, r, fila.fecha)
    hoja.texto(1, r, fila.concepto)
    hoja.texto(2, r, fila.categoria)
    if (fila.debitoCentavos) hoja.pesos(3, r, fila.debitoCentavos)
    if (fila.creditoCentavos) hoja.pesos(4, r, fila.creditoCentavos)
    hoja.pesos(5, r, fila.saldoCentavos)
  })

  let debitos = 0
  let creditos = 0
  for (const fila of input.filas) {
    debitos += fila.debitoCentavos
    creditos += fila.creditoCentavos
  }
  const totales = encabezado + 1 + input.filas.length
  const saldoTotales =
    input.filas.length > 0 ? input.filas[input.filas.length - 1].saldoCentavos : input.resumen.saldoInicialCentavos
  hoja.texto(0, totales, 'Totales')
  hoja.pesos(3, totales, debitos)
  hoja.pesos(4, totales, creditos)
  hoja.pesos(5, totales, saldoTotales)
}

function armarControl(input: ExtractoExcelInput, hoja: Hoja): void {
  hoja.texto(0, 0, 'Control del extracto')
  hoja.texto(0, 1, `Período: ${fechaDma(input.desde)} al ${fechaDma(input.hasta)}`)
  let fila = 3

  const secciones: Array<{ titulo: string; items: readonly ItemControl[] }> = []
  if (input.control.faltanEnBacarnet.length > 0) {
    secciones.push({
      titulo: 'Estos movimientos están en el extracto del banco y no en BacarNet:',
      items: input.control.faltanEnBacarnet,
    })
  }
  if (input.control.sobranEnBacarnet.length > 0) {
    secciones.push({
      titulo: 'Estos movimientos están en BacarNet y no en el extracto del banco:',
      items: input.control.sobranEnBacarnet,
    })
  }

  for (const seccion of secciones) {
    hoja.texto(0, fila, seccion.titulo)
    fila += 1
    hoja.texto(0, fila, 'Fecha')
    hoja.texto(1, fila, 'Concepto')
    hoja.texto(2, fila, 'Salió')
    hoja.texto(3, fila, 'Entró')
    fila += 1
    for (const item of seccion.items) {
      filaMovimiento(hoja, fila, item)
      fila += 1
    }
    fila += 1
  }

  const dias = input.control.porDia.filter((dia) => !dia.coincide)
  if (dias.length > 0) {
    hoja.texto(0, fila, 'Estos días no cierran: lo que sumó el banco no es lo mismo que lo que tiene BacarNet.')
    fila += 1
    ;['Fecha', 'Salió en el banco', 'Salió en BacarNet', 'Entró en el banco', 'Entró en BacarNet'].forEach(
      (titulo, columna) => hoja.texto(columna, fila, titulo),
    )
    fila += 1
    for (const dia of dias) {
      hoja.fecha(0, fila, dia.fecha)
      hoja.pesos(1, fila, dia.debitosExtractoCentavos)
      hoja.pesos(2, fila, dia.debitosBacarnetCentavos)
      hoja.pesos(3, fila, dia.creditosExtractoCentavos)
      hoja.pesos(4, fila, dia.creditosBacarnetCentavos)
      fila += 1
    }
  }
}

export function generarExcelExtracto(input: ExtractoExcelInput): Buffer {
  const wb = XLSX.utils.book_new()
  const extracto = new Hoja()
  armarExtracto(input, extracto)
  extracto.alLibro(wb, 'Extracto', [
    { wch: 22 },
    { wch: 52 },
    { wch: 24 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
  ], [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }])

  if (hayDiferencias(input.control)) {
    const control = new Hoja()
    armarControl(input, control)
    control.alLibro(wb, 'Control', [{ wch: 22 }, { wch: 52 }, { wch: 22 }, { wch: 22 }, { wch: 22 }])
  }

  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}
