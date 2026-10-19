import { useState } from 'react'
import { fetchLimpiezaVientri, type ChequeParaLimpiar } from '../../services/finanzasVientriApi'

function csv(items: ChequeParaLimpiar[]): string {
  const celda = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const filas = [
    ['Tipo', 'Numero', 'Banco', 'Importe', 'Fecha de pago', 'Estado en Vientri', 'Librador', 'Motivo'],
    ...items.map((c) => [
      c.direccion === 'emitido' ? 'Emitido' : 'Recibido',
      c.numero,
      c.bancoNombre,
      (c.montoCentavos / 100).toFixed(2).replace('.', ','),
      c.fechaVencimiento,
      c.estadoVientri,
      c.librador,
      c.motivo,
    ]),
  ]
  return '\uFEFF' + filas.map((f) => f.map(celda).join(';')).join('\r\n')
}

/** Descarga (CSV para Excel) los cheques de más de un año que en Vientri siguen abiertos, para Administración. */
export function DescargarLimpiezaVientri() {
  const [estado, setEstado] = useState<string | null>(null)
  async function descargar() {
    setEstado('Armando el listado…')
    try {
      const { items, fechaDatos } = await fetchLimpiezaVientri()
      if (items.length === 0) {
        setEstado('No hay cheques viejos para corregir.')
        return
      }
      const url = URL.createObjectURL(new Blob([csv(items)], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `cheques_para_corregir_en_vientri_${(fechaDatos ?? '').slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setEstado(`${items.length} cheques. Pasale el archivo a Administración para que los corrija en Vientri.`)
    } catch (err) {
      setEstado(err instanceof Error ? err.message : 'No se pudo armar el listado')
    }
  }
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={descargar}
        className="rounded-lg border-2 border-neutral-400 bg-white px-4 py-2 text-base text-neutral-900 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
      >
        Descargar cheques viejos para corregir en Vientri
      </button>
      {estado && <p className="text-base text-neutral-700 dark:text-neutral-200">{estado}</p>}
    </div>
  )
}
