/** URL de API: same-origin (/api → hosting o proxy Vite) o host absoluto en dev/E2E. */
export function resolveApiUrl(path: string): string {
  const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  if (!apiBase) {
    return new URL(normalizedPath, window.location.origin).href
  }
  if (/^https?:\/\//i.test(apiBase)) {
    return `${apiBase.replace(/\/+$/, '')}${normalizedPath}`
  }
  return new URL(`${apiBase}${normalizedPath}`, window.location.origin).href
}
