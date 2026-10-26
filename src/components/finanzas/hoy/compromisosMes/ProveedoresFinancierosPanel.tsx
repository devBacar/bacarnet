import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../../../context'
import { COMPROMISOS_MES_QUERY_KEY } from '../../../../services/finanzasCompromisosMesApi'
import {
  agregarProveedorFinanciero,
  fetchProveedoresFinancieros,
  PROVEEDORES_FINANCIEROS_QUERY_KEY,
  quitarProveedorFinanciero,
} from '../../../../services/finanzasAgendaApi'
import { usePermisosFinanzas } from '../../permisosFinanzas'
import { FinanzasFormField, finanzasInputClass } from '../../FinanzasFormField'

export function ProveedoresFinancierosPanel() {
  const { user } = useAuth()
  const puedeEditar = usePermisosFinanzas().agenda
  const queryClient = useQueryClient()
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)

  const lista = useQuery({
    queryKey: PROVEEDORES_FINANCIEROS_QUERY_KEY,
    queryFn: fetchProveedoresFinancieros,
    enabled: Boolean(user) && abierto,
  })

  const refrescarPlanilla = () => {
    void queryClient.invalidateQueries({ queryKey: PROVEEDORES_FINANCIEROS_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: COMPROMISOS_MES_QUERY_KEY })
  }

  const agregar = () => {
    const texto = nombre.trim()
    if (!texto) {
      toast.error('Escribí el nombre del proveedor')
      return
    }
    setGuardando(true)
    void agregarProveedorFinanciero(texto)
      .then(() => {
        toast.success('Proveedor financiero agregado')
        setNombre('')
        refrescarPlanilla()
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'No se pudo agregar')
      })
      .finally(() => setGuardando(false))
  }

  const sacar = (id: string, etiqueta: string) => {
    setGuardando(true)
    void quitarProveedorFinanciero(id)
      .then(() => {
        toast.success(`Se sacó a ${etiqueta}`)
        refrescarPlanilla()
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'No se pudo sacar')
      })
      .finally(() => setGuardando(false))
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="text-[13px] font-medium text-[var(--color-primary)] underline-offset-2 hover:underline"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
      >
        Proveedores financieros
      </button>
      {abierto ? (
        <div
          className="absolute right-0 z-40 mt-2 w-[min(100vw-2rem,22rem)] rounded-xl border border-neutral-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          role="dialog"
          aria-label="Proveedores financieros"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-[14px] font-medium text-neutral-900 dark:text-gray-100">Proveedores financieros</p>
              <p className="text-body-muted mt-0.5 text-[12px] leading-snug">
                Los que facturan solo la comisión del echeq. Sus facturas van a Gastos financieros en la planilla.
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-zinc-800"
              aria-label="Cerrar"
              onClick={() => setAbierto(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {lista.isLoading ? <p className="text-body-muted py-2 text-[13px]">Cargando…</p> : null}
          {lista.isError ? (
            <p className="py-2 text-[13px] text-red-600 dark:text-red-400">
              {lista.error instanceof Error ? lista.error.message : 'No se pudo cargar la lista'}
            </p>
          ) : null}

          {lista.data && lista.data.length === 0 ? (
            <p className="text-body-muted py-2 text-[13px]">Todavía no hay ninguno.</p>
          ) : null}

          {lista.data && lista.data.length > 0 ? (
            <ul className="mb-3 max-h-48 space-y-1 overflow-y-auto">
              {lista.data.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-neutral-100 px-2 py-1.5 dark:border-zinc-800"
                >
                  <span className="min-w-0 truncate text-[13px] text-neutral-900 dark:text-gray-100">{item.nombre}</span>
                  {puedeEditar ? (
                    <button
                      type="button"
                      className="shrink-0 text-[12px] font-medium text-red-600 hover:underline dark:text-red-400"
                      disabled={guardando}
                      onClick={() => sacar(item.id, item.nombre)}
                    >
                      Sacar
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {puedeEditar ? (
            <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3 dark:border-zinc-800">
              <FinanzasFormField label="Nombre">
                <input
                  className={finanzasInputClass}
                  value={nombre}
                  onChange={(event) => setNombre(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      agregar()
                    }
                  }}
                  placeholder="Ej. Matriz Finanzas"
                  disabled={guardando}
                />
              </FinanzasFormField>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg bg-brand-primary px-3 py-2 text-[13px] font-medium text-white disabled:opacity-60"
                disabled={guardando}
                onClick={agregar}
              >
                {guardando ? 'Guardando…' : 'Agregar'}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
