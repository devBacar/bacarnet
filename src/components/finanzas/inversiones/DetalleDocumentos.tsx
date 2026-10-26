import { useState } from 'react'
import type { DocumentoInversion, InversionDetalle } from '../../../services/finanzasInversionesApi'
import { FinanzasFormField, finanzasInputClass } from '../FinanzasFormField'
import { TEXTO_DOC } from './detalleShared'

export function DetalleDocumentos({
  d,
  subiendo,
  onSubir,
  onAbrir,
  onQuitar,
}: {
  d: InversionDetalle
  subiendo: boolean
  onSubir: (archivo: File, tipo: DocumentoInversion['tipo']) => void
  onAbrir: (docId: string) => void
  onQuitar: (docId: string) => void
}) {
  const [tipoDoc, setTipoDoc] = useState<DocumentoInversion['tipo']>('mutuo')

  return (
    <section>
      <div className="flex flex-wrap items-end gap-2">
        <FinanzasFormField label="Tipo" htmlFor="di-doc-tipo">
          <select
            id="di-doc-tipo"
            value={tipoDoc}
            onChange={(e) => setTipoDoc(e.target.value as DocumentoInversion['tipo'])}
            className={finanzasInputClass}
          >
            <option value="mutuo">Mutuo</option>
            <option value="pagare">Pagaré</option>
            <option value="otro">Otro</option>
          </select>
        </FinanzasFormField>
        <FinanzasFormField label="PDF" htmlFor="di-doc-file">
          <input
            id="di-doc-file"
            type="file"
            accept="application/pdf,.pdf"
            disabled={subiendo}
            className="block w-full max-w-full text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) onSubir(f, tipoDoc)
            }}
          />
        </FinanzasFormField>
      </div>
      {subiendo ? <p className="text-body-muted mt-2 text-sm">Subiendo…</p> : null}
      {d.documentos.length === 0 ? (
        <p className="text-body-muted mt-3 text-sm">No hay documentos adjuntos.</p>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-zinc-800 dark:border-zinc-800">
          {d.documentos.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <button
                type="button"
                onClick={() => onAbrir(doc.id)}
                className="min-w-0 truncate font-medium text-brand-primary hover:underline"
              >
                {TEXTO_DOC[doc.tipo]} · {doc.nombre}
              </button>
              <button
                type="button"
                onClick={() => onQuitar(doc.id)}
                className="shrink-0 text-xs text-neutral-600 hover:underline dark:text-gray-300"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
