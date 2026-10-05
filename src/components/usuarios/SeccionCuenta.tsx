import { Copy, LockKeyhole, X } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { resetUserPassword } from '../../services/usersApi'
import { isValidReason, REASON_REQUIRED_ERROR, REASON_REQUIRED_LABEL } from '../../utils/reasonValidation'
import { SeccionFicha } from './SeccionFicha'

export function SeccionCuenta({
  uid,
  nombre,
  email,
  esUnoMismo,
  puedeRestablecer,
  puedeEliminar,
  eliminando,
  onEliminar,
  onEstadoClave,
}: {
  uid: string
  nombre: string
  email: string
  esUnoMismo: boolean
  puedeRestablecer: boolean
  puedeEliminar: boolean
  eliminando: boolean
  onEliminar: () => void
  onEstadoClave: (estado: { abierto: boolean; temporalVisible: boolean }) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ temporaryPassword: string } | null>(null)

  const cerrar = () => {
    setAbierto(false)
    setReason('')
    setResult(null)
  }

  useEffect(() => {
    onEstadoClave({ abierto, temporalVisible: result !== null })
  }, [abierto, onEstadoClave, result])

  useEffect(() => {
    if (!abierto || result) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cerrar()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [abierto, result])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (esUnoMismo) {
      toast.error('No podés restablecer tu propia contraseña desde acá')
      return
    }
    if (!isValidReason(reason)) {
      toast.error(REASON_REQUIRED_ERROR)
      return
    }
    setSaving(true)
    try {
      const out = await resetUserPassword(uid, reason.trim())
      setResult({ temporaryPassword: out.temporaryPassword })
      toast.success('Contraseña restablecida')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo restablecer la contraseña')
    } finally {
      setSaving(false)
    }
  }

  const copiar = async () => {
    if (!result?.temporaryPassword) return
    try {
      await navigator.clipboard.writeText(result.temporaryPassword)
      toast.success('Contraseña copiada')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  return (
    <>
      <SeccionFicha icono={LockKeyhole} titulo="Cuenta">
        <button
          type="button"
          disabled={!puedeRestablecer}
          onClick={() => {
            setReason('')
            setResult(null)
            setAbierto(true)
          }}
          className="w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:text-gray-100"
        >
          Restablecer contraseña
        </button>
        {!puedeRestablecer && (
          <p className="text-xs text-neutral-500 dark:text-gray-400">
            {esUnoMismo
              ? 'No podés restablecer tu propia contraseña desde acá.'
              : 'Solo un super admin puede restablecer contraseñas.'}
          </p>
        )}
        <button
          type="button"
          disabled={!puedeEliminar || eliminando}
          onClick={onEliminar}
          className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {eliminando ? 'Eliminando…' : 'Eliminar usuario'}
        </button>
        {!puedeEliminar && (
          <p className="text-xs text-neutral-500 dark:text-gray-400">
            No podés eliminar tu propia cuenta desde acá.
          </p>
        )}
      </SeccionFicha>

      {abierto &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
            <div
              role="dialog"
              aria-labelledby="password-reset-title"
              className="w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 dark:border-zinc-800">
                <h2 id="password-reset-title" className="text-lg font-semibold text-neutral-900 dark:text-gray-100">
                  Restablecer contraseña
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      result &&
                      !window.confirm(
                        'La contraseña temporal no se va a volver a mostrar. ¿Cerrar?',
                      )
                    ) {
                      return
                    }
                    cerrar()
                  }}
                  className="rounded-lg p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-zinc-800"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-5 py-4">
                <p className="text-sm text-neutral-600 dark:text-gray-400">
                  <span className="font-medium text-neutral-900 dark:text-gray-100">{nombre || email}</span>
                  <br />
                  {email}
                </p>
                {result ? (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-neutral-600 dark:text-gray-400">
                      Compartí esta contraseña temporal con la persona. No se volverá a mostrar.
                    </p>
                    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
                      <p className="text-xs font-medium text-neutral-500 dark:text-gray-400">Contraseña temporal</p>
                      <div className="mt-1 flex items-center gap-2">
                        <code className="min-w-0 flex-1 break-all text-sm font-semibold text-neutral-900 dark:text-gray-100">
                          {result.temporaryPassword}
                        </code>
                        <button
                          type="button"
                          onClick={() => void copiar()}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 hover:bg-white dark:border-zinc-600 dark:text-gray-300 dark:hover:bg-zinc-800"
                          aria-label="Copiar contraseña"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={cerrar}
                      className="w-full rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white"
                    >
                      Listo
                    </button>
                  </div>
                ) : (
                  <form onSubmit={(event) => void handleSubmit(event)} className="mt-4 space-y-4">
                    <div>
                      <label
                        htmlFor="password-reset-reason"
                        className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-gray-300"
                      >
                        {REASON_REQUIRED_LABEL}
                      </label>
                      <textarea
                        id="password-reset-reason"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        rows={3}
                        className="input-brand-focus w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                        placeholder="Por ejemplo, olvidó su contraseña"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={cerrar}
                        disabled={saving}
                        className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-zinc-600"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {saving ? 'Restableciendo…' : 'Restablecer contraseña'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
