import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useAuth } from '../../../context'
import { fetchInversores, type InversorResumen } from '../../../services/finanzasInversionesApi'
import { FinanzasFormField, finanzasInputClass } from '../FinanzasFormField'
import { formatMoneyCentavos } from '../formatMoney'
import { FichaInversorModal } from './FichaInversorModal'

function textoEstadoInversor(estado: InversorResumen['estado']): string {
  return estado === 'activo' ? 'Activo' : 'De baja'
}

function CapitalVigente({ capital }: { capital: InversorResumen['capitalVigente'] }) {
  const partes: string[] = []
  if (capital.ARS > 0) partes.push(formatMoneyCentavos(capital.ARS, 'ARS'))
  if (capital.USD > 0) partes.push(formatMoneyCentavos(capital.USD, 'USD'))
  if (partes.length === 0) return <span className="text-body-muted">—</span>
  return (
    <div className="space-y-0.5 tabular-nums">
      {partes.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  )
}

export function PestanaInversores() {
  const { user } = useAuth()
  const [busqueda, setBusqueda] = useState('')
  const [modal, setModal] = useState<{ modo: 'nuevo' } | { modo: 'ficha'; id: string } | null>(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['finanzas', 'inversiones', 'inversores'],
    queryFn: fetchInversores,
    enabled: Boolean(user),
  })

  const filtrados = useMemo(() => {
    const lista = data ?? []
    const q = busqueda.trim().toLocaleLowerCase('es')
    if (!q) return lista
    return lista.filter((inv) => inv.nombre.toLocaleLowerCase('es').includes(q))
  }, [data, busqueda])

  const cerrarModal = () => setModal(null)
  const alGuardar = () => {
    void refetch()
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center">
        <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
      </div>
    )
  }

  if (isError) {
    return (
      <p className="text-danger text-sm">
        {error instanceof Error ? error.message : 'No pude traer los inversores'}
      </p>
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="w-full max-w-sm">
          <FinanzasFormField label="Buscar por nombre" htmlFor="inv-buscar">
            <input
              id="inv-buscar"
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Ej.: Gómez"
              className={finanzasInputClass}
            />
          </FinanzasFormField>
        </div>
        <button
          type="button"
          onClick={() => setModal({ modo: 'nuevo' })}
          className="rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
        >
          Nuevo inversor
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-zinc-950/80">
            <tr>
              <th className="px-3 py-3 text-left font-medium">Nombre</th>
              <th className="px-3 py-3 text-left font-medium">Documento</th>
              <th className="px-3 py-3 text-left font-medium">Estado</th>
              <th className="px-3 py-3 text-left font-medium">Inversiones vigentes</th>
              <th className="px-3 py-3 text-left font-medium">Capital vigente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-zinc-800">
            {filtrados.map((row) => (
              <tr
                key={row.id}
                role="button"
                tabIndex={0}
                className="cursor-pointer bg-white hover:bg-neutral-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/80"
                onClick={() => setModal({ modo: 'ficha', id: row.id })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setModal({ modo: 'ficha', id: row.id })
                  }
                }}
              >
                <td className="px-3 py-3 font-medium">{row.nombre}</td>
                <td className="px-3 py-3 tabular-nums">{row.documentoMascara ?? '—'}</td>
                <td className="px-3 py-3">{textoEstadoInversor(row.estado)}</td>
                <td className="px-3 py-3 tabular-nums">{row.inversionesVigentes}</td>
                <td className="px-3 py-3">
                  <CapitalVigente capital={row.capitalVigente} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length === 0 ? (
          <p className="text-body-muted px-4 py-8 text-center text-sm">
            {busqueda.trim()
              ? 'Ningún inversor coincide con la búsqueda.'
              : 'Todavía no hay inversores. Creá uno o importá la planilla.'}
          </p>
        ) : null}
      </div>

      {modal?.modo === 'nuevo' ? (
        <FichaInversorModal modo="nuevo" onClose={cerrarModal} onGuardado={alGuardar} />
      ) : null}
      {modal?.modo === 'ficha' ? (
        <FichaInversorModal
          modo="editar"
          inversorId={modal.id}
          onClose={cerrarModal}
          onGuardado={alGuardar}
        />
      ) : null}
    </>
  )
}
