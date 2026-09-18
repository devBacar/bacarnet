import PDFDocument from 'pdfkit'
import type { CampanaArchivoFila, CampanaArchivoResumen } from './campanaAuditoriaLoad.js'
import type { CampanaProyectosSnapshot, ProyectosPorAreaResumen } from './campanaProyectosResumen.js'

const BRAND = {
  navy: '#1e3a5f',
  white: '#ffffff',
  body: '#111827',
  grayText: '#6b7280',
  grayBorder: '#e5e7eb',
  rowAlt: '#f5f6f8',
  green: '#15803d',
  greenSoft: '#dcfce7',
  mutedIcon: '#9ca3af',
  mutedSoft: '#f3f4f6',
  amber: '#b45309',
  amberSoft: '#fef3c7',
} as const

const MARGIN = 40
const HEADER_BAND_H = 40
const TABLE_ROW_H = 26
const TABLE_HEADER_H = 28

function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right
}

function formatReportDateLong(iso: string): string {
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return iso
  return date.toLocaleString('es-AR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

/** Formato compacto en una sola línea: 14/09 11:33hs */
export function formatCompactDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const day = parts.find((p) => p.type === 'day')?.value ?? '00'
  const month = parts.find((p) => p.type === 'month')?.value ?? '00'
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')} ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}hs`
}

function truncateToWidth(doc: PDFKit.PDFDocument, text: string, maxWidth: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return '—'
  if (doc.widthOfString(clean) <= maxWidth) return clean
  let slice = clean
  while (slice.length > 1 && doc.widthOfString(`${slice}…`) > maxWidth) {
    slice = slice.slice(0, -1)
  }
  return `${slice}…`
}

function normalizeAreaKey(name: string | null | undefined): string {
  if (typeof name !== 'string') return ''
  return name.trim().toLowerCase()
}

function drawHeaderBand(doc: PDFKit.PDFDocument): void {
  doc.save()
  doc.rect(0, 0, doc.page.width, HEADER_BAND_H).fill(BRAND.navy)
  doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(11)
  doc.text('BACARNET · SISTEMAS', MARGIN, 14, {
    width: contentWidth(doc),
    align: 'left',
    lineBreak: false,
  })
  doc.restore()
  doc.y = HEADER_BAND_H + 22
  doc.x = doc.page.margins.left
}

function drawTitleBlock(doc: PDFKit.PDFDocument, generatedAtIso: string): void {
  doc.fillColor(BRAND.body).font('Helvetica-Bold').fontSize(22)
  doc.text('Auditoría de campaña', doc.page.margins.left, doc.y, {
    width: contentWidth(doc),
    lineBreak: false,
  })
  doc.moveDown(0.35)
  doc.fillColor(BRAND.grayText).font('Helvetica').fontSize(10)
  doc.text(formatReportDateLong(generatedAtIso), { lineBreak: false })
  doc.moveDown(1.1)
  doc.fillColor(BRAND.body)
}

type KpiItem = { value: number; label: string }

function drawKpiCards(doc: PDFKit.PDFDocument, items: KpiItem[]): void {
  const gap = 10
  const fullW = contentWidth(doc)
  const row1 = items.slice(0, 3)
  const row2 = items.slice(3)
  const cardW3 = (fullW - gap * 2) / 3
  const cardW2 = (fullW - gap) / 2
  const cardH = 58
  let y = doc.y

  const drawCard = (x: number, w: number, item: KpiItem) => {
    doc.save()
    doc.roundedRect(x, y, w, cardH, 6).lineWidth(1).strokeColor(BRAND.grayBorder).stroke()
    doc.fillColor(BRAND.navy).font('Helvetica-Bold').fontSize(22)
    doc.text(String(item.value), x + 10, y + 10, { width: w - 20, lineBreak: false })
    doc.fillColor(BRAND.grayText).font('Helvetica').fontSize(8)
    doc.text(item.label, x + 10, y + 36, { width: w - 20, lineBreak: false })
    doc.restore()
  }

  row1.forEach((item, i) => {
    drawCard(doc.page.margins.left + i * (cardW3 + gap), cardW3, item)
  })
  y += cardH + gap
  row2.forEach((item, i) => {
    drawCard(doc.page.margins.left + i * (cardW2 + gap), cardW2, item)
  })
  doc.y = y + cardH + 16
}

function drawStatusIcon(
  doc: PDFKit.PDFDocument,
  value: boolean | null,
  cx: number,
  cy: number,
): void {
  const r = 7
  if (value === true) {
    doc.save()
    doc.circle(cx, cy, r).fill(BRAND.greenSoft)
    doc.strokeColor(BRAND.green).lineWidth(1.6).lineCap('round').lineJoin('round')
    doc.moveTo(cx - 3.5, cy).lineTo(cx - 1, cy + 2.5).lineTo(cx + 4, cy - 3).stroke()
    doc.restore()
    return
  }
  if (value === false) {
    doc.save()
    doc.circle(cx, cy, r).fill(BRAND.mutedSoft)
    doc.strokeColor(BRAND.mutedIcon).lineWidth(1.5).lineCap('round')
    doc.moveTo(cx - 3, cy - 3).lineTo(cx + 3, cy + 3).stroke()
    doc.moveTo(cx + 3, cy - 3).lineTo(cx - 3, cy + 3).stroke()
    doc.restore()
    return
  }
  doc.save()
  doc.fillColor(BRAND.grayText).font('Helvetica').fontSize(9)
  doc.text('—', cx - 3, cy - 4, { lineBreak: false })
  doc.restore()
}

type FooterState = {
  page: number
  archivedFootnote?: string
}

function flowFooter(doc: PDFKit.PDFDocument, state: FooterState, label: string): void {
  doc.moveDown(0.6)
  doc.font('Helvetica').fontSize(8).fillColor(BRAND.grayText)
  if (state.archivedFootnote) {
    doc.text(state.archivedFootnote, { align: 'center' })
    doc.moveDown(0.15)
  }
  doc.text(label, { align: 'center', lineBreak: false })
  doc.fillColor(BRAND.body)
  doc.moveDown(0.4)
}

function startNewPage(doc: PDFKit.PDFDocument, state: FooterState, _totalHint?: number): void {
  flowFooter(doc, state, `Página ${state.page}`)
  state.page += 1
  doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGIN })
  doc.x = doc.page.margins.left
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number, state: FooterState, totalHint?: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom - 36
  if (doc.y + height > bottom) {
    startNewPage(doc, state, totalHint)
  }
}

