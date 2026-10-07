/**
 * Descarga una tabla como CSV para abrir en Google Sheets o Excel.
 * Separador ";" y decimales con coma (configuración argentina), con BOM para que respete los acentos.
 */
export type Celda = string | number

function celda(v: Celda): string {
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 100) / 100).replace('.', ',') : ''
  const s = v.replace(/\r?\n/g, ' ')
  return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function descargarCsv(nombreArchivo: string, encabezados: string[], filas: Celda[][]): void {
  const texto = [encabezados, ...filas].map((f) => f.map(celda).join(';')).join('\r\n')
  const blob = new Blob(['﻿', texto], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo.endsWith('.csv') ? nombreArchivo : `${nombreArchivo}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Nombre de archivo sin acentos ni espacios: "horas-extra-proteccion-de-valores-sep-2026". */
export function nombreArchivo(...partes: string[]): string {
  return partes
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
