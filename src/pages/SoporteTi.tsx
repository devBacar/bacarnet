import {
  AlertCircle,
  Archive,
  Check,
  CheckCircle2,
  ChevronDown,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Inbox,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCcw,
  Send,
  UploadCloud,
  Wrench,
  X,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react'
import toast from 'react-hot-toast'
import {
  addStAttachments,
  addStComment,
  createStTicket,
  getStCatalog,
  getStComments,
  getStTicket,
  listMyStTickets,
  ST_FILE_ACCEPT,
  ST_MAX_FILE_BYTES,
  type StAttachment,
  type StCatalog,
  type StComment,
  type StTicket,
  type StTicketPriority,
  type StTicketStatus,
  updateStTicketStatus,
} from '../services/stTicketsApi'
import {
  isStCategorySelectLocked,
  stAutoCategoryIdForDepartment,
  stVisibleCategoriesForDepartment,
} from '../lib/stTicketCategoryFilter'

const STATUS_LABELS: Record<StTicketStatus, string> = {
  open: 'Recibido',
  'in-progress': 'En atención',
  resolved: 'Resuelto',
  closed: 'Cerrado',
}

const PRIORITIES: {
  value: StTicketPriority
  label: string
  hint: string
  selectedClass: string
  dotClass: string
}[] = [
  {
    value: 'low',
    label: 'Baja',
    hint: 'Puede esperar',
    selectedClass: 'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100',
    dotClass: 'bg-emerald-500',
  },
  {
    value: 'medium',
    label: 'Media',
    hint: 'Afecta el trabajo',
    selectedClass: 'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100',
    dotClass: 'bg-amber-500',
  },
  {
    value: 'high',
    label: 'Alta',
    hint: 'Impacto importante',
    selectedClass: 'border-orange-400 bg-orange-50 text-orange-900 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-100',
    dotClass: 'bg-orange-500',
  },
  {
    value: 'urgent',
    label: 'Urgente',
    hint: 'Trabajo bloqueado',
    selectedClass: 'border-red-400 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950/40 dark:text-red-100',
    dotClass: 'bg-red-500',
  },
]

function formatDate(value: string | null | undefined, includeTime = true): string {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-AR', includeTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }).format(date)
}

function validateFiles(files: File[]): string | null {
  const tooLarge = files.find((file) => file.size > ST_MAX_FILE_BYTES)
  return tooLarge ? `${tooLarge.name} supera el límite de 25 MB` : null
}

function fileSizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function statusBadgeClass(status: StTicketStatus): string {
  switch (status) {
    case 'open':
      return 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200'
    case 'in-progress':
      return 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200'
    case 'resolved':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200'
    case 'closed':
      return 'border-neutral-200 bg-neutral-100 text-neutral-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
  }
}

function priorityBadgeClass(priority: StTicketPriority): string {
  switch (priority) {
    case 'low':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200'
    case 'medium':
      return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200'
    case 'high':
      return 'border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-200'
    case 'urgent':
      return 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200'
  }
}

function SelectField({
  id,
  label,
  hint,
  value,
  onChange,
  children,
  required,
  disabled,
}: {
  id: string
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
  required?: boolean
  disabled?: boolean
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-body-muted">{label}</span>
      {hint ? <span className="ml-2 text-xs text-body-muted">{hint}</span> : null}
      <span className="relative mt-1.5 block">
        <select
          id={id}
          required={required}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="input-brand-focus input-surface h-11 w-full appearance-none rounded-lg border px-3 pr-10 text-sm font-medium text-heading shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-body-muted" aria-hidden />
      </span>
    </label>
  )
}

function FileTypeIcon({ attachment, className = 'h-5 w-5' }: { attachment: Pick<StAttachment, 'file_type' | 'file_name'>; className?: string }) {
  const type = attachment.file_type?.toLowerCase() ?? ''
  const name = attachment.file_name.toLowerCase()
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|heif|avif)$/.test(name)) {
    return <FileImage className={`${className} text-violet-600 dark:text-violet-300`} aria-hidden />
  }
  if (type.startsWith('video/') || /\.(mp4|mov|avi|wmv|mkv)$/.test(name)) {
    return <FileVideo className={`${className} text-rose-600 dark:text-rose-300`} aria-hidden />
  }
  if (/spreadsheet|excel/.test(type) || /\.(xls|xlsx)$/.test(name)) {
    return <FileSpreadsheet className={`${className} text-emerald-600 dark:text-emerald-300`} aria-hidden />
  }
  if (/pdf|word|document/.test(type) || /\.(pdf|doc|docx)$/.test(name)) {
    return <FileText className={`${className} text-blue-600 dark:text-blue-300`} aria-hidden />
  }
  return <File className={`${className} text-body-muted`} aria-hidden />
}