function drawCampaignTable(
  doc: PDFKit.PDFDocument,
  filas: CampanaArchivoFila[],
  state: FooterState,
  totalHint?: number,
): void {
  const colWidths = [118, 108, 198, 108, 108]
  const headers = ['Área', 'Jefe', 'Email', 'Enviado', 'Respondió']
  const tableW = colWidths.reduce((a, b) => a + b, 0)

  ensureSpace(doc, TABLE_HEADER_H + 28, state, totalHint)
  const sectionTitleY = doc.y
  doc.fillColor(BRAND.body).font('Helvetica-Bold').fontSize(13)
  doc.text('Estado de la campaña por área', doc.page.margins.left, sectionTitleY, {
    width: contentWidth(doc),
    lineBreak: false,
  })
  doc.y = sectionTitleY + 18

  const drawTableHeader = () => {
    const y = doc.y
    doc.save()
    doc.rect(doc.page.margins.left, y, tableW, TABLE_HEADER_H).fill(BRAND.navy)
    doc.fillColor(BRAND.white).font('Helvetica-Bold').fontSize(8)
    let x = doc.page.margins.left + 8
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i] ?? '', x, y + 9, { width: (colWidths[i] ?? 0) - 12, lineBreak: false })
      x += colWidths[i] ?? 0
    }
    doc.restore()
    doc.y = y + TABLE_HEADER_H
  }

  drawTableHeader()

  filas.forEach((row, index) => {
    if (doc.y + TABLE_ROW_H > doc.page.height - doc.page.margins.bottom - 36) {
      startNewPage(doc, state, totalHint)
      drawTableHeader()
    }

    const y = doc.y
    const bg = index % 2 === 1 ? BRAND.rowAlt : BRAND.white
    doc.save()
    doc.rect(doc.page.margins.left, y, tableW, TABLE_ROW_H).fill(bg)
    doc.restore()

    doc.font('Helvetica').fontSize(8).fillColor(BRAND.body)
    let x = doc.page.margins.left + 8
    const textY = y + 9

    const texts = [
      row.area ?? '—',
      row.jefe ?? '—',
      row.email ?? '—',
    ]
    for (let i = 0; i < 3; i++) {
      const w = (colWidths[i] ?? 0) - 12
      doc.text(truncateToWidth(doc, texts[i] ?? '—', w), x, textY, { width: w, lineBreak: false })
      x += colWidths[i] ?? 0
    }

    const enviadoDate = formatCompactDateTime(row.fechaEnvio)
    drawStatusIcon(doc, row.enviado, x + 14, y + TABLE_ROW_H / 2)
    if (enviadoDate) {
      doc.fillColor(BRAND.grayText).fontSize(7)
      doc.text(enviadoDate, x + 26, textY + 1, {
        width: (colWidths[3] ?? 0) - 30,
        lineBreak: false,
      })
    }
    x += colWidths[3] ?? 0

    const respDate = formatCompactDateTime(row.fechaRespuesta)
    drawStatusIcon(doc, row.respondido, x + 14, y + TABLE_ROW_H / 2)
    if (respDate) {
      doc.fillColor(BRAND.grayText).fontSize(7)
      doc.text(respDate, x + 26, textY + 1, {
        width: (colWidths[4] ?? 0) - 30,
        lineBreak: false,
      })
    }

    doc.y = y + TABLE_ROW_H
  })

  doc.moveDown(1)
}

