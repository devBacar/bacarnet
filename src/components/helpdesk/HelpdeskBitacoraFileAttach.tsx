import { Paperclip, X } from 'lucide-react'
import { useRef } from 'react'

export const HELPDESK_BITACORA_FILE_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp'

type HelpdeskBitacoraFileAttachProps = {
  accept?: string
  file: File | null
  onFileChange: (file: File | null) => void
  /** testId del input oculto (Playwright / E2E). */
  testId?: string
}

export function HelpdeskBitacoraFileAttach({
  accept = HELPDESK_BITACORA_FILE_ACCEPT,
  file,
  onFileChange,
  testId = 'helpdesk-bitacora-file',
}: HelpdeskBitacoraFileAttachProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const openPicker = () => {
    inputRef.current?.click()
  }

  const clearFile = () => {
    onFileChange(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const hiddenInput = (
    <input
      ref={inputRef}
      data-testid={testId}
      type="file"
      accept={accept}
      className="sr-only"
      onChange={(event) => {
        const picked = event.target.files?.[0] ?? null
        onFileChange(picked)
        event.target.value = ''
      }}
    />
  )

  if (file) {
    return (
      <div
        className="flex w-full min-w-[10.5rem] max-w-full items-center gap-2 rounded-lg border border-brand-primary/35 bg-brand-tint/50 px-3 py-2 dark:border-brand-primary/45 dark:bg-brand-tint/15 sm:max-w-[14rem]"
        data-testid="helpdesk-bitacora-file-selected"
      >
        {hiddenInput}
        <Paperclip className="h-4 w-4 shrink-0 text-brand-primary" aria-hidden />
        <span
          className="min-w-0 flex-1 truncate text-sm font-medium text-heading"
          title={file.name}
        >
          {file.name}
        </span>
        <button
          type="button"
          aria-label={`Quitar ${file.name}`}
          data-testid="helpdesk-bitacora-file-clear"
          onClick={clearFile}
          className="shrink-0 rounded-md p-1 text-body-muted transition-colors hover:bg-white/80 hover:text-heading dark:hover:bg-zinc-800"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid="helpdesk-bitacora-file-trigger"
      onClick={openPicker}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openPicker()
        }
      }}
      className="flex w-full min-w-[10.5rem] cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-3 py-2.5 text-sm font-medium text-heading transition-colors hover:border-brand-primary/55 hover:bg-brand-tint/35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary dark:border-zinc-600 dark:bg-zinc-950/60 dark:hover:border-brand-primary/45 dark:hover:bg-brand-tint/20 sm:max-w-[14rem]"
    >
      {hiddenInput}
      <Paperclip className="h-4 w-4 shrink-0 text-brand-primary" aria-hidden />
      <span className="whitespace-nowrap">Adjuntar archivo</span>
    </div>
  )
}
