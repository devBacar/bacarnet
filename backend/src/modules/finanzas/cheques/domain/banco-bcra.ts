/** Tabla de entidades financieras BCRA (fuente: api.bcra.gob.ar/cheques/v1.0/entidades). */

interface EntidadBcra {
  codigo: number
  denominacion: string
  corto: string
}

const ENTIDADES: EntidadBcra[] = [
  { codigo: 5, denominacion: 'The Royal Bank of Scotland N.V.', corto: 'Royal Bank of Scotland' },
  { codigo: 7, denominacion: 'BANCO DE GALICIA Y BUENOS AIRES S.A.', corto: 'Galicia' },
  { codigo: 11, denominacion: 'BANCO DE LA NACION ARGENTINA', corto: 'Nación' },
  { codigo: 14, denominacion: 'BANCO DE LA PROVINCIA DE BUENOS AIRES', corto: 'Provincia' },
  { codigo: 15, denominacion: 'INDUSTRIAL AND COMMERCIAL BANK OF CHINA', corto: 'ICBC' },
  { codigo: 16, denominacion: 'CITIBANK N.A.', corto: 'Citibank' },
  { codigo: 17, denominacion: 'BANCO BBVA ARGENTINA S.A.', corto: 'BBVA' },
  { codigo: 18, denominacion: 'MUFG BANK, LTD', corto: 'MUFG' },
  { codigo: 20, denominacion: 'BANCO DE LA PROVINCIA DE CORDOBA S.A.', corto: 'Córdoba' },
  { codigo: 27, denominacion: 'BANCO SUPERVIELLE S.A.', corto: 'Supervielle' },
  { codigo: 29, denominacion: 'BANCO DE LA CIUDAD DE BUENOS AIRES', corto: 'Ciudad' },
  { codigo: 34, denominacion: 'BANCO PATAGONIA S.A.', corto: 'Patagonia' },
  { codigo: 44, denominacion: 'BANCO HIPOTECARIO S.A.', corto: 'Hipotecario' },
  { codigo: 45, denominacion: 'BANCO DE SAN JUAN S.A.', corto: 'San Juan' },
  { codigo: 60, denominacion: 'BANCO DEL TUCUMAN S.A.', corto: 'Tucumán' },
  { codigo: 65, denominacion: 'BANCO MUNICIPAL DE ROSARIO', corto: 'Municipal Rosario' },
  { codigo: 72, denominacion: 'BANCO SANTANDER ARGENTINA S.A.', corto: 'Santander' },
  { codigo: 79, denominacion: 'BANCO REGIONAL DE CUYO S.A.', corto: 'Regional Cuyo' },
  { codigo: 83, denominacion: 'BANCO DEL CHUBUT S.A.', corto: 'Chubut' },
  { codigo: 86, denominacion: 'BANCO DE SANTA CRUZ S.A.', corto: 'Santa Cruz' },
  { codigo: 93, denominacion: 'LA PAMPA SA', corto: 'La Pampa' },
  { codigo: 94, denominacion: 'BANCO DE CORRIENTES S.A.', corto: 'Corrientes' },
  { codigo: 97, denominacion: 'BANCO PROVINCIA DEL NEUQUEN S.A.', corto: 'Neuquén' },
  { codigo: 147, denominacion: 'BIBANK S.A.', corto: 'Bibank' },
  { codigo: 150, denominacion: 'Banco GGAL SA', corto: 'Galicia Más' },
  { codigo: 191, denominacion: 'BANCO CREDICOOP COOPERATIVO LIMITADO', corto: 'Credicoop' },
  { codigo: 198, denominacion: 'BANCO DE VALORES S.A.', corto: 'Valores' },
  { codigo: 247, denominacion: 'BANCO ROELA S.A.', corto: 'Roela' },
  { codigo: 254, denominacion: 'BANCO MARIVA S.A.', corto: 'Mariva' },
  { codigo: 259, denominacion: 'BANCO BMA S.A.U.', corto: 'BMA' },
  { codigo: 266, denominacion: 'BNP PARIBAS', corto: 'BNP Paribas' },
  { codigo: 268, denominacion: 'BANCO PROVINCIA DE TIERRA DEL FUEGO', corto: 'Tierra del Fuego' },
  { codigo: 277, denominacion: 'BANCO SAENZ S.A.', corto: 'Saenz' },
  { codigo: 281, denominacion: 'BANCO MERIDIAN S.A.', corto: 'Meridian' },
  { codigo: 285, denominacion: 'BANCO MACRO S.A.', corto: 'Macro' },
  { codigo: 297, denominacion: 'BANCO BANEX S.A.', corto: 'Banex' },
  { codigo: 299, denominacion: 'BANCO COMAFI SOCIEDAD ANONIMA', corto: 'Comafi' },
  { codigo: 301, denominacion: 'BANCO PIANO S.A.', corto: 'Piano' },
  { codigo: 303, denominacion: 'BANCO FINANSUR S.A.', corto: 'Finansur' },
  { codigo: 305, denominacion: 'BANCO JULIO SOCIEDAD ANONIMA', corto: 'Julio' },
  { codigo: 306, denominacion: 'BANCO PRIVADO DE INVERSIONES S.A.', corto: 'BPI' },
  { codigo: 309, denominacion: 'BANCO RIOJA SOCIEDAD ANÓNIMA UNIPERSONAL', corto: 'Rioja' },
  { codigo: 310, denominacion: 'BANCO DEL SOL S.A.', corto: 'Del Sol' },
  { codigo: 311, denominacion: 'NUEVO BANCO DEL CHACO S. A.', corto: 'Nuevo Chaco' },
  { codigo: 315, denominacion: 'BANCO DE FORMOSA S.A.', corto: 'Formosa' },
  { codigo: 319, denominacion: 'BANCO CMF S.A.', corto: 'CMF' },
  { codigo: 321, denominacion: 'BANCO DE SANTIAGO DEL ESTERO S.A.', corto: 'Santiago del Estero' },
  { codigo: 322, denominacion: 'BANCO INDUSTRIAL', corto: 'Industrial' },
  { codigo: 330, denominacion: 'NUEVO BANCO DE SANTA FE SOCIEDAD ANONIMA', corto: 'Nuevo Santa Fe' },
  { codigo: 336, denominacion: 'BANCO BRADESCO ARGENTINA S.A.U.', corto: 'Bradesco' },
  { codigo: 338, denominacion: 'BANCO DE SERVICIOS Y TRANSACCIONES SAU', corto: 'BST' },
  { codigo: 341, denominacion: 'BANCO MASVENTAS S.A.', corto: 'Masventas' },
  { codigo: 386, denominacion: 'NUEVO BANCO DE ENTRE RÍOS S.A.', corto: 'Nuevo Entre Ríos' },
  { codigo: 389, denominacion: 'BANCO COLUMBIA S.A.', corto: 'Columbia' },
  { codigo: 426, denominacion: 'BANCO BICA S.A.', corto: 'Bica' },
  { codigo: 431, denominacion: 'BANCO COINAG S.A.', corto: 'Coinag' },
  { codigo: 432, denominacion: 'BANCO DE COMERCIO S.A.', corto: 'Comercio' },
  { codigo: 435, denominacion: 'BANCO SUCREDITO REGIONAL S.A.U.', corto: 'Sucrédito' },
  { codigo: 448, denominacion: 'BANCO DINO S.A.', corto: 'Dino' },
]