function FileDropzone({
  files,
  onFiles,
  compact = false,
  testId,
}: {
  files: File[]
  onFiles: (files: File[]) => void
  compact?: boolean
  testId: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const addFiles = (incoming: File[]) => {
    const validationError = validateFiles(incoming)
    if (validationError) {
      toast.error(validationError)
      return
    }
    const next = [...files]
    for (const file of incoming) {
      if (!next.some((current) => current.name === file.name && current.size === file.size)) next.push(file)
    }
    onFiles(next)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    addFiles(Array.from(event.dataTransfer.files))
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
        }}
        onDragEnter={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`cursor-pointer rounded-xl border border-dashed text-center transition-colors ${
          dragging
            ? 'border-brand-primary bg-brand-tint/60 dark:bg-brand-tint/20'
            : 'border-neutral-300 bg-neutral-50 hover:border-brand-primary/50 hover:bg-brand-tint/30 dark:border-zinc-700 dark:bg-zinc-950/60'
        } ${compact ? 'px-4 py-4' : 'px-6 py-7'}`}
      >
        <input
          ref={inputRef}
          data-testid={testId}
          type="file"
          multiple
          accept={ST_FILE_ACCEPT}
          className="sr-only"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
        <UploadCloud className={`${compact ? 'h-6 w-6' : 'h-8 w-8'} mx-auto text-brand-primary`} aria-hidden />
        <p className="mt-2 text-sm font-medium text-heading">
          {compact ? 'Agregar archivos' : 'Arrastrá archivos acá o hacé clic para elegir'}
        </p>
        <p className="mt-1 text-xs text-body-muted">Imágenes, PDF, Office o video · Máximo 25 MB por archivo</p>
      </div>
      {files.length > 0 ? (
        <ul className="space-y-2" aria-label="Archivos seleccionados">
          {files.map((file) => (
            <li key={`${file.name}-${file.size}`} className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
              <FileTypeIcon attachment={{ file_name: file.name, file_type: file.type }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-heading">{file.name}</p>
                <p className="text-xs text-body-muted">{fileSizeLabel(file.size)}</p>
              </div>
              <button
                type="button"
                aria-label={`Quitar ${file.name}`}
                onClick={() => onFiles(files.filter((current) => current !== file))}
                className="rounded-md p-1 text-body-muted transition-colors hover:bg-neutral-100 hover:text-heading dark:hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function TicketFormModal({
  catalog,
  open,
  onClose,
  onCreated,
}: {
  catalog: StCatalog
  open: boolean
  onClose: () => void
  onCreated: () => Promise<void>
}) {
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [departmentId, setDepartmentId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [problemId, setProblemId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<StTicketPriority>('medium')
  const [files, setFiles] = useState<File[]>([])

  const departmentNum = departmentId ? Number(departmentId) : null
  const visibleCategories = useMemo(
    () => stVisibleCategoriesForDepartment(catalog.categories, departmentNum),
    [catalog.categories, departmentNum],
  )
  const categoryLocked = departmentNum != null && isStCategorySelectLocked(departmentNum)
  const categorySelectDisabled = !departmentId || categoryLocked

  const selectedCategory = catalog.categories.find((item) => item.id === Number(categoryId))
  const problems = (selectedCategory?.predefinedProblems ?? []).filter(
    (item) => !departmentId || item.department_id === Number(departmentId),
  )

  const onDepartmentChange = (value: string) => {
    setDepartmentId(value)
    setProblemId('')
    const num = value ? Number(value) : null
    if (num != null && isStCategorySelectLocked(num)) {
      setCategoryId(stAutoCategoryIdForDepartment(num))
    } else {
      setCategoryId('')
    }
  }

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open, submitting, onClose])

  if (!open) return null

  const reset = () => {
    setDepartmentId('')
    setCategoryId('')
    setProblemId('')
    setTitle('')
    setDescription('')
    setPriority('medium')
    setFiles([])
    setSubmitError(null)
  }

  const chooseProblem = (value: string) => {
    setProblemId(value)
    const problem = problems.find((item) => item.id === Number(value))
    if (problem) {
      setTitle(problem.title === 'Otro...' ? '' : problem.title)
      setDescription(problem.title === 'Otro...' ? '' : problem.description)
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitError(null)
    const validationError = validateFiles(files)
    if (validationError) {
      setSubmitError(validationError)
      return
    }
    setSubmitting(true)
    try {
      const form = new FormData()
      form.append('department_id', departmentId)
      form.append('category_id', categoryId)
      if (problemId) form.append('predefined_problem_id', problemId)
      form.append('title', title.trim())
      form.append('description', description.trim())
      form.append('priority', priority)
      files.forEach((file) => form.append('attachments', file))
      await createStTicket(form)
      toast.success('Pedido enviado a Sistemas')
      reset()
      onClose()
      await onCreated()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo enviar el pedido'
      setSubmitError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/55 p-4 py-8 backdrop-blur-[2px] sm:items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="st-ticket-form-title"
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-4 dark:border-zinc-800 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint/60 text-brand-primary dark:bg-brand-tint/20">
              <Wrench className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 id="st-ticket-form-title" className="text-lg font-semibold text-heading">Nuevo pedido a Sistemas</h2>
              <p className="mt-0.5 text-sm text-body-muted">Contanos qué necesitás y lo derivamos al equipo correcto.</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cerrar formulario"
            disabled={submitting}
            onClick={onClose}
            className="rounded-lg p-2 text-body-muted transition-colors hover:bg-neutral-100 hover:text-heading disabled:opacity-50 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} data-testid="st-ticket-create-form">
          <div className="max-h-[80vh] space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
            <section className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-heading">1. Clasificá el pedido</p>
                <p className="mt-0.5 text-xs text-body-muted">Esto nos ayuda a asignarlo más rápido.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField id="st-department" label="Área destinataria" value={departmentId} onChange={onDepartmentChange} required>
                  <option value="">Seleccionar área</option>
                  {catalog.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </SelectField>
                <SelectField
                  id="st-category"
                  label="Categoría"
                  value={categoryId}
                  onChange={(value) => {
                    setCategoryId(value)
                    setProblemId('')
                  }}
                  required={Boolean(departmentId)}
                  disabled={categorySelectDisabled}
                >
                  {!categoryLocked ? <option value="">Seleccionar categoría</option> : null}
                  {visibleCategories.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </SelectField>
              </div>
              {problems.length > 0 ? (
                <SelectField id="st-problem" label="Problema frecuente" hint="Opcional" value={problemId} onChange={chooseProblem}>
                  <option value="">Prefiero describirlo manualmente</option>
                  {problems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </SelectField>
              ) : null}
            </section>

            <section className="space-y-4 border-t border-neutral-100 pt-5 dark:border-zinc-800">
              <div>
                <p className="text-sm font-semibold text-heading">2. Describí lo que necesitás</p>
                <p className="mt-0.5 text-xs text-body-muted">Incluí contexto, desde cuándo sucede y a quién afecta.</p>
              </div>
              <label htmlFor="st-title" className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-body-muted">Título</span>
                <input
                  id="st-title"
                  className="input-brand-focus input-surface mt-1.5 h-11 w-full rounded-lg px-3 text-sm shadow-sm"
                  required
                  maxLength={160}
                  placeholder="Ej.: No puedo acceder al sistema de ventas"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label htmlFor="st-description" className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-body-muted">Descripción</span>
                <textarea
                  id="st-description"
                  className="input-brand-focus input-surface mt-1.5 min-h-28 w-full resize-y rounded-lg px-3 py-2.5 text-sm shadow-sm"
                  required
                  placeholder="Contanos qué pasó, qué intentaste y cómo impacta en tu trabajo…"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
            </section>

            <section className="space-y-4 border-t border-neutral-100 pt-5 dark:border-zinc-800">
              <div>
                <p className="text-sm font-semibold text-heading">3. Indicá la prioridad</p>
                <p className="mt-0.5 text-xs text-body-muted">Elegí según el impacto real en tu trabajo.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Prioridad">
                {PRIORITIES.map((option) => {
                  const selected = priority === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setPriority(option.value)}
                      className={`relative rounded-xl border px-3 py-3 text-left transition-all ${
                        selected
                          ? `${option.selectedClass} shadow-sm`
                          : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${option.dotClass}`} />
                        <span className="text-sm font-semibold">{option.label}</span>
                        {selected ? <Check className="ml-auto h-4 w-4" /> : null}
                      </span>
                      <span className="mt-1 block text-[11px] opacity-75">{option.hint}</span>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="space-y-3 border-t border-neutral-100 pt-5 dark:border-zinc-800">
              <div>
                <p className="text-sm font-semibold text-heading">4. Adjuntá evidencia</p>
                <p className="mt-0.5 text-xs text-body-muted">Opcional · Capturas, documentos o videos ayudan a resolver más rápido.</p>
              </div>
              <FileDropzone files={files} onFiles={setFiles} testId="st-ticket-create-attachments" />
            </section>

            {submitError ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-neutral-100 bg-neutral-50/70 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-950/40 sm:px-6">
            <button type="button" className="rounded-lg px-4 py-2.5 text-sm font-medium text-body transition-colors hover:bg-neutral-200/70 disabled:opacity-50 dark:hover:bg-zinc-800" disabled={submitting} onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary inline-flex min-w-36 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? 'Enviando…' : 'Enviar pedido'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AttachmentList({ attachments }: { attachments: StAttachment[] }) {
  if (attachments.length === 0) {
    return <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-5 text-center text-sm text-body-muted dark:border-zinc-700">Todavía no hay archivos adjuntos.</p>
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          {attachment.url ? (
            <a
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 transition-colors hover:border-brand-primary/30 hover:bg-brand-tint/30 dark:border-zinc-700 dark:bg-zinc-950/60"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-zinc-900">
                <FileTypeIcon attachment={attachment} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-heading">{attachment.file_name}</span>
                <span className="block text-xs text-body-muted">Abrir archivo</span>
              </span>
            </a>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-zinc-950/60">
              <FileTypeIcon attachment={attachment} />
              <span className="truncate text-sm font-medium text-heading">{attachment.file_name}</span>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function CommentBubble({ comment }: { comment: StComment }) {
  const mine = comment.isRequester || comment.authorLabel === 'Vos'
  return (
    <li className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[72%] ${
        mine
          ? 'rounded-br-md bg-brand-primary text-white'
          : 'rounded-bl-md border border-neutral-200 bg-neutral-50 text-heading dark:border-zinc-700 dark:bg-zinc-950'
      }`}>
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs ${mine ? 'text-white/75' : 'text-body-muted'}`}>
          <strong className={mine ? 'text-white' : 'text-heading'}>{comment.authorLabel}</strong>
          <time>{formatDate(comment.created_at)}</time>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{comment.texto}</p>
      </div>
    </li>
  )
}

function TicketDetail({
  initialTicket,
  onStatusChange,
}: {
  initialTicket: StTicket
  onStatusChange: (id: number, status: StTicketStatus) => void
}) {
  const [ticket, setTicket] = useState(initialTicket)
  const [comments, setComments] = useState<StComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [loading, setLoading] = useState(true)
  const [commentBusy, setCommentBusy] = useState(false)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [uploadFiles, setUploadFiles] = useState<File[]>([])

  useEffect(() => {
    void Promise.all([getStTicket(ticket.stTicketId), getStComments(ticket.stTicketId)])
      .then(([detail, rows]) => {
        setTicket(detail)
        setComments(rows)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'No se pudo cargar el detalle'))
      .finally(() => setLoading(false))
  }, [ticket.stTicketId])

  const sendComment = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!commentText.trim()) return
    setCommentBusy(true)
    try {
      const created = await addStComment(ticket.stTicketId, commentText.trim())
      setComments((current) => [...current, created])
      setCommentText('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo comentar')
    } finally {
      setCommentBusy(false)
    }
  }

  const upload = async () => {
    if (uploadFiles.length === 0) return
    setUploadBusy(true)
    try {
      const created = await addStAttachments(ticket.stTicketId, uploadFiles)
      setTicket((current) => ({ ...current, attachments: [...current.attachments, ...created] }))
      setUploadFiles([])
      toast.success('Archivos adjuntados')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudieron subir los archivos')
    } finally {
      setUploadBusy(false)
    }
  }

  const changeStatus = async (action: 'reabrir' | 'cerrar') => {
    if (!window.confirm(`¿Confirmás que querés ${action} este ticket?`)) return
    setStatusBusy(true)
    try {
      const status = await updateStTicketStatus(ticket.stTicketId, action)
      setTicket((current) => ({ ...current, status }))
      onStatusChange(ticket.stTicketId, status)
      toast.success(action === 'reabrir' ? 'Ticket reabierto' : 'Ticket cerrado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo cambiar el estado')
    } finally {
      setStatusBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 border-t border-neutral-100 py-12 text-sm text-body-muted dark:border-zinc-800">
        <Loader2 className="h-5 w-5 animate-spin text-brand-primary" /> Cargando detalle…
      </div>
    )
  }

  return (
    <div className="space-y-7 border-t border-neutral-100 px-4 py-5 dark:border-zinc-800 sm:px-5" data-testid="st-ticket-detail">
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-body-muted">Descripción</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-body">{ticket.description}</p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-heading"><Paperclip className="h-4 w-4 text-brand-primary" /> Adjuntos</h3>
            <p className="mt-0.5 text-xs text-body-muted">Archivos compartidos en este ticket.</p>
          </div>
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-body-muted dark:bg-zinc-800">{ticket.attachments.length}</span>
        </div>
        <AttachmentList attachments={ticket.attachments} />
        <FileDropzone files={uploadFiles} onFiles={setUploadFiles} compact testId="st-ticket-detail-attachments" />
        {uploadFiles.length > 0 ? (
          <div className="flex justify-end">
            <button type="button" className="btn-secondary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium" disabled={uploadBusy} onClick={() => void upload()}>
              {uploadBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {uploadBusy ? 'Subiendo…' : 'Adjuntar archivos'}
            </button>
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-heading"><MessageSquare className="h-4 w-4 text-brand-primary" /> Conversación</h3>
          <p className="mt-0.5 text-xs text-body-muted">Los mensajes son visibles para vos y el equipo de Sistemas.</p>
        </div>
        {comments.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-body-muted dark:border-zinc-700">Todavía no hay mensajes. Podés iniciar la conversación abajo.</p>
        ) : (
          <ol className="space-y-3" data-testid="st-comments-list">
            {comments.map((comment) => <CommentBubble key={comment.id} comment={comment} />)}
          </ol>
        )}
        <form onSubmit={sendComment} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 focus-within:border-brand-primary/50 dark:border-zinc-700 dark:bg-zinc-950/60">
          <textarea
            aria-label="Nuevo comentario"
            className="min-h-20 w-full resize-y bg-transparent text-sm text-heading outline-none placeholder:text-body-muted"
            placeholder="Escribí un mensaje al equipo…"
            value={commentText}
            onChange={(event) => setCommentText(event.target.value)}
          />
          <div className="mt-2 flex justify-end">
            <button className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium" disabled={commentBusy || !commentText.trim()} aria-label="Enviar comentario">
              {commentBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar
            </button>
          </div>
        </form>
      </section>

      {ticket.status === 'resolved' ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/25" data-testid="st-resolved-actions">
          <div>
            <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">¿El pedido quedó solucionado?</p>
            <p className="mt-0.5 text-xs text-emerald-800/75 dark:text-emerald-200/70">Reabrilo si necesitás continuar o cerralo para finalizar.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium" disabled={statusBusy} onClick={() => void changeStatus('reabrir')}>
              <RefreshCcw className="h-4 w-4" /> Reabrir
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-neutral-400 hover:bg-neutral-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              disabled={statusBusy}
              onClick={() => void changeStatus('cerrar')}
            >
              <Archive className="h-4 w-4" /> Cerrar
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}

function TicketRow({
  ticket,
  departmentName,
  expanded,
  onToggle,
  onStatusChange,
}: {
  ticket: StTicket
  departmentName: string
  expanded: boolean
  onToggle: () => void
  onStatusChange: (id: number, status: StTicketStatus) => void
}) {
  const priority = PRIORITIES.find((item) => item.value === ticket.priority)
  return (
    <article className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" data-testid="st-ticket-card">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex min-h-11 w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary dark:hover:bg-zinc-800/80"
        data-testid={`st-ticket-${ticket.stTicketId}`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-sm font-semibold text-heading sm:text-base">{ticket.title}</h3>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase sm:text-xs ${priorityBadgeClass(ticket.priority)}`}>
              {priority?.label ?? ticket.priority}
            </span>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:text-xs ${statusBadgeClass(ticket.status)}`}>
              {STATUS_LABELS[ticket.status]}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-body-muted">
            <span>Ticket #{ticket.stTicketId}</span>
            <span>{departmentName}</span>
            <span>Creado {formatDate(ticket.createdAt, false)}</span>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 shrink-0 text-body-muted transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          {expanded ? <TicketDetail initialTicket={ticket} onStatusChange={onStatusChange} /> : null}
        </div>
      </div>
    </article>
  )
}

function TicketGroup({
  title,
  description,
  icon,
  tickets,
  expandedIds,
  departmentNames,
  onToggle,
  onStatusChange,
  testId,
}: {
  title: string
  description: string
  icon: ReactNode
  tickets: StTicket[]
  expandedIds: Set<number>
  departmentNames: Map<number, string>
  onToggle: (id: number) => void
  onStatusChange: (id: number, status: StTicketStatus) => void
  testId: string
}) {
  if (tickets.length === 0) return null
  return (
    <section className="space-y-3" data-testid={testId}>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100 text-brand-primary dark:bg-zinc-800">{icon}</span>
        <div>
          <h2 className="text-base font-semibold text-heading">{title} <span className="ml-1 text-sm font-normal text-body-muted">({tickets.length})</span></h2>
          <p className="text-xs text-body-muted">{description}</p>
        </div>
      </div>
      <ul className="space-y-2">
        {tickets.map((ticket) => (
          <li key={ticket.stTicketId}>
            <TicketRow
              ticket={ticket}
              departmentName={ticket.departmentName || departmentNames.get(ticket.departmentId) || `Área ${ticket.departmentId}`}
              expanded={expandedIds.has(ticket.stTicketId)}
              onToggle={() => onToggle(ticket.stTicketId)}
              onStatusChange={onStatusChange}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: 'blue' | 'green' | 'neutral' }) {
  const toneClass = {
    blue: 'border-blue-200 bg-blue-50/70 dark:border-blue-900/50 dark:bg-blue-950/25',
    green: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/25',
    neutral: 'border-neutral-200 bg-white dark:border-zinc-800 dark:bg-zinc-900',
  }[tone]
  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-body-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-heading">{value}</p>
    </div>
  )
}

export function SoporteTi() {
  const [catalog, setCatalog] = useState<StCatalog | null>(null)
  const [tickets, setTickets] = useState<StTicket[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set())
  const [formOpen, setFormOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reloadTickets = async () => {
    setTickets(await listMyStTickets())
  }

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [loadedCatalog, loadedTickets] = await Promise.all([getStCatalog(), listMyStTickets()])
      setCatalog(loadedCatalog)
      setTickets(loadedTickets)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo cargar Tickets'
      setLoadError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const sortedTickets = useMemo(
    () => [...tickets].sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? '')),
    [tickets],
  )
  const active = sortedTickets.filter((ticket) => ticket.status === 'open' || ticket.status === 'in-progress')
  const resolved = sortedTickets.filter((ticket) => ticket.status === 'resolved')
  const closed = sortedTickets.filter((ticket) => ticket.status === 'closed')
  const departmentNames = useMemo(
    () => new Map((catalog?.departments ?? []).map((department) => [department.id, department.name])),
    [catalog],
  )

  const toggle = (id: number) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const updateStatus = (id: number, status: StTicketStatus) => {
    setTickets((current) => current.map((ticket) => ticket.stTicketId === id ? { ...ticket, status } : ticket))
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-brand-primary">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-tint/60 dark:bg-brand-tint/20">
              <Wrench className="h-5 w-5" aria-hidden />
            </span>
            <p className="text-xs font-semibold uppercase tracking-[0.14em]">Sistemas · Tickets</p>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-heading sm:text-3xl">Tickets</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-body-muted">Pedí soporte, una implementación o mantenimiento y seguí todo desde un solo lugar.</p>
          </div>
        </div>
        <button
          type="button"
          className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-sm"
          onClick={() => setFormOpen(true)}
          disabled={!catalog}
        >
          <Plus className="h-4 w-4" /> Nuevo pedido
        </button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-body-muted">
          <Loader2 className="h-5 w-5 animate-spin text-brand-primary" /> Cargando tus tickets…
        </div>
      ) : loadError ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-900/50 dark:bg-red-950/30">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700 dark:text-red-300" />
            <div className="flex-1">
              <h2 className="font-semibold text-red-900 dark:text-red-100">No pudimos cargar Tickets</h2>
              <p className="mt-1 text-sm text-red-800/80 dark:text-red-200/80">{loadError}</p>
              <button type="button" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-red-800 hover:underline dark:text-red-200" onClick={() => void load()}>
                <RefreshCcw className="h-4 w-4" /> Reintentar
              </button>
            </div>
          </div>
        </section>
      ) : tickets.length === 0 ? (
        <section className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-14 text-center dark:border-zinc-700 dark:bg-zinc-950/60">
          <Inbox className="mx-auto h-10 w-10 text-brand-primary/70" />
          <h2 className="mt-4 text-lg font-semibold text-heading">Todavía no tenés tickets</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-body-muted">Cuando necesites ayuda, creá un pedido y vas a poder seguir su avance acá.</p>
          <button type="button" className="btn-primary mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" /> Crear mi primer pedido
          </button>
        </section>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3" data-testid="st-ticket-summary">
            <SummaryCard label="Activos" value={active.length} tone="blue" />
            <SummaryCard label="Resueltos" value={resolved.length} tone="green" />
            <SummaryCard label="Cerrados" value={closed.length} tone="neutral" />
          </div>

          <div className="space-y-8" data-testid="st-ticket-groups">
            <TicketGroup
              title="Activos"
              description="Recibidos y en atención"
              icon={<Wrench className="h-4 w-4" />}
              tickets={active}
              expandedIds={expandedIds}
              departmentNames={departmentNames}
              onToggle={toggle}
              onStatusChange={updateStatus}
              testId="st-tickets-group-active"
            />
            <TicketGroup
              title="Resueltos"
              description="Esperan tu confirmación"
              icon={<CheckCircle2 className="h-4 w-4" />}
              tickets={resolved}
              expandedIds={expandedIds}
              departmentNames={departmentNames}
              onToggle={toggle}
              onStatusChange={updateStatus}
              testId="st-tickets-group-resolved"
            />
            <TicketGroup
              title="Cerrados"
              description="Pedidos finalizados"
              icon={<Archive className="h-4 w-4" />}
              tickets={closed}
              expandedIds={expandedIds}
              departmentNames={departmentNames}
              onToggle={toggle}
              onStatusChange={updateStatus}
              testId="st-tickets-group-closed"
            />
          </div>
        </>
      )}

      {catalog ? (
        <TicketFormModal
          catalog={catalog}
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onCreated={reloadTickets}
        />
      ) : null}
    </div>
  )
}
