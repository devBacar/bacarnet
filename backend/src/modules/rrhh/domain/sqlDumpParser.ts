import type { Readable } from 'node:stream'
import { createInterface } from 'node:readline'

/** Valor de una columna tal como viene en el dump: texto o NULL. Los números llegan como texto. */
export type ValorDump = string | null

/** Fila de una tabla del dump, indexada por nombre de columna. */
export type FilaDump = Record<string, ValorDump>

export interface OpcionesLecturaDump {
  /** Devuelve true para las tablas que interesan. El resto se saltea sin procesar sus valores. */
  quiereTabla: (tabla: string) => boolean
  /** Se llama una vez por fila de las tablas pedidas. */
  onFila: (tabla: string, fila: FilaDump) => void
}

export interface ResultadoLecturaDump {
  lineas: number
  filasPorTabla: Record<string, number>
  /** Encabezado del dump (por ejemplo, la versión de MySQL), para el log de ingesta. */
  encabezado: string
}

const RE_CREATE = /^CREATE TABLE `([^`]+)` \($/
const RE_COLUMNA = /^\s+`([^`]+)`\s/
const PREFIJO_INSERT = 'INSERT INTO `'

/**
 * Lee un dump de mysqldump (formato de Salario: MySQL 5.7, extended-insert) en streaming.
 * Cada sentencia ocupa una línea y los valores nunca traen saltos de línea sin escapar,
 * así que se procesa línea por línea sin cargar el archivo en memoria.
 * Las columnas se toman del CREATE TABLE, por eso tolera cambios de orden o columnas nuevas.
 */
export async function leerDumpMysql(
  entrada: Readable,
  opciones: OpcionesLecturaDump,
): Promise<ResultadoLecturaDump> {
  const columnasPorTabla = new Map<string, string[]>()
  const filasPorTabla: Record<string, number> = {}
  let tablaEnCreacion: string | null = null
  let columnas: string[] = []
  let lineas = 0
  let encabezado = ''

  const lector = createInterface({ input: entrada, crlfDelay: Infinity })
  for await (const linea of lector) {
    lineas += 1
    if (lineas <= 3 && linea.startsWith('-- MySQL dump')) encabezado = linea.slice(3).trim()

    if (tablaEnCreacion !== null) {
      if (linea.startsWith(')')) {
        columnasPorTabla.set(tablaEnCreacion, columnas)
        tablaEnCreacion = null
        continue
      }
      const col = RE_COLUMNA.exec(linea)
      if (col) columnas.push(col[1])
      continue
    }

    if (linea.startsWith('CREATE TABLE')) {
      const m = RE_CREATE.exec(linea)
      if (m && opciones.quiereTabla(m[1])) {
        tablaEnCreacion = m[1]
        columnas = []
      }
      continue
    }

    if (!linea.startsWith(PREFIJO_INSERT)) continue
    const finNombre = linea.indexOf('`', PREFIJO_INSERT.length)
    if (finNombre < 0) continue
    const tabla = linea.slice(PREFIJO_INSERT.length, finNombre)
    if (!opciones.quiereTabla(tabla)) continue
    const cols = columnasPorTabla.get(tabla)
    if (!cols) {
      throw new Error(`El dump trae datos de "${tabla}" sin su CREATE TABLE`)
    }
    const inicio = linea.indexOf(' VALUES ', finNombre)
    if (inicio < 0) continue

    let n = 0
    parsearTuplas(linea, inicio + 8, (valores) => {
      const fila: FilaDump = {}
      for (let i = 0; i < cols.length; i += 1) fila[cols[i]] = valores[i] ?? null
      opciones.onFila(tabla, fila)
      n += 1
    })
    filasPorTabla[tabla] = (filasPorTabla[tabla] ?? 0) + n
  }

  return { lineas, filasPorTabla, encabezado }
}

const ESCAPES: Record<string, string> = {
  '0': '\0',
  "'": "'",
  '"': '"',
  b: '\b',
  n: '\n',
  r: '\r',
  t: '\t',
  Z: '\x1a',
  '\\': '\\',
}

/**
 * Recorre `(v1,v2,...),(v1,v2,...);` desde `desde` y llama a `onTupla` por cada tupla.
 * Soporta NULL, números y textos entre comillas simples con los escapes de MySQL.
 */
export function parsearTuplas(texto: string, desde: number, onTupla: (valores: ValorDump[]) => void): void {
  let i = desde
  const largo = texto.length
  while (i < largo) {
    const c = texto[i]
    if (c === ';') return
    if (c !== '(') {
      i += 1
      continue
    }
    i += 1
    const valores: ValorDump[] = []
    for (;;) {
      if (texto[i] === "'") {
        i += 1
        let valor = ''
        let tramo = i
        for (;;) {
          const ch = texto[i]
          if (ch === undefined) throw new Error('Texto sin cerrar en el dump')
          if (ch === '\\') {
            valor += texto.slice(tramo, i)
            const sig = texto[i + 1]
            valor += ESCAPES[sig] ?? sig
            i += 2
            tramo = i
            continue
          }
          if (ch === "'") {
            if (texto[i + 1] === "'") {
              valor += texto.slice(tramo, i) + "'"
              i += 2
              tramo = i
              continue
            }
            valor += texto.slice(tramo, i)
            i += 1
            break
          }
          i += 1
        }
        valores.push(valor)
      } else {
        let fin = i
        while (fin < largo && texto[fin] !== ',' && texto[fin] !== ')') fin += 1
        const crudo = texto.slice(i, fin).trim()
        valores.push(crudo === 'NULL' ? null : crudo)
        i = fin
      }
      const sep = texto[i]
      if (sep === ',') {
        i += 1
        continue
      }
      if (sep === ')') {
        i += 1
        break
      }
      throw new Error(`Formato inesperado en el dump cerca de la posición ${i}`)
    }
    onTupla(valores)
  }
}