const BY_CODIGO = new Map<number, EntidadBcra>()
for (const e of ENTIDADES) BY_CODIGO.set(e.codigo, e)

/**
 * Aliases: nombre informal (lowercase) → código BCRA.
 * Generados de los datos reales de Oficiales + variantes comunes.
 */
const ALIAS: Record<string, number> = {
  // Nación (11)
  'nacion': 11, 'nación': 11, 'banco nacion': 11, 'banco nación': 11,
  'banco de la nacion argentina': 11,

  // Galicia (7)
  'galicia': 7, 'banco galicia': 7, 'banco de galicia': 7,
  'banco de galicia y buenos aires s.a.': 7,

  // Galicia Más / GGAL (150)
  'galicia mas': 150, 'galicia más': 150, 'ggal': 150, 'banco ggal': 150,

  // Córdoba (20)
  'cordoba': 20, 'córdoba': 20, 'banco cordoba': 20, 'banco córdoba': 20,
  'banco de la provincia de cordoba s.a.': 20, 'provincia de cordoba': 20,

  // Macro (285)
  'macro': 285, 'banco macro': 285, 'banco macro s.a.': 285,

  // Santander (72)
  'santander': 72, 'banco santander': 72, 'santander rio': 72, 'santander río': 72,
  'banco santander argentina s.a.': 72,

  // BBVA (17)
  'bbva': 17, 'bbva frances': 17, 'bbva francés': 17, 'frances': 17, 'francés': 17,
  'banco bbva': 17, 'banco bbva argentina s.a.': 17,

  // Credicoop (191)
  'credicoop': 191, 'banco credicoop': 191,
  'banco credicoop cooperativo limitado': 191,

  // Supervielle (27)
  'supervielle': 27, 'banco supervielle': 27,

  // Patagonia (34)
  'patagonia': 34, 'banco patagonia': 34,

  // Provincia Buenos Aires (14)
  'buenos aires': 14, 'provincia': 14, 'banco provincia': 14,
  'banco de la provincia de buenos aires': 14,

  // ICBC / Bankboston (15)
  'icbc': 15, 'bankboston': 15, 'banco icbc': 15,
  'industrial and commercial bank of china': 15,

  // Citibank (16)
  'citibank': 16, 'citi': 16, 'citibank n.a.': 16,

  // Nuevo Santa Fe (330)
  'nuevo santa fe': 330, 'santa fe': 330, 'nuevo banco de santa fe': 330,

  // Rioja (309)
  'rioja': 309, 'nuevorioja': 309, 'nuevo rioja': 309, 'banco rioja': 309,

  // Roela (247)
  'roela': 247, 'banco roela': 247,

  // La Pampa (93)
  'pampa': 93, 'la pampa': 93, 'banco pampa': 93,

  // Comafi (299)
  'comafi': 299, 'banco comafi': 299,

  // Julio (305)
  'julio': 305, 'banco julio': 305, 'banco julio s.a.': 305,
  'banco julio sociedad anonima': 305,

  // Industrial / Nuevo Industrial de Azul (322)
  'industrial': 322, 'banco industrial': 322,
  'nuevo industrial de azul': 322,

  // Nuevo Chaco (311)
  'nuevo chaco': 311, 'chaco': 311, 'nuevo del chaco': 311,
  'nuevo banco del chaco': 311,

  // Santiago del Estero (321)
  'santiago del estero': 321, 'banco santiago del estero': 321,

  // Ciudad (29)
  'ciudad': 29, 'ciudad buenos aires': 29,
  'banco de la ciudad de buenos aires': 29, 'banco ciudad': 29,

  // Corrientes (94)
  'corrientes': 94, 'banco corrientes': 94, 'banco de corrientes': 94,

  // San Juan (45)
  'san juan': 45, 'banco san juan': 45,

  // Santa Cruz (86)
  'santa cruz': 86, 'banco santa cruz': 86,

  // Municipal Rosario (65)
  'municipal': 65, 'municipal rosario': 65, 'banco municipal': 65,

  // Hipotecario (44)
  'hipotecario': 44, 'banco hipotecario': 44,

  // Bica (426)
  'bica': 426, 'banco bica': 426,

  // Dino / Finandino (448)
  'dino': 448, 'banco dino': 448,
  'finandino': 448, 'finandino compañia financiera': 448, 'finandino compania financiera': 448,

  // Tucumán (60)
  'tucuman': 60, 'tucumán': 60, 'banco tucuman': 60, 'banco del tucuman': 60,

  // Entre Ríos (386)
  'entre rios': 386, 'entre ríos': 386, 'nuevo entre rios': 386,
  'nuevo banco de entre rios': 386,

  // Chubut (83)
  'chubut': 83, 'banco chubut': 83, 'banco del chubut': 83,

  // Neuquén (97)
  'neuquen': 97, 'neuquén': 97, 'banco neuquen': 97,

  // Tierra del Fuego (268)
  'tierra del fuego': 268,

  // Columbia (389)
  'columbia': 389, 'banco columbia': 389,

  // Piano (301)
  'piano': 301, 'banco piano': 301,

  // Mariva (254)
  'mariva': 254, 'banco mariva': 254,

  // Valores (198)
  'valores': 198, 'banco de valores': 198,

  // BMA (259)
  'bma': 259, 'banco bma': 259,

  // Formosa (315)
  'formosa': 315, 'banco formosa': 315, 'banco de formosa': 315,

  // Regional Cuyo (79)
  'regional cuyo': 79, 'cuyo': 79, 'banco regional de cuyo': 79,
}

