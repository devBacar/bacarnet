import { Download } from 'lucide-react'

/** Botón "Descargar para Sheets": baja la tabla como CSV (se abre en Google Sheets o Excel). */
export function BotonExportarRrhh({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Baja un archivo .csv que se abre en Google Sheets (Archivo → Importar) o en Excel"
      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-[14px] font-medium text-[#1f3b63] transition hover:bg-neutral-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-blue-300 dark:hover:bg-zinc-800"
    >
      <Download className="h-4 w-4" aria-hidden />
      Descargar para Sheets
    </button>
  )
}
