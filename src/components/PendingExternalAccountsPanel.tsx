import { useCallback, useEffect, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { Loader2, UserCheck, UserX } from 'lucide-react'
import {
  approveExternalAccount,
  listPendingExternalAccounts,
  rejectExternalAccount,
  type PendingExternalAccountDto,
} from '../services/usersApi'
import { isValidReason, REASON_REQUIRED_LABEL } from '../utils/reasonValidation'

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function PendingExternalAccountsPanel() {
  const [accounts, setAccounts] = useState<PendingExternalAccountDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actingId, setActingId] = useState<string | null>(null)
  const [reasonByUid, setReasonByUid] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await listPendingExternalAccounts()
      setAccounts(rows)
      setError(null)
    } catch (err) {
      setAccounts([])
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las cuentas pendientes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleApprove = async (account: PendingExternalAccountDto) => {
    const reason = reasonByUid[account.uid]?.trim() ?? ''
    if (!isValidReason(reason)) {
      toast.error('Ingresá un motivo válido')
      return
    }
    setActingId(account.uid)
    try {
      await approveExternalAccount(account.uid, reason)
      toast.success(`Cuenta de ${account.displayName || account.email} aprobada`)
      setReasonByUid((current) => {
        const next = { ...current }
        delete next[account.uid]
        return next
      })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo aprobar la cuenta')
    } finally {
      setActingId(null)
    }
  }

  const handleReject = async (account: PendingExternalAccountDto) => {
    const reason = reasonByUid[account.uid]?.trim() ?? ''
    if (!isValidReason(reason)) {
      toast.error('Ingresá un motivo válido')
      return
    }
    const confirmed = window.confirm(
      `¿Rechazar la solicitud de "${account.displayName || account.email}"?\n\nLa cuenta quedará bloqueada.`,
    )
    if (!confirmed) return

    setActingId(account.uid)
    try {
      await rejectExternalAccount(account.uid, reason)
      toast.success(`Solicitud de ${account.displayName || account.email} rechazada`)
      setReasonByUid((current) => {
        const next = { ...current }
        delete next[account.uid]
        return next
      })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo rechazar la cuenta')
    } finally {
      setActingId(null)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-neutral-900 dark:text-gray-100">
          Cuentas pendientes de aprobación
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-gray-400">
          Registros con email fuera de @bacarsa.com.ar que esperan habilitación manual.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando solicitudes…
        </div>
      ) : error ? (
        <p className="rounded-lg alert-error px-4 py-3 text-sm text-danger">{error}</p>
      ) : accounts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-10 text-center text-sm text-neutral-500 dark:border-zinc-700 dark:text-gray-400">
          No hay cuentas externas pendientes de aprobación.
        </p>
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => {
            const reason = reasonByUid[account.uid] ?? ''
            const acting = actingId === account.uid
            return (
              <article
                key={account.uid}
                className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold text-neutral-900 dark:text-gray-100">
                      {account.displayName || account.email}
                    </h3>
                    <p className="mt-1 text-sm text-neutral-600 dark:text-gray-400">{account.email}</p>
                    <p className="mt-2 text-xs text-neutral-500 dark:text-gray-500">
                      Departamento: {account.department || '—'} · Registrado:{' '}
                      {formatDate(account.createdAt)}
                    </p>
                  </div>
                  <form
                    className="w-full max-w-xl space-y-3"
                    onSubmit={(event: FormEvent) => {
                      event.preventDefault()
                      void handleApprove(account)
                    }}
                  >
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-neutral-500 dark:text-gray-400">
                        {REASON_REQUIRED_LABEL}
                      </span>
                      <textarea
                        required
                        rows={2}
                        value={reason}
                        onChange={(event) =>
                          setReasonByUid((current) => ({
                            ...current,
                            [account.uid]: event.target.value,
                          }))
                        }
                        className="w-full resize-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none input-brand-focus dark:border-zinc-700 dark:bg-zinc-950"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={acting || !isValidReason(reason)}
                        className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <UserCheck className="h-4 w-4" />
                        {acting ? 'Procesando…' : 'Aprobar'}
                      </button>
                      <button
                        type="button"
                        disabled={acting || !isValidReason(reason)}
                        onClick={() => void handleReject(account)}
                        className="inline-flex items-center gap-2 rounded-lg border border-danger/30 px-4 py-2 text-sm font-medium text-danger hover:bg-brand-tint disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-brand-primary-hover/20"
                      >
                        <UserX className="h-4 w-4" />
                        Rechazar
                      </button>
                    </div>
                  </form>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
