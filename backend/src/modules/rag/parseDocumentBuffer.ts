import mammoth from 'mammoth'
import pdfParse from 'pdf-parse'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'

const OFFICE_WORD_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
])

const OFFICE_SHEET_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
])

const OFFICE_PRESENTATION_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
])

const OPEN_DOCUMENT_MIMES = new Set([
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
])

export const BINARY_DOCUMENT_MIMES = new Set([
  'application/pdf',
  ...OFFICE_WORD_MIMES,
  ...OFFICE_SHEET_MIMES,
  ...OFFICE_PRESENTATION_MIMES,
  ...OPEN_DOCUMENT_MIMES,
])

export function isBinaryDocumentMime(mimeType: string): boolean {
  return BINARY_DOCUMENT_MIMES.has(mimeType.trim().toLowerCase())
}

function normalizeExtractedText(text: string): string {
  return text.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim()
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parsed = await pdfParse(buffer)
  return normalizeExtractedText(parsed.text ?? '')
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer })
  return normalizeExtractedText(result.value ?? '')
}

function extractSpreadsheetText(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const parts: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim()
    if (!csv) continue
    parts.push(`***REMOVED*** ${sheetName}\n${csv}`)
  }

  return normalizeExtractedText(parts.join('\n\n'))
}

async function extractOpenDocumentText(buffer: Buffer, kind: 'text' | 'spreadsheet'): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const contentPath = kind === 'spreadsheet' ? 'content.xml' : 'content.xml'
  const xml = await zip.file(contentPath)?.async('string')
  if (!xml) return ''

  const texts = [...xml.matchAll(/<text:p[^>]*>([\s\S]*?)<\/text:p>/g)]
    .map((match) =>
      match[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean)

  if (kind === 'spreadsheet') {
    const cells = [...xml.matchAll(/<text:p[^>]*>([\s\S]*?)<\/text:p>/g)]
      .map((match) => match[1].replace(/<[^>]+>/g, '').trim())
      .filter(Boolean)
    return normalizeExtractedText(cells.join('\n'))
  }

  return normalizeExtractedText(texts.join('\n\n'))
}

async function extractPptxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  const parts: string[] = []
  for (const path of slidePaths) {
    const xml = await zip.files[path].async('string')
    const texts = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)]
      .map((match) =>
        match[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim(),
      )
      .filter(Boolean)
    if (texts.length > 0) {
      parts.push(texts.join(' '))
    }
  }

  return normalizeExtractedText(parts.join('\n\n'))
}

export async function parseDocumentBuffer(mimeType: string, buffer: Buffer): Promise<string> {
  const mime = mimeType.trim().toLowerCase()

  if (mime === 'application/pdf') {
    return extractPdfText(buffer)
  }

  if (OFFICE_WORD_MIMES.has(mime)) {
    if (mime === 'application/msword') {
      throw new Error('Formato .doc legacy no soportado en piloto; convertí a .docx')
    }
    return extractDocxText(buffer)
  }

  if (OFFICE_SHEET_MIMES.has(mime)) {
    if (mime === 'application/vnd.ms-excel') {
      throw new Error('Formato .xls legacy no soportado en piloto; convertí a .xlsx')
    }
    return extractSpreadsheetText(buffer)
  }

  if (OPEN_DOCUMENT_MIMES.has(mime)) {
    return extractOpenDocumentText(
      buffer,
      mime === 'application/vnd.oasis.opendocument.spreadsheet' ? 'spreadsheet' : 'text',
    )
  }

  if (OFFICE_PRESENTATION_MIMES.has(mime)) {
    if (mime === 'application/vnd.ms-powerpoint') {
      throw new Error('Formato .ppt legacy no soportado en piloto; convertí a .pptx')
    }
    return extractPptxText(buffer)
  }

  throw new Error(`MIME binario no soportado: ${mimeType}`)
}
