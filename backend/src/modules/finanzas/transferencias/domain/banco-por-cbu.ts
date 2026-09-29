/** Código de entidad (primeros 3 dígitos del CBU) → nombre corto para la agenda. */
const BANCO_POR_CODIGO: Record<string, string> = {
  '007': 'Galicia',
  '011': 'Nación',
  '014': 'Provincia',
  '015': 'ICBC',
  '016': 'Citibank',
  '017': 'BBVA',
  '020': 'Córdoba',
  '027': 'Supervielle',
  '029': 'Ciudad',
  '034': 'Patagonia',
  '044': 'Hipotecario',
  '045': 'San Juan',
  '065': 'Municipal de Rosario',
  '072': 'Santander',
  '083': 'Chubut',
  '086': 'Santa Cruz',
  '093': 'La Pampa',
  '094': 'Corrientes',
  '097': 'Neuquén',
  '143': 'Brubank',
  '150': 'HSBC',
  '191': 'Credicoop',
  '259': 'Itaú',
  '285': 'Macro',
  '299': 'Comafi',
  '305': 'Julio',
  '311': 'Chaco',
  '315': 'Formosa',
  '321': 'Santiago del Estero',
  '330': 'Santa Fe',
  '386': 'Entre Ríos',
}

export function bancoNombreDesdeCbu(cbu: string): string | null {
  const codigo = cbu.replace(/\D/g, '').slice(0, 3)
  if (codigo.length < 3) return null
  return BANCO_POR_CODIGO[codigo] ?? null
}
