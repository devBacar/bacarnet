/**
 * Genera PDF de auditoría con datos reales (n8n + Firestore) y capturas por página.
 *
 *   npm --prefix backend run build
 *   node backend/scripts/capture-campana-auditoria-pdf-pages.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initAdmin, loadTestEnv } from './get-test-token.mjs'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), 'output')

loadTestEnv()
initAdmin()

const { loadCampanaAuditoriaEnrichedRows, campanaArchivoFilaFromRow, campanaResumenFromFilas } =
  await import('../lib/modules/helpdesk/campanaAuditoriaLoad.js')
const { loadCampanaProyectosSnapshot } = await import('../lib/modules/helpdesk/campanaProyectosResumen.js')
const { renderCampanaAuditoriaPdf } = await import('../lib/modules/helpdesk/campanaAuditoriaPdf.js')

const rows = await loadCampanaAuditoriaEnrichedRows()
const filas = rows.map(campanaArchivoFilaFromRow)
const resumen = campanaResumenFromFilas(filas)
const proyectos = await loadCampanaProyectosSnapshot(filas.map((f) => f.area ?? ''))
const generatedAtIso = new Date().toISOString()

const pdfBuf = await renderCampanaAuditoriaPdf({
  generatedAtIso,
  filas,
  resumen,
  proyectos,
})

mkdirSync(OUT, { recursive: true })
const pdfPath = resolve(OUT, 'campana-auditoria-report.pdf')
writeFileSync(pdfPath, pdfBuf)

const pyScript = `
import sys
import fitz
pdf_path = sys.argv[1]
out_dir = sys.argv[2]
doc = fitz.open(pdf_path)
for i, page in enumerate(doc, start=1):
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    pix.save(f"{out_dir}/campana-auditoria-pdf-page-{i}.png")
print(doc.page_count)
`
const pageCount = Number(
  execFileSync('python', ['-c', pyScript, pdfPath, OUT], { encoding: 'utf8' }).trim(),
)

const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js')
const parsed = await pdfParse(pdfBuf)

console.log(
  JSON.stringify({
    pdfPath,
    pageCount,
    bytes: pdfBuf.length,
    rows: filas.length,
    textSample: parsed.text.slice(0, 220),
    screenshots: OUT,
  }),
)
console.log('PASS: PDF campaña generado y capturado')
