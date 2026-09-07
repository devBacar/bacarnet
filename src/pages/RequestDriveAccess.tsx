import { FileKey, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { useSearchParams } from 'react-router-dom'
import { createAccessRequest, parseDriveFileInput } from '../services/approvalRequestsService'
import { isValidReason, REASON_REQUIRED_ERROR, REASON_REQUIRED_LABEL } from '../utils/reasonValidation'

export function RequestDriveAccessPage() {
  const [searchParams] = useSearchParams()
  const initialFileRef = searchParams.get('fileId') ?? searchParams.get('id') ?? ''

  const [fileRef, setFileRef] = useState(initialFileRef)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (initialFileRef) setFileRef(initialFileRef)
  }, [initialFileRef])

  const parsedFileId = useMemo(() => parseDriveFileInput(fileRef), [fileRef])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!parsedFileId) {
      toast.error('Ingresá un ID de archivo o enlace válido de Google Drive')
      return
    }
    if (!isValidReason(reason)) {
      toast.error(REASON_REQUIRED_ERROR)
      return
    }

    setSubmitting(true)
    try {
      const result = await createAccessRequest({
        ...(fileRef.includes('/') || fileRef.includes('?') ? { driveLink: fileRef } : { fileId: fileRef }),
        reason,
      })
      toast.success(`Solicitud enviada para «${result.fileName}»`)
      setReason('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo enviar la solicitud')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="layout-container py-8">
      <div className="mx-auto max-w-xl rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-6 flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-tint/30 text-brand-primary dark:bg-brand-tint/20">
            <FileKey className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-gray-100">
              Solicitar acceso a un archivo
            </h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-gray-400">
              Pegá el enlace de Google Drive o el ID del archivo. Un jefe de área revisará tu solicitud.
            </p>
          </div>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          <div>
            <label htmlFor="drive-ref" className="mb-1 block text-sm font-medium text-neutral-700 dark:text-gray-300">
              Archivo (ID o enlace)
            </label>
            <input
              id="drive-ref"
              type="text"
              value={fileRef}
              onChange={(event) => setFileRef(event.target.value)}
              placeholder="https://drive.google.com/file/d/…/view"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none ring-brand-primary/30 focus:border-brand-primary focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-gray-100"
              autoComplete="off"
            />
            {fileRef.trim() && !parsedFileId && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                No se pudo reconocer un ID de archivo válido.
              </p>
            )}
            {parsedFileId && (
              <p className="mt-1 text-xs text-neutral-500 dark:text-gray-500">ID detectado: {parsedFileId}</p>
            )}
          </div>

          <div>
            <label htmlFor="access-reason" className="mb-1 block text-sm font-medium text-neutral-700 dark:text-gray-300">
              {REASON_REQUIRED_LABEL}
            </label>
            <textarea
              id="access-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none ring-brand-primary/30 focus:border-brand-primary focus:ring-2 dark:border-zinc-600 dark:bg-zinc-950 dark:text-gray-100"
              placeholder="Explicá por qué necesitás acceso a este archivo"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !parsedFileId || !isValidReason(reason)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Enviar solicitud
          </button>
        </form>
      </div>
    </div>
  )
}
