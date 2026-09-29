import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  actualizarDestinatario,
  crearDestinatario,
  eliminarDestinatario,
  fetchDestinatarios,
  type DestinatarioItem,
  type DestinatarioTipo,
} from '../../services/finanzasTransferenciasApi'
import { FinanzasFormField, finanzasInputClass } from './FinanzasFormField'
import { soloDigitos, validarCbu, validarCuitOpcional } from './cbuCuit'

const TIPO_LABEL: Record<DestinatarioTipo, string> = {
  terceros: 'Terceros',
  proveedores: 'Proveedores',
}

function useDebounced(value: string, ms = 250): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return debounced
}

export function AgendaDestinatariosPanel() {
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const qDebounced = useDebounced(q)
  const [editando, setEditando] = useState<DestinatarioItem | null>(null)
  const [borrar, setBorrar] = useState<DestinatarioItem | null>(null)
  const [altaAbierta, setAltaAbierta] = useState(false)

  const { data: rows = [], isLoading, isError, error } = useQuery({
    queryKey: ['finanzas', 'destinatarios', 'agenda', qDebounced],
    queryFn: () => fetchDestinatarios({ q: qDebounced }),
  })

  const haySugeridos = rows.some((row) => row.sugerido)

  async function refrescar() {
    await queryClient.invalidateQueries({ queryKey: ['finanzas', 'destinatarios'] })
  }

  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="block min-w-0 flex-1 text-sm">
          <span className="text-body-muted mb-1 block">Buscar</span>
          <input
            className={finanzasInputClass}
            value={q}
            placeholder="Nombre, CUIT, CBU o alias"
            onChange={(event) => setQ(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-white"
          onClick={() => setAltaAbierta(true)}
        >
          Agregar destinatario
        </button>
      </div>

      {haySugeridos ? (
        <p className="mb-3 rounded-xl border border-neutral-200 px-3 py-2 text-sm dark:border-zinc-700">
          La agenda está vacía. Estas sugerencias salen de transferencias ya confeccionadas y se guardan
          cuando vuelvas a transferirles.
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex min-h-[20vh] items-center justify-center">
          <div className="spinner-brand h-8 w-8 animate-spin rounded-full border-4" />
        </div>
      ) : isError ? (
        <p className="text-sm text-red-700 dark:text-red-300">
          {error instanceof Error ? error.message : 'No se pudo cargar la agenda'}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-body-muted px-2 py-8 text-center text-sm">
          No hay destinatarios. Se agregan solos al confeccionar una transferencia a terceros o proveedores.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-neutral-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium break-words">
                    {row.nombre}
                    {row.alias ? <span className="text-body-muted font-normal"> · {row.alias}</span> : null}
                  </p>
                  <p className="text-body-muted break-all text-xs">{row.cbu}</p>
                  <p className="text-body-muted text-xs">
                    {TIPO_LABEL[row.tipo] ?? row.tipo}
                    {row.cuit ? ` · CUIT ${row.cuit}` : ''}
                    {row.bancoNombre ? ` · ${row.bancoNombre}` : ''}
                    {row.sugerido ? ' · Sugerido del historial' : ` · ${row.usos} usos`}
                  </p>
                </div>
                {row.sugerido ? null : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded border px-2 py-1 text-xs font-medium"
                      onClick={() => setEditando(row)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="rounded border border-red-700 px-2 py-1 text-xs font-medium text-red-800 dark:text-red-200"
                      onClick={() => setBorrar(row)}
                    >
                      Borrar
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {altaAbierta ? (
        <AltaModal
          onClose={() => setAltaAbierta(false)}
          onSaved={async () => {
            setAltaAbierta(false)
            toast.success('Destinatario agregado a la agenda')
            await refrescar()
          }}
        />
      ) : null}
      {editando ? (
        <EditarModal
          destinatario={editando}
          onClose={() => setEditando(null)}
          onSaved={async () => {
            setEditando(null)
            toast.success('Destinatario actualizado')
            await refrescar()
          }}
        />
      ) : null}
      {borrar ? (
        <BorrarModal
          destinatario={borrar}
          onClose={() => setBorrar(null)}
          onConfirm={async () => {
            await eliminarDestinatario(borrar.id)
            setBorrar(null)
            toast.success('Destinatario sacado de la agenda')
            await refrescar()
          }}
        />
      ) : null}
    </section>
  )
}

function AltaModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [nombre, setNombre] = useState('')
  const [cbu, setCbu] = useState('')
  const [cuit, setCuit] = useState('')
  const [alias, setAlias] = useState('')
  const [tipo, setTipo] = useState<DestinatarioTipo>('terceros')
  const [saving, setSaving] = useState(false)
  const cbuCheck = validarCbu(cbu)
  const cuitCheck = validarCuitOpcional(cuit)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
      <form
        className="surface-card max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-neutral-200 p-4 dark:border-zinc-700 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault()
          if (!nombre.trim()) return toast.error('El nombre es obligatorio')
          if (!cbuCheck.ok) return toast.error(cbuCheck.error)
          if (!cuitCheck.ok) return toast.error(cuitCheck.error)
          setSaving(true)
          void crearDestinatario({
            nombre: nombre.trim(),
            cbu: cbuCheck.valor,
            cuit: cuitCheck.valor || null,
            alias: alias.trim() || null,
            tipo,
          })
            .then(() => onSaved())
            .catch((err: unknown) => {
              toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
            })
            .finally(() => setSaving(false))
        }}
      >
        <h2 className="text-heading text-lg font-semibold">Agregar destinatario</h2>
        <div className="mt-4 space-y-3">
          <FinanzasFormField label="Nombre">
            <input className={finanzasInputClass} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="CBU">
            <input
              className={finanzasInputClass}
              inputMode="numeric"
              value={cbu}
              onChange={(e) => setCbu(soloDigitos(e.target.value).slice(0, 22))}
            />
          </FinanzasFormField>
          {cbu.length > 0 ? (
            <p className={`text-xs ${cbuCheck.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
              {cbuCheck.ok ? 'CBU válido' : cbuCheck.error}
            </p>
          ) : null}
          <FinanzasFormField label="CUIT" optional>
            <input className={finanzasInputClass} value={cuit} onChange={(e) => setCuit(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Alias" optional>
            <input className={finanzasInputClass} value={alias} onChange={(e) => setAlias(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Tipo">
            <select
              className={finanzasInputClass}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as DestinatarioTipo)}
            >
              <option value="terceros">Terceros</option>
              <option value="proveedores">Proveedores</option>
            </select>
          </FinanzasFormField>
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="rounded-lg px-4 py-2 text-sm" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}

function EditarModal({
  destinatario,
  onClose,
  onSaved,
}: {
  destinatario: DestinatarioItem
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [nombre, setNombre] = useState(destinatario.nombre)
  const [alias, setAlias] = useState(destinatario.alias ?? '')
  const [cuit, setCuit] = useState(destinatario.cuit ?? '')
  const [tipo, setTipo] = useState<DestinatarioTipo>(destinatario.tipo)
  const [saving, setSaving] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
      <form
        className="surface-card w-full max-w-lg rounded-2xl border border-neutral-200 p-4 dark:border-zinc-700 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault()
          const cuitCheck = validarCuitOpcional(cuit)
          if (!nombre.trim()) return toast.error('El nombre es obligatorio')
          if (!cuitCheck.ok) return toast.error(cuitCheck.error)
          setSaving(true)
          void actualizarDestinatario(destinatario.id, {
            nombre: nombre.trim(),
            alias: alias.trim() || null,
            cuit: cuitCheck.valor || null,
            tipo,
          })
            .then(() => onSaved())
            .catch((err: unknown) => {
              toast.error(err instanceof Error ? err.message : 'No se pudo editar')
            })
            .finally(() => setSaving(false))
        }}
      >
        <h2 className="text-heading text-lg font-semibold">Editar destinatario</h2>
        <p className="text-body-muted mt-1 break-all text-xs">{destinatario.cbu}</p>
        <div className="mt-4 space-y-3">
          <FinanzasFormField label="Nombre">
            <input className={finanzasInputClass} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Alias" optional>
            <input className={finanzasInputClass} value={alias} onChange={(e) => setAlias(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="CUIT" optional>
            <input className={finanzasInputClass} value={cuit} onChange={(e) => setCuit(e.target.value)} />
          </FinanzasFormField>
          <FinanzasFormField label="Tipo">
            <select
              className={finanzasInputClass}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as DestinatarioTipo)}
            >
              <option value="terceros">Terceros</option>
              <option value="proveedores">Proveedores</option>
            </select>
          </FinanzasFormField>
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="rounded-lg px-4 py-2 text-sm" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}

function BorrarModal({
  destinatario,
  onClose,
  onConfirm,
}: {
  destinatario: DestinatarioItem
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
      <div className="surface-card w-full max-w-md rounded-2xl border border-neutral-200 p-4 dark:border-zinc-700 sm:p-6">
        <h2 className="text-heading text-lg font-semibold">Sacar de la agenda</h2>
        <p className="mt-2 text-sm">
          ¿Sacar a {destinatario.nombre} de la agenda? No borra las transferencias ya hechas.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="rounded-lg px-4 py-2 text-sm" onClick={onClose} disabled={saving}>
            Volver
          </button>
          <button
            type="button"
            disabled={saving}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            onClick={() => {
              setSaving(true)
              void onConfirm()
                .catch((err: unknown) => {
                  toast.error(err instanceof Error ? err.message : 'No se pudo borrar')
                })
                .finally(() => setSaving(false))
            }}
          >
            {saving ? 'Borrando…' : 'Borrar'}
          </button>
        </div>
      </div>
    </div>
  )
}
