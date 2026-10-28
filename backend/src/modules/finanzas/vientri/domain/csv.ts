/**
 * Lector de los CSV que exporta SIS5 desde Vientri (contrato de datos v0.2).
 * Separador `;`, UTF-8 (con o sin BOM), con encabezado, comillas dobles RFC 4180.
 */

export type FilaCsv = Record<string, string>

export interface TablaCsv {
  columnas: string[]
  filas: FilaCsv[]
}

export class CsvError extends Error {}

export function leerCsv(texto: string, separador = ';'): TablaCsv {
  const contenido = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto
  const registros: string[][] = []
  let campo = ''
  let registro: string[] = []
  let entreComillas = false

  for (let i = 0; i < contenido.length; i++) {
    const c = contenido[i]
    if (entreComillas) {
      if (c === '"') {
        if (contenido[i + 1] === '"') {
          campo += '"'
          i++
        } else {
          entreComillas = false
        }
      } else {
        campo += c
      }
      continue
    }
    if (c === '"' && campo === '') {
      entreComillas = true
    } else if (c === separador) {
      registro.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && contenido[i + 1] === '\n') i++
      registro.push(campo)
      campo = ''
      if (!(registro.length === 1 && registro[0] === '')) registros.push(registro)
      registro = []
    } else {
      campo += c
    }
  }
  if (entreComillas) throw new CsvError('El archivo termina con comillas sin cerrar')
  if (campo !== '' || registro.length > 0) {
    registro.push(campo)
    registros.push(registro)
  }
  if (registros.length === 0) throw new CsvError('El archivo está vacío: falta el encabezado')

  const columnas = registros[0].map((c) => c.trim())
  const filas: FilaCsv[] = []
  for (let r = 1; r < registros.length; r++) {
    const valores = registros[r]
    if (valores.length !== columnas.length) {
      throw new CsvError(`Fila ${r + 1}: tiene ${valores.length} columnas y el encabezado ${columnas.length}`)
    }
    const fila: FilaCsv = {}
    for (let k = 0; k < columnas.length; k++) fila[columnas[k]] = valores[k]
    filas.push(fila)
  }
  return { columnas, filas }
}

export function exigirColumnas(tabla: TablaCsv, archivo: string, requeridas: readonly string[]): void {
  const faltan = requeridas.filter((c) => !tabla.columnas.includes(c))
  if (faltan.length > 0) throw new CsvError(`${archivo}: faltan columnas ${faltan.join(', ')}`)
}

export function leerCsvSinHeader(texto: string, columnas: string[], separador = ';'): TablaCsv {
  const contenido = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto
  const registros: string[][] = []
  let campo = ''
  let registro: string[] = []
  let entreComillas = false

  for (let i = 0; i < contenido.length; i++) {
    const c = contenido[i]
    if (entreComillas) {
      if (c === '"') {
        if (contenido[i + 1] === '"') {
          campo += '"'
          i++
        } else {
          entreComillas = false
        }
      } else {
        campo += c
      }
      continue
    }
    if (c === '"' && campo === '') {
      entreComillas = true
    } else if (c === separador) {
      registro.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && contenido[i + 1] === '\n') i++
      registro.push(campo)
      campo = ''
      if (!(registro.length === 1 && registro[0] === '')) registros.push(registro)
      registro = []
    } else {
      campo += c
    }
  }
  if (entreComillas) throw new CsvError('El archivo termina con comillas sin cerrar')
  if (campo !== '' || registro.length > 0) {
    registro.push(campo)
    registros.push(registro)
  }
  if (registros.length === 0) throw new CsvError('El archivo está vacío')

  const filas: FilaCsv[] = []
  for (let r = 0; r < registros.length; r++) {
    const valores = registros[r]
    if (valores.length < columnas.length) {
      throw new CsvError(`Fila ${r + 1}: tiene ${valores.length} columnas, se esperan ${columnas.length}`)
    }
    const fila: FilaCsv = {}
    for (let k = 0; k < columnas.length; k++) fila[columnas[k]] = valores[k]
    filas.push(fila)
  }
  return { columnas, filas }
}
