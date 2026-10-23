import type { DocumentoInversion, InversionDocumentBase } from './inversion.types.js'
import { ErrorValidacion } from './validar.js'

export const MAX_BYTES_DOCUMENTO = 10 * 1024 * 1024
const TIPOS = ['mutuo', 'pagare', 'otro'] as const

/** Solo PDF (se mira el contenido, no el nombre) y hasta 10 MB. */
export function validarPdf(archivo: { buffer: Buffer; fileName: string } | null): void {
  if (!archivo || archivo.buffer.length === 0) throw new ErrorValidacion('Elegí el archivo PDF.')
  if (archivo.buffer.length > MAX_BYTES_DOCUMENTO) throw new ErrorValidacion('El PDF pesa más de 10 MB.')
  if (archivo.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new ErrorValidacion('El archivo tiene que ser un PDF.')
}

export function tipoDocumento(raw: unknown): DocumentoInversion['tipo'] {
  return TIPOS.includes(raw as (typeof TIPOS)[number]) ? (raw as DocumentoInversion['tipo']) : 'otro'
}

export function agregarDocumento(inv: InversionDocumentBase, doc: DocumentoInversion): InversionDocumentBase {
  if (inv.estado === 'anulada') throw new ErrorValidacion('La inversión está anulada.')
  return { ...inv, documentos: [...(inv.documentos ?? []), doc] }
}

/** Baja lógica: el archivo queda guardado. */
export function quitarDocumento(inv: InversionDocumentBase, docId: string): InversionDocumentBase {
  const docs = inv.documentos ?? []
  if (!docs.some((d) => d.id === docId && !d.quitado)) throw new ErrorValidacion('No encontré ese documento.')
  return { ...inv, documentos: docs.map((d) => (d.id === docId ? { ...d, quitado: true } : d)) }
}

/** Lo que ve la pantalla: sin la ruta interna del archivo y sin los quitados. */
export function documentosVisibles(inv: InversionDocumentBase): Array<Omit<DocumentoInversion, 'storagePath'>> {
  return (inv.documentos ?? []).filter((d) => !d.quitado).map(({ storagePath: _p, ...resto }) => resto)
}
