import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { fetchBeneficiariosPago, guardarBeneficiarioPago } from '../../../services/finanzasChequesApi'
import { FinanzasFormField, finanzasInputClass } from '../FinanzasFormField'
import { formatMoneyCentavos } from '../formatMoney'

/**
 * Quiénes son "otros pagos" (pestaña Otros pagos): los cheques de estos beneficiarios no son préstamos ni
 * renovaciones, así que solo se ven acá. Finanzas puede sumar o quitar beneficiarios.
 */
export function BeneficiariosPago({ puedeEditar }: { puedeEditar: boolean }) {
  const queryClient = useQueryClient()
  const [abierto, setAbierto] = useState(false)
  const [elegido, setElegido] = useState('')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['finanzas', 'cheques-ocasionales', 'beneficiarios-pago'],
    queryFn: fetchBeneficiariosPago,
    enabled: abierto,
  })

  const guardar = useMutation({
    mutationFn: guardarBeneficiarioPago,
    onSuccess: (_r, v) => {
      toast.success(v.esPago ? `${v.nombre}: ahora sus cheques van a Otros pagos` : `${v.nombre}: ya no es un pago`)
      setElegido('')
      // Cambia qué se ve en todas las pestañas (Todos, A revisar, renovaciones, resumen).
      void queryClient.invalidateQueries({ queryKey: ['finanzas', 'cheques-ocasionales'] })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo guardar el cambio'),
  })

  const disponible = data?.disponibles.find((d) => d.beneficiarioNormalizado === elegido)

  return (
    <div className="mb-4 rounded-xl border border-neutral-200 bg-white text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
      >
        <span>
          <span className="text-heading font-medium">¿Quiénes son pagos?</span>
          <span className="text-body-muted">
            {' '}· Los cheques de estas personas no son préstamos: se ven solo en esta pestaña.
          </span>
        </span>
        {abierto ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>

      {abierto ? (
        <div className="border-t border-neutral-200 px-4 py-3 dark:border-zinc-700">
          {isLoading ? <p className="text-body-muted">Cargando…</p> : null}
          {isError ? (
            <p className="text-danger">{error instanceof Error ? error.message : 'No se pudo cargar la lista'}</p>
          ) : null}
          {data ? (
            <>
              <div className="flex flex-wrap gap-2">
                {data.deFabrica.map((f) => (
                  <span
                    key={f.nombre}
                    className="rounded-full border border-neutral-300 bg-neutral-100 px-3 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-800"
                    title="Viene fijo: no se puede quitar desde acá"
                  >
                    {f.nombre} <span className="text-body-muted">({f.detalle})</span>
                  </span>
                ))}
                {data.marcados.map((m) => (
                  <span
                    key={m.beneficiarioNormalizado}
                    className="inline-flex items-center gap-1 rounded-full border border-brand-primary/40 bg-brand-primary-light px-3 py-1 text-xs text-brand-primary"
                  >
                    {m.nombre}
                    {puedeEditar ? (
                      <button
                        type="button"
                        className="rounded-full p-0.5 hover:bg-white/60 disabled:opacity-40 dark:hover:bg-zinc-800"
                        title="Quitar: sus cheques vuelven a verse en Todos"
                        aria-label={`Quitar a ${m.nombre} de los pagos`}
                        disabled={guardar.isPending}
                        onClick={() => guardar.mutate({ beneficiarioNormalizado: m.beneficiarioNormalizado, nombre: m.nombre, esPago: false })}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>

              {puedeEditar ? (
                <form
                  className="mt-3 flex flex-wrap items-end gap-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!disponible) return
                    guardar.mutate({ beneficiarioNormalizado: disponible.beneficiarioNormalizado, nombre: disponible.nombre, esPago: true })
                  }}
                >
                  <div className="w-full sm:w-96">
                    <FinanzasFormField label="Sumar a alguien como pago" htmlFor="benef-pago">
                      <select
                        id="benef-pago"
                        className={finanzasInputClass}
                        value={elegido}
                        onChange={(e) => setElegido(e.target.value)}
                      >
                        <option value="">Elegí un beneficiario…</option>
                        {data.disponibles.map((d) => (
                          <option key={d.beneficiarioNormalizado} value={d.beneficiarioNormalizado}>
                            {d.nombre} — {d.cheques} {d.cheques === 1 ? 'cheque' : 'cheques'}, {formatMoneyCentavos(d.montoCentavos, 'ARS')}
                          </option>
                        ))}
                      </select>
                    </FinanzasFormField>
                  </div>
                  <button
                    type="submit"
                    className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                    disabled={!disponible || guardar.isPending}
                  >
                    {guardar.isPending ? 'Guardando…' : 'Marcar como pago'}
                  </button>
                </form>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
