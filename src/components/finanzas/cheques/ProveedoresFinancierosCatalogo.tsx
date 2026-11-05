import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../../../context'
import {
  agregarAliasProveedor,
  crearProveedorCatalogo,
  fetchCatalogoProveedores,
  quitarAliasProveedor,
  type BeneficiarioSinAsignarItem,
  type ProveedorCatalogoItem,
} from '../../../services/finanzasChequesApi'
import { finanzasInputClass } from '../FinanzasFormField'
import { formatMoneyCentavos } from '../formatMoney'
import { usePermisosFinanzas } from '../permisosFinanzas'

const QUERY_KEY = ['finanzas', 'cheques-ocasionales', 'proveedores-financieros'] as const

const botonChico =
  'rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'

function textoCheques(n: number): string {
  return n === 1 ? '1 cheque' : `${n} cheques`
}

export function ProveedoresFinancierosCatalogo() {
  const { user } = useAuth()
  const puedeEditar = usePermisosFinanzas().cheques
  const queryClient = useQueryClient()
  const [nuevo, setNuevo] = useState('')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchCatalogoProveedores,
    enabled: Boolean(user),
  })

  const refrescar = (chequesActualizados: number, mensaje: string) => {
    toast.success(chequesActualizados > 0 ? `${mensaje} (${textoCheques(chequesActualizados)} actualizados)` : mensaje)
    void queryClient.invalidateQueries({ queryKey: ['finanzas', 'cheques-ocasionales'] })
  }
  const fallo = (err: unknown) => toast.error(err instanceof Error ? err.message : 'No se pudo guardar')

  const crear = useMutation({
    mutationFn: (nombre: string) => crearProveedorCatalogo(nombre),
    onSuccess: (r) => {
      setNuevo('')
      refrescar(r.chequesActualizados, 'Proveedor agregado')
    },
    onError: fallo,
  })
  const agregarAlias = useMutation({
    mutationFn: (v: { id: string; alias: string }) => agregarAliasProveedor(v.id, v.alias),
    onSuccess: (r) => refrescar(r.chequesActualizados, 'Nombre agregado al proveedor'),
    onError: fallo,
  })
  const quitarAlias = useMutation({
    mutationFn: (v: { id: string; alias: string }) => quitarAliasProveedor(v.id, v.alias),
    onSuccess: (r) => refrescar(r.chequesActualizados, 'Nombre sacado'),
    onError: fallo,
  })
  const ocupado = crear.isPending || agregarAlias.isPending || quitarAlias.isPending

  if (isLoading) return <p className="text-body-muted text-sm">Cargando proveedores financieros…</p>
  if (isError) {
    return (
      <p className="text-danger text-sm">
        {error instanceof Error ? error.message : 'No se pudo cargar el catálogo de proveedores'}
      </p>
    )
  }

  const proveedores = data?.proveedores ?? []
  const sinAsignar = data?.sinAsignar ?? []

  return (
    <div className="space-y-6">
      <section className="surface-card rounded-2xl border border-neutral-200 p-4 dark:border-zinc-800">
        <h3 className="text-heading text-sm font-semibold">Sin asignar ({sinAsignar.length})</h3>
        <p className="text-body-muted mt-0.5 text-xs">
          Nombres de cheques que no coinciden con ningún proveedor. Elegí a cuál pertenecen, o agregalos como proveedor nuevo.
        </p>
        {sinAsignar.length === 0 ? (
          <p className="text-body-muted mt-3 text-sm">No hay nombres sin asignar.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sinAsignar.map((b) => (
              <FilaSinAsignar
                key={b.nombreNormalizado}
                item={b}
                proveedores={proveedores}
                puedeEditar={puedeEditar}
                ocupado={ocupado}
                onAlias={(id) => agregarAlias.mutate({ id, alias: b.nombre })}
                onNuevo={() => crear.mutate(b.nombre)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="surface-card rounded-2xl border border-neutral-200 p-4 dark:border-zinc-800">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-heading text-sm font-semibold">Catálogo ({proveedores.length})</h3>
            <p className="text-body-muted mt-0.5 text-xs">
              Cada proveedor reúne todas las formas en que aparece escrito en los cheques.
            </p>
          </div>
          {puedeEditar ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (nuevo.trim()) crear.mutate(nuevo.trim())
              }}
            >
              <input
                className={`${finanzasInputClass} w-56`}
                placeholder="Nuevo proveedor"
                value={nuevo}
                maxLength={120}
                onChange={(e) => setNuevo(e.target.value)}
              />
              <button type="submit" disabled={ocupado || !nuevo.trim()} className={botonChico}>
                Agregar
              </button>
            </form>
          ) : null}
        </header>
        {proveedores.length === 0 ? (
          <p className="text-body-muted mt-3 text-sm">Todavía no hay proveedores cargados.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-100 dark:divide-zinc-800">
            {proveedores.map((p) => (
              <FilaProveedor
                key={p.id}
                proveedor={p}
                puedeEditar={puedeEditar}
                ocupado={ocupado}
                onAgregarAlias={(alias) => agregarAlias.mutate({ id: p.id, alias })}
                onQuitarAlias={(alias) => quitarAlias.mutate({ id: p.id, alias })}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function FilaSinAsignar({
  item,
  proveedores,
  puedeEditar,
  ocupado,
  onAlias,
  onNuevo,
}: {
  item: BeneficiarioSinAsignarItem
  proveedores: ProveedorCatalogoItem[]
  puedeEditar: boolean
  ocupado: boolean
  onAlias: (proveedorId: string) => void
  onNuevo: () => void
}) {
  const otras = item.variantes.filter((v) => v !== item.nombre)
  return (
    <li className="rounded-lg border border-neutral-100 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-heading text-sm font-medium">{item.nombre}</span>
        <span className="text-body-muted text-xs">
          {textoCheques(item.cantidadCheques)} · {formatMoneyCentavos(item.totalCentavos, 'ARS')}
        </span>
      </div>
      {otras.length > 0 ? (
        <p className="text-body-muted mt-0.5 text-xs">También escrito como: {otras.join(', ')}</p>
      ) : null}
      {puedeEditar ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {item.sugerencias.map((s) => (
            <button
              key={s.proveedorId}
              type="button"
              disabled={ocupado}
              className={botonChico}
              onClick={() => onAlias(s.proveedorId)}
            >
              Es de {s.nombre}
            </button>
          ))}
          <select
            className={`${finanzasInputClass} w-48`}
            value=""
            disabled={ocupado}
            aria-label={`Asignar ${item.nombre} a un proveedor`}
            onChange={(e) => {
              if (e.target.value) onAlias(e.target.value)
            }}
          >
            <option value="">Asignar a otro…</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <button type="button" disabled={ocupado} className={botonChico} onClick={onNuevo}>
            Agregar como proveedor nuevo
          </button>
        </div>
      ) : null}
    </li>
  )
}

function FilaProveedor({
  proveedor,
  puedeEditar,
  ocupado,
  onAgregarAlias,
  onQuitarAlias,
}: {
  proveedor: ProveedorCatalogoItem
  puedeEditar: boolean
  ocupado: boolean
  onAgregarAlias: (alias: string) => void
  onQuitarAlias: (alias: string) => void
}) {
  const [alias, setAlias] = useState('')
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-heading text-sm font-semibold">{proveedor.nombre}</span>
        <span className="text-body-muted text-xs">
          {textoCheques(proveedor.cantidadCheques)} · {formatMoneyCentavos(proveedor.totalCentavos, 'ARS')}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {proveedor.alias.map((a) => (
          <span
            key={a}
            className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs text-neutral-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
          >
            {a}
            {puedeEditar ? (
              <button
                type="button"
                disabled={ocupado}
                aria-label={`Sacar ${a}`}
                className="text-neutral-400 hover:text-red-600 disabled:opacity-50"
                onClick={() => onQuitarAlias(a)}
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </span>
        ))}
        {puedeEditar ? (
          <form
            className="inline-flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              if (!alias.trim()) return
              onAgregarAlias(alias.trim())
              setAlias('')
            }}
          >
            <input
              className={`${finanzasInputClass} w-44 !py-1 text-xs`}
              placeholder="Otro nombre (ej. OP MANA)"
              value={alias}
              maxLength={120}
              aria-label={`Otro nombre para ${proveedor.nombre}`}
              onChange={(e) => setAlias(e.target.value)}
            />
            <button type="submit" disabled={ocupado || !alias.trim()} className={botonChico} aria-label="Agregar nombre">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </form>
        ) : null}
      </div>
    </li>
  )
}
