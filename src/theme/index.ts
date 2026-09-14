/**
 * Valores de marca en TypeScript (referencia).
 * La fuente de verdad visual está en brand.css — mantener ambos sincronizados.
 */
export const brandTheme = {
  primary: '#1E3A5F',
  primaryHover: '#152d4a',
  primaryLight: '#e8eef5',
  primaryMuted: '#c5d4e4',
  primaryText: '#1E3A5F',
  text: '#202124',
  textMuted: '#5f6368',
  textSubtle: '#80868b',
  navbarBg: '#ffffff',
  navbarBorder: '#dadce0',
  surface: '#ffffff',
  surfaceElevated: '#ffffff',
  surfaceMuted: '#f8f9fa',
} as const

export type BrandTheme = typeof brandTheme
