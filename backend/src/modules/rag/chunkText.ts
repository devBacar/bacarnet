export function chunkText(
  text: string,
  chunkChars: number,
  chunkOverlapChars: number,
): Array<{ chunkIndex: number; charStart: number; charEnd: number; content: string }> {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const stride = Math.max(1, chunkChars - chunkOverlapChars)
  const chunks: Array<{ chunkIndex: number; charStart: number; charEnd: number; content: string }> =
    []

  if (normalized.length <= chunkChars) {
    return [{ chunkIndex: 0, charStart: 0, charEnd: normalized.length, content: normalized }]
  }

  let charStart = 0
  let chunkIndex = 0
  while (charStart < normalized.length) {
    const charEnd = Math.min(normalized.length, charStart + chunkChars)
    const content = normalized.slice(charStart, charEnd).trim()
    if (content) {
      chunks.push({ chunkIndex, charStart, charEnd, content })
      chunkIndex += 1
    }
    if (charEnd >= normalized.length) break
    charStart += stride
  }

  return chunks
}

export function textPreview(text: string, maxLen = 240): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLen) return compact
  return `${compact.slice(0, maxLen - 1)}…`
}
