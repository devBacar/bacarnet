import { Loader2, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { createAccessRequest } from '../services/approvalRequestsService'
import type { DrivePermissionRole } from '../services/driveApi'
import { isValidReason, REASON_REQUIRED_ERROR } from '../utils/reasonValidation'

const ROLE_OPTIONS: { value: DrivePermissionRole; label: string }[] = [
  { value: 'commenter', label: 'Comentarista' },
  { value: 'writer', label: 'Editor' },
]

interface RequestMorePermissionsModalProps {
  fileId: string
  fileName: string
  onClose: () => void
  onSubmitted?: () => void
}

export function RequestMorePermissionsModal({
  fileId,
  fileName,
  onClose,
  onSubmitted,
}: RequestMorePermissionsModalProps) {
  const [role, setRole] = useState<DrivePermissionRole>('commenter')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const roleOptions = useMemo(() => ROLE_OPTIONS, [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!isValidReason(reason)) {
      toast.error(REASON_REQUIRED_ERROR)
      return
    }

    setSubmitting(true)
    try {
      await createAccessRequest({ fileId, role, reason: reason.trim() })
      toast.success('Solicitud enviada al jefe del área')
      onSubmitted?.()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo enviar la solicitud')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={handleSubmit} className="app-modal-panel max-w-md">
        <header className="shrink-0 flex items-start justify-between border-b border-neutral-200 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0 pr-4">
            <h2 className="font-semibold">Pedir más permisos</h2>
            <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-zinc-400">{fileName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-zinc-800"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="app-modal-scroll space-y-4 px-5 py-5">
          <p className="text-sm text-neutral-600 dark:text-gray-400">
            Tu jefe de área recibirá una notificación para aprobar o rechazar el cambio de rol.
          </p>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Rol solicitado</span>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as DrivePermissionRole)}
              className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Motivo</span>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="w-full resize-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
        </div>

        <footer className="shrink-0 flex justify-end gap-2 border-t border-neutral-200 px-5 py-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-zinc-700"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando…
              </span>
            ) : (
              'Enviar solicitud'
            )}
          </button>
        </footer>
      </form>
    </div>
  )
}
