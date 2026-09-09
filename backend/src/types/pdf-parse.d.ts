declare module 'pdf-parse' {
  type PdfParseResult = {
    text: string
    numpages: number
    numrender: number
    info: unknown
    metadata: unknown
    version: string
  }

  export default function pdfParse(data: Buffer, options?: Record<string, unknown>): Promise<PdfParseResult>
}