function drawProjectCards(
  doc: PDFKit.PDFDocument,
  filas: CampanaArchivoFila[],
  proyectos: CampanaProyectosSnapshot,
  state: FooterState,
  totalHint?: number,
): void {
  const footerReserve = doc.page.margins.bottom + 36
  const minSectionHeight = 120
  if (doc.y + minSectionHeight > doc.page.height - footerReserve) {
    startNewPage(doc, state, totalHint)
  }
  doc.fillColor(BRAND.body).font('Helvetica-Bold').fontSize(13)
  doc.text('Proyectos activos por área', { lineBreak: false })
  doc.moveDown(0.6)

  const proyectosByKey = new Map(
    proyectos.porArea.map((p) => [normalizeAreaKey(p.areaNombre), p]),
  )

  const campaignAreas = filas
    .map((f) => f.area?.trim())
    .filter((a): a is string => Boolean(a))
  const seen = new Set<string>()
  const uniqueCampaignAreas = campaignAreas.filter((a) => {
    const k = normalizeAreaKey(a)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  const withProjects: ProyectosPorAreaResumen[] = []
  const withoutProjects: string[] = []

  for (const areaName of uniqueCampaignAreas) {
    const stats = proyectosByKey.get(normalizeAreaKey(areaName))
    if (stats && stats.activos > 0) withProjects.push(stats)
    else withoutProjects.push(areaName)
  }

  for (const stats of proyectos.porArea) {
    if (stats.activos <= 0) continue
    if (uniqueCampaignAreas.some((a) => normalizeAreaKey(a) === normalizeAreaKey(stats.areaNombre))) {
      continue
    }
    withProjects.push(stats)
  }

  withProjects.sort((a, b) => a.areaNombre.localeCompare(b.areaNombre, 'es'))

  const gap = 10
  const cols = 4
  const cardW = (contentWidth(doc) - gap * (cols - 1)) / cols
  const cardH = 76
  let col = 0
  let rowY = doc.y

  for (const stats of withProjects) {
    if (col === 0) {
      rowY = doc.y
    }

    const x = doc.page.margins.left + col * (cardW + gap)
    doc.save()
    doc.roundedRect(x, rowY, cardW, cardH, 6).lineWidth(1).strokeColor(BRAND.grayBorder).stroke()
    doc.fillColor(BRAND.body).font('Helvetica-Bold').fontSize(8)
    doc.text(truncateToWidth(doc, stats.areaNombre, cardW - 16), x + 8, rowY + 8, {
      width: cardW - 16,
      lineBreak: false,
    })
    doc.fillColor(BRAND.navy).font('Helvetica-Bold').fontSize(20)
    doc.text(String(stats.activos), x + 8, rowY + 24, { width: cardW - 16, lineBreak: false })
    doc.font('Helvetica').fontSize(7).fillColor(BRAND.grayText)
    doc.text('proyectos activos', x + 8, rowY + 46, { width: cardW - 16, lineBreak: false })

    if (stats.urgenciaAlta > 0) {
      doc.fillColor(BRAND.amberSoft)
      doc.roundedRect(x + 8, rowY + 58, cardW - 16, 14, 3).fill()
      doc.fillColor(BRAND.amber).font('Helvetica-Bold').fontSize(7)
      doc.text(`Urgencia alta: ${stats.urgenciaAlta}`, x + 12, rowY + 61, {
        width: cardW - 24,
        lineBreak: false,
      })
    } else {
      doc.fillColor(BRAND.grayText).font('Helvetica').fontSize(7)
      doc.text('Sin urgencia alta', x + 8, rowY + 61, { width: cardW - 16, lineBreak: false })
    }
    doc.restore()

    col += 1
    if (col >= cols) {
      doc.y = rowY + cardH + gap
      col = 0
    }
  }

  if (col > 0) doc.y = rowY + cardH + gap

  if (withoutProjects.length > 0) {
    const footerReserve = doc.page.margins.bottom + 36
    if (doc.y + 22 > doc.page.height - footerReserve) {
      startNewPage(doc, state, totalHint)
    }
    doc.moveDown(0.3)
    doc.fillColor(BRAND.grayText).font('Helvetica-Bold').fontSize(8)
    doc.text('Sin proyectos activos en curso:', { continued: true, lineBreak: false })
    doc.font('Helvetica').text(` ${withoutProjects.join(', ')}`, { lineBreak: true })
  }
}

export type CampanaAuditoriaPdfInput = {
  generatedAtIso: string
  /** Pie de página en PDF archivado (cada hoja). */
  archivedFootnote?: string
  filas: CampanaArchivoFila[]
  resumen: CampanaArchivoResumen
  proyectos: CampanaProyectosSnapshot
}

export function renderCampanaAuditoriaPdf(input: CampanaAuditoriaPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: MARGIN,
    })
    const footerState: FooterState = {
      page: 1,
      archivedFootnote: input.archivedFootnote,
    }
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    drawHeaderBand(doc)
    drawTitleBlock(doc, input.generatedAtIso)

    drawKpiCards(doc, [
      { value: input.resumen.totalAreas, label: 'Áreas en campaña' },
      { value: input.resumen.respondieron, label: 'Respondieron' },
      { value: input.resumen.sinResponder, label: 'Sin responder' },
      { value: input.proyectos.general.totalActivos, label: 'Proyectos activos' },
      { value: input.proyectos.general.urgenciaAlta, label: 'Urgencia alta (activos)' },
    ])

    drawCampaignTable(doc, input.filas, footerState)
    drawProjectCards(doc, input.filas, input.proyectos, footerState)

    flowFooter(doc, footerState, `Página ${footerState.page} de ${footerState.page}`)
    doc.end()
  })
}