const FISICO_RE = /^(\d{3})-\d{3}-\d{4}-\d{8}$/

function extraerCodigoDeNumero(numero: string): number | null {
  const m = FISICO_RE.exec(numero.trim())
  if (!m) return null
  const code = parseInt(m[1], 10)
  return BY_CODIGO.has(code) ? code : null
}

function buscarPorNombre(nombre: string): number | null {
  const key = nombre.toLowerCase().trim()
  if (!key) return null
  return ALIAS[key] ?? null
}

export interface BancoResuelto {
  bancoEmisorCodigo: number | null
  bancoEmisor: string | null
}

export function resolverBanco(input: {
  idbanco?: number | null
  numero?: string | null
  nombre?: string | null
}): BancoResuelto {
  // 1. Código directo del Excel
  if (input.idbanco != null) {
    const entidad = BY_CODIGO.get(input.idbanco)
    if (entidad) return { bancoEmisorCodigo: entidad.codigo, bancoEmisor: entidad.corto }
  }

  // 2. Extraer del número de cheque físico
  if (input.numero) {
    const code = extraerCodigoDeNumero(input.numero)
    if (code != null) {
      const entidad = BY_CODIGO.get(code)!
      return { bancoEmisorCodigo: entidad.codigo, bancoEmisor: entidad.corto }
    }
  }

  // 3. Match por nombre
  if (input.nombre) {
    const code = buscarPorNombre(input.nombre)
    if (code != null) {
      const entidad = BY_CODIGO.get(code)!
      return { bancoEmisorCodigo: entidad.codigo, bancoEmisor: entidad.corto }
    }
  }

  // 4. Fallback: mantener nombre original
  return { bancoEmisorCodigo: null, bancoEmisor: input.nombre?.trim() || null }
}

export function nombreBancoPorCodigo(codigo: number): string | null {
  return BY_CODIGO.get(codigo)?.corto ?? null
}
