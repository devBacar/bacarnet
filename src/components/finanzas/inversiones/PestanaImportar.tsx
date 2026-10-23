import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import {
  confirmarImportacion,
  vistaPreviaImportacion,
  type ImportarFila,
  type ImportarVistaPrevia,
} from '../../../services/finanzasInversionesApi'
import { FinanzasFormField, finanzasInputClass } from '../FinanzasFormField'
import { formatMoneyCentavos } from '../formatMoney'

type Vista = ImportarVistaPrevia & { hojas: string[]; hoja: string }

function mesAMmAaaa(mes: string | null): string {
  if (!mes) return '—'
  const [y, m] = mes.split('-')
  if (!y || !m) return mes
  return `${m}/${y}`
}

function historialTexto(fila: ImportarFila): string {
  if (!fila.desdeMes && fila.mesesEncontrados === 0 && fila.pagosEncontrados === 0) return '—'
  return `desde ${mesAMmAaaa(fila.desdeMes)} · ${fila.mesesEncontrados} meses · ${fila.pagosEncontrados} pagos`
}

export function PestanaImportar() {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [vista, setVista] = useState<Vista | null>(null)
  const [incluir, setIncluir] = useState<Record<number, boolean>>({})
  const [hojaElegida, setHojaElegida] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const resetPaso1 = () => {
    setVista(null)
    setIncluir({})
    setHojaElegida(null)
    setArchivo(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const pedirVistaPrevia = async (file: File, hoja?: string | null) => {
    setError(null)
    setMensaje(null)
    setCargando(true)
    try {
      const prev = await vistaPreviaImportacion(file, hoja)
      setVista(prev)
      setHojaElegida(prev.hoja)
      const map: Record<number, boolean> = {}
      for (const f of prev.filas) {
        map[f.fila] = f.incluir && f.ok && !f.yaImportada
      }
      setIncluir(map)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude leer la planilla')
      setVista(null)
    } finally {
      setCargando(false)
    }
  }

  const onArchivo = (file: File | null) => {
    setArchivo(file)
    setVista(null)
    setIncluir({})
    setHojaElegida(null)
    setMensaje(null)
    setError(null)
    if (file) void pedirVistaPrevia(file)
  }

  const onCambioHoja = (hoja: string) => {
    setHojaElegida(hoja)
    if (archivo) void pedirVistaPrevia(archivo, hoja)
  }

  const marcadas = vista?.filas.filter((f) => incluir[f.fila]) ?? []
  const nMarcadas = marcadas.length

  const importar = async () => {
    if (!vista || nMarcadas === 0) return
    if (!window.confirm(`Se van a cargar ${nMarcadas} inversiones para aprobar. ¿Seguimos?`)) return
    setError(null)
    setMensaje(null)
    setImportando(true)
    try {
      const res = await confirmarImportacion(
        vista.token,
        marcadas.map((f) => f.fila),
      )
      setMensaje(res.mensaje)
      void queryClient.invalidateQueries({ queryKey: ['finanzas', 'inversiones'] })
      resetPaso1()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude importar la planilla')
    } finally {
      setImportando(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-body-muted text-sm">
        Se leen los grupos INVERSORES DOLARES e INVERSORES PESOS. Todo queda Para aprobar: el Líder
        revisa cada inversión antes de que impacte en la Agenda. Importar dos veces la misma planilla
        no duplica nada.
      </p>
      <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-neutral-200">
        Cómo se interpreta: «Cobra X %» = cada mes se le paga el X % de lo que se le debe. «Capitaliza
        X %» = ese X % no se paga y se suma a la deuda. «k de N» = cuotas fijas. Si algo no es así,
        avisanos.
      </p>

      {mensaje ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
          {mensaje}
        </p>
      ) : null}
      {error ? <p className="text-danger text-sm">{error}</p> : null}

      {!vista ? (
        <div className="max-w-md space-y-3">
          <FinanzasFormField label="Archivo de la planilla (.xlsx)" htmlFor="imp-archivo">
            <input
              ref={inputRef}
              id="imp-archivo"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={cargando}
              onChange={(e) => onArchivo(e.target.files?.[0] ?? null)}
              className={finanzasInputClass}
            />
          </FinanzasFormField>
          {cargando ? (
            <div className="flex items-center gap-2 text-sm text-body-muted">
              <div className="spinner-brand h-5 w-5 animate-spin rounded-full border-2" />
              Leyendo la planilla…
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full max-w-sm">
              <FinanzasFormField label="Hoja" htmlFor="imp-hoja">
                <select
                  id="imp-hoja"
                  value={hojaElegida ?? vista.hoja}
                  disabled={cargando || importando}
                  onChange={(e) => onCambioHoja(e.target.value)}
                  className={finanzasInputClass}
                >
                  {vista.hojas.length === 0 ? (
                    <option value="" disabled>
                      No hay hojas de compromisos en el archivo
                    </option>
                  ) : (
                    vista.hojas.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))
                  )}
                </select>
              </FinanzasFormField>
            </div>
            <button
              type="button"
              onClick={resetPaso1}
              disabled={cargando || importando}
              className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Elegir otro archivo
            </button>
          </div>

          {cargando ? (
            <div className="flex min-h-[20vh] items-center justify-center">
              <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-neutral-200 px-3 py-2 text-sm dark:border-zinc-800">
                <p>
                  Resumen: {vista.resumen.total} filas · {vista.resumen.ok} ok ·{' '}
                  {vista.resumen.conErrores} con errores · {vista.resumen.inversoresNuevos} inversores
                  nuevos
                </p>
                {vista.avisos.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-amber-800 dark:text-amber-200">
                    {vista.avisos.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-zinc-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-50 dark:bg-zinc-950/80">
                    <tr>
                      <th className="px-3 py-3 text-left font-medium">Incluir</th>
                      <th className="px-3 py-3 text-left font-medium">Inversor</th>
                      <th className="px-3 py-3 text-left font-medium">Moneda</th>
                      <th className="px-3 py-3 text-left font-medium">Deuda</th>
                      <th className="px-3 py-3 text-left font-medium">Cómo se va a cargar</th>
                      <th className="px-3 py-3 text-left font-medium">Historial</th>
                      <th className="px-3 py-3 text-left font-medium">Avisos / errores</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
                    {vista.filas.map((fila) => {
                      const deshabilitada = !fila.ok || fila.yaImportada
                      return (
                        <tr
                          key={fila.fila}
                          className="bg-white dark:bg-zinc-900"
                        >
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={Boolean(incluir[fila.fila])}
                              disabled={deshabilitada || importando}
                              onChange={(e) =>
                                setIncluir((prev) => ({ ...prev, [fila.fila]: e.target.checked }))
                              }
                              aria-label={`Incluir fila ${fila.fila}`}
                            />
                          </td>
                          <td className="px-3 py-3">
                            <span className="font-medium">{fila.inversorNombre}</span>
                            {fila.inversorExistenteId == null ? (
                              <span className="ml-2 inline-block rounded border border-sky-300 bg-sky-50 px-1.5 py-0.5 text-xs font-medium text-sky-950 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100">
                                nuevo
                              </span>
                            ) : null}
                            {fila.yaImportada ? (
                              <span className="ml-2 inline-block rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-xs font-medium dark:border-zinc-600 dark:bg-zinc-800">
                                Ya importada
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-3">
                            {fila.moneda === 'USD' ? 'Dólares' : fila.moneda === 'ARS' ? 'Pesos' : '—'}
                          </td>
                          <td className="px-3 py-3 tabular-nums">
                            {fila.capitalCentavos != null && fila.moneda
                              ? formatMoneyCentavos(fila.capitalCentavos, fila.moneda)
                              : '—'}
                          </td>
                          <td className="px-3 py-3 text-xs">{fila.interpretacion || '—'}</td>
                          <td className="px-3 py-3 text-xs">{historialTexto(fila)}</td>
                          <td className="px-3 py-3 text-xs">
                            {fila.errores.map((e) => (
                              <p key={e} className="text-danger">
                                {e}
                              </p>
                            ))}
                            {fila.avisos.map((a) => (
                              <p key={a} className="text-amber-700 dark:text-amber-300">
                                {a}
                              </p>
                            ))}
                            {fila.errores.length === 0 && fila.avisos.length === 0 ? (
                              <span className="text-body-muted">—</span>
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {vista.filas.length === 0 ? (
                  <p className="text-body-muted px-4 py-8 text-center text-sm">
                    No encontré filas de inversores en esa hoja.
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => void importar()}
                disabled={importando || nMarcadas === 0}
                className="rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {importando
                  ? 'Importando…'
                  : nMarcadas === 1
                    ? 'Importar 1 inversión'
                    : `Importar ${nMarcadas} inversiones`}
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
