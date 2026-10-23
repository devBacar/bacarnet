import { describe, expect, it } from 'vitest'
import { agregarDocumento, documentosVisibles, quitarDocumento, tipoDocumento, validarPdf } from './documentos.js'
import type { DocumentoInversion, InversionDocumentBase } from './inversion.types.js'

const pdf = (bytes = 100) => ({ fileName: 'mutuo.pdf', buffer: Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(bytes)]) })
const doc: DocumentoInversion = { id: 'd1', tipo: 'mutuo', nombre: 'mutuo.pdf', storagePath: 'x/y.pdf', bytes: 100, subidoPor: 'u1', subidoPorNombre: null, subidoAt: '2026-01-01T00:00:00Z' }
const inv = { estado: 'vigente', documentos: [] } as unknown as InversionDocumentBase

describe('documentos de la inversión', () => {
  it('solo PDF de verdad y hasta 10 MB', () => {
    expect(() => validarPdf(pdf())).not.toThrow()
    expect(() => validarPdf({ fileName: 'mutuo.pdf', buffer: Buffer.from('hola') })).toThrow('PDF')
    expect(() => validarPdf(pdf(11 * 1024 * 1024))).toThrow('10 MB')
    expect(() => validarPdf(null)).toThrow('Elegí')
    expect(tipoDocumento('pagare')).toBe('pagare')
    expect(tipoDocumento('cualquiera')).toBe('otro')
  })

  it('agregar, quitar (baja lógica) y la pantalla no ve la ruta interna ni los quitados', () => {
    const con = agregarDocumento(inv, doc)
    expect(documentosVisibles(con)).toEqual([expect.not.objectContaining({ storagePath: expect.anything() })])
    const sin = quitarDocumento(con, 'd1')
    expect(sin.documentos?.[0].quitado).toBe(true)
    expect(documentosVisibles(sin)).toEqual([])
    expect(() => quitarDocumento(sin, 'd1')).toThrow('No encontré')
  })
})
