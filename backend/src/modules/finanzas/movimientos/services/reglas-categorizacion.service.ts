import { agendaTimestampToIso } from '../../agenda/domain/agendaTimestamps.js'
import {
  claveNombreCategoria,
  normalizarColorCategoria,
  normalizarGrupoCategoria,
  validarNombreCategoria,
} from '../domain/categoria-movimiento.js'
import {
  categoriaPorIndice,
  claveDescripcionRegla,
  digitosCuit,
  indexarReglas,
  reglaAplicableDesdeDocumento,
  validarCodigoIbRegla,
  validarCuitRegla,
  validarDescripcionRegla,
  type ReglaCategorizacionAplicable,
  type TipoReglaCategorizacion,
} from '../domain/regla-categorizacion.js'
import { SEMILLA_CATEGORIAS_A_RETIRAR, SEMILLA_CATEGORIAS_MOVIMIENTOS, SEMILLA_REGLAS_CUIT } from '../domain/reglas-semilla.js'
import {
  debePasarMovimientoACuit,
  decidirReglaClaveSemilla,
  decidirReglaDescripcionSemilla,
  motivoCategoriaMantenida,
} from '../domain/semilla-decision.js'
import {
  createCategoriaMovimientoDocument,
  deleteCategoriaMovimientoDocument,
  getCategoriaMovimientoDocument,
  listCategoriaMovimientoDocuments,
  updateCategoriaMovimientoDocument,
} from './categorias-movimientos.repository.js'
import {
  countMovimientosPorCategoria,
  eachMovimientoParaCategorizar,
  guardarCategoriasEnBatch,
} from './movimientos.repository.js'
import {
  countReglasPorCategoria,
  createReglaCategorizacionDocument,
  findReglaPorTipoYClave,
  getReglaCategorizacionDocument,
  listReglaCategorizacionDocuments,
  updateReglaCategoria,
  type ReglaCategorizacionDocument,
} from './reglas-categorizacion.repository.js'

export interface ReglaCategorizacionApi {
  id: string
  tipo: TipoReglaCategorizacion
  descripcionExacta: string | null
  codigoIb: string | null
  cuit: string | null
  categoriaId: string
  createdAt: string | null
  createdBy: string
}

export interface AplicacionReglasResultado {
  revisados: number
  categorizados: number
  porCategoria: Record<string, number>
  /** Uso interno de la semilla. La ruta pública no lo devuelve. */
  porCategoriaId: Record<string, number>
}

export interface SemillaReporte {
  simulado: boolean
  categoriasCreadas: Array<{ nombre: string; id: string; grupo: string }>
  categoriasActualizadas: Array<{ nombre: string; id: string; grupo: string }>
  reglasCreadas: Array<{ tipo: TipoReglaCategorizacion; valor: string; categoria: string }>
  reglasMovidas: Array<{ tipo: TipoReglaCategorizacion; valor: string; desde: string; hacia: string }>
  reglasRespetadas: Array<{ tipo: TipoReglaCategorizacion; valor: string; categoriaActual: string }>
  movimientosMigrados: number
  movimientosPorCuit: number
  movimientosRetroactivos: number
  porCategoriaRetroactivo: Record<string, number>
  categoriasRetiradas: Array<{ nombre: string; id: string }>
  categoriasMantenidas: Array<{ nombre: string; motivo: string }>
}

export class ReglaCategorizacionError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ReglaCategorizacionError'
    this.status = status
  }
}

function tipoDocumento(data: ReglaCategorizacionDocument): TipoReglaCategorizacion {
  if (data.tipo === 'codigoIb' || data.tipo === 'cuit') return data.tipo
  return 'descripcion'
}

function serialize(id: string, data: ReglaCategorizacionDocument): ReglaCategorizacionApi {
  const tipo = tipoDocumento(data)
  return {
    id,
    tipo,
    descripcionExacta: tipo === 'descripcion' ? (data.descripcionExacta ?? data.descripcionKey ?? null) : null,
    codigoIb: tipo === 'codigoIb' ? (data.codigoIb ?? data.codigoIbKey ?? null) : null,
    cuit: tipo === 'cuit' ? (data.cuit ?? data.cuitKey ?? null) : null,
    categoriaId: data.categoriaId,
    createdAt: agendaTimestampToIso(data.createdAt),
    createdBy: data.createdBy,
  }
}

function valorVisible(regla: ReglaCategorizacionApi): string {
  return regla.descripcionExacta ?? regla.codigoIb ?? regla.cuit ?? ''
}

export async function listReglasCategorizacionApi(): Promise<ReglaCategorizacionApi[]> {
  const rows = await listReglaCategorizacionDocuments()
  return rows
    .map((row) => serialize(row.id, row.data))
    .sort((a, b) => valorVisible(a).localeCompare(valorVisible(b), 'es') || a.tipo.localeCompare(b.tipo, 'es'))
}

function leerTipo(raw: unknown): TipoReglaCategorizacion {
  if (raw == null || raw === '') return 'descripcion'
  if (raw === 'descripcion' || raw === 'codigoIb' || raw === 'cuit') return raw
  throw new ReglaCategorizacionError('El tipo de regla tiene que ser descripcion, codigoIb o cuit', 400)
}

async function exigirCategoria(categoriaId: unknown): Promise<{ id: string }> {
  if (typeof categoriaId !== 'string' || !categoriaId.trim()) {
    throw new ReglaCategorizacionError('Elegí una categoría para la regla', 400)
  }
  const categoria = await getCategoriaMovimientoDocument(categoriaId.trim())
  if (!categoria) throw new ReglaCategorizacionError('La categoría no existe', 404)
  return { id: categoria.id }
}

function aplicableDe(tipo: TipoReglaCategorizacion, clave: string, categoriaId: string): ReglaCategorizacionAplicable {
  if (tipo === 'cuit') return { tipo, cuitKey: clave, categoriaId }
  if (tipo === 'codigoIb') return { tipo, codigoIbKey: clave, categoriaId }
  return { tipo: 'descripcion', descripcionKey: clave, categoriaId }
}

/**
 * Crea o redirige la regla (mismo tipo + clave no se duplica: se actualiza la categoría)
 * y categoriza retroactivamente solo los movimientos que todavía no tienen categoría
 * y matchean esta regla. La comparación es la normalizada, en memoria.
 */
export async function crearReglaCategorizacion(input: {
  actorUid: string
  body: Record<string, unknown>
}): Promise<{ regla: ReglaCategorizacionApi; creada: boolean; movimientosActualizados: number }> {
  const tipo = leerTipo(input.body.tipo)
  const categoria = await exigirCategoria(input.body.categoriaId)
  let valor: string
  let clave: string
  if (tipo === 'codigoIb') {
    valor = validarCodigoIbRegla(input.body.codigoIb)
    clave = valor
  } else if (tipo === 'cuit') {
    valor = validarCuitRegla(input.body.cuit)
    clave = valor
  } else {
    valor = validarDescripcionRegla(input.body.descripcionExacta)
    clave = claveDescripcionRegla(valor)
  }

  const existente = await findReglaPorTipoYClave(tipo, clave)
  let id: string
  let creada: boolean
  if (existente) {
    id = existente.id
    creada = false
    if (existente.data.categoriaId !== categoria.id) {
      await updateReglaCategoria({ id, categoriaId: categoria.id, updatedBy: input.actorUid })
    }
  } else {
    id = await createReglaCategorizacionDocument({
      tipo,
      valor,
      clave,
      categoriaId: categoria.id,
      createdBy: input.actorUid,
    })
    creada = true
  }

  const aplicado = await aplicarReglasAMovimientosSinCategoria({
    reglas: [aplicableDe(tipo, clave, categoria.id)],
  })

  const guardada = await getReglaCategorizacionDocument(id)
  if (!guardada) throw new Error('No se pudo leer la regla recién guardada')
  return { regla: serialize(guardada.id, guardada.data), creada, movimientosActualizados: aplicado.categorizados }
}

async function nombresCategoria(extra?: ReadonlyMap<string, string>): Promise<Map<string, string>> {
  const nombres = new Map<string, string>()
  const docs = await listCategoriaMovimientoDocuments()
  for (const doc of docs) nombres.set(doc.id, doc.data.nombre)
  if (extra) {
    for (const [id, nombre] of extra) nombres.set(id, nombre)
  }
  return nombres
}

/**
 * Recorre los movimientos sin categoría (de a tandas) y les pone la que indiquen las reglas.
 * Con `simular` no escribe. `reglas` reemplaza las de la base (la semilla lo usa en seco).
 * `excluirIds` saltea movimientos que otra pasada ya iba a categorizar.
 */
export async function aplicarReglasAMovimientosSinCategoria(input: {
  simular?: boolean
  excluirIds?: ReadonlySet<string>
  reglas?: readonly ReglaCategorizacionAplicable[]
  nombresCategoria?: ReadonlyMap<string, string>
} = {}): Promise<AplicacionReglasResultado> {
  const simular = input.simular === true
  const reglas = input.reglas ?? (await reglasAplicablesDesdeDb())
  const indice = indexarReglas(reglas)
  const nombres = await nombresCategoria(input.nombresCategoria)
  const porCategoriaId: Record<string, number> = {}
  let revisados = 0
  let categorizados = 0

  await eachMovimientoParaCategorizar({ kind: 'sinCategoria' }, async (rows) => {
    const updates: Array<{ id: string; categoriaId: string }> = []
    for (const row of rows) {
      if (input.excluirIds?.has(row.id)) continue
      revisados += 1
      const categoriaId = categoriaPorIndice(row, indice)
      if (!categoriaId) continue
      categorizados += 1
      porCategoriaId[categoriaId] = (porCategoriaId[categoriaId] ?? 0) + 1
      updates.push({ id: row.id, categoriaId })
    }
    if (!simular && updates.length > 0) await guardarCategoriasEnBatch(updates)
  })

  const porCategoria: Record<string, number> = {}
  for (const [id, cantidad] of Object.entries(porCategoriaId)) {
    const nombre = nombres.get(id) ?? 'Categoría eliminada'
    porCategoria[nombre] = (porCategoria[nombre] ?? 0) + cantidad
  }
  return { revisados, categorizados, porCategoria, porCategoriaId }
}

async function reglasAplicablesDesdeDb(): Promise<ReglaCategorizacionAplicable[]> {
  const docs = await listReglaCategorizacionDocuments()
  const aplicables: ReglaCategorizacionAplicable[] = []
  for (const doc of docs) {
    const aplicable = reglaAplicableDesdeDocumento(doc.data)
    if (aplicable) aplicables.push(aplicable)
  }
  return aplicables
}

interface CatMem {
  id: string
  nombre: string
  nombreKey: string
  grupo: string | null
}

interface ReglaMem {
  id: string | null
  tipo: TipoReglaCategorizacion
  clave: string
  valor: string
  categoriaId: string
}

interface MigracionDescripcion {
  descripcionKey: string
  origenId: string
  destinoId: string
}

function nombreDe(cats: CatMem[], id: string): string | null {
  return cats.find((cat) => cat.id === id)?.nombre ?? null
}

function buscarRegla(reglas: ReglaMem[], tipo: TipoReglaCategorizacion, clave: string): ReglaMem | null {
  return reglas.find((regla) => regla.tipo === tipo && regla.clave === clave) ?? null
}

function reglaMemDesdeDocumento(id: string, data: ReglaCategorizacionDocument): ReglaMem | null {
  const aplicable = reglaAplicableDesdeDocumento(data)
  if (!aplicable || !aplicable.tipo) return null
  if (aplicable.tipo === 'cuit' && aplicable.cuitKey) {
    return { id, tipo: 'cuit', clave: aplicable.cuitKey, valor: data.cuit ?? aplicable.cuitKey, categoriaId: aplicable.categoriaId }
  }
  if (aplicable.tipo === 'codigoIb' && aplicable.codigoIbKey) {
    return {
      id,
      tipo: 'codigoIb',
      clave: aplicable.codigoIbKey,
      valor: data.codigoIb ?? aplicable.codigoIbKey,
      categoriaId: aplicable.categoriaId,
    }
  }
  if (aplicable.descripcionKey) {
    return {
      id,
      tipo: 'descripcion',
      clave: aplicable.descripcionKey,
      valor: data.descripcionExacta ?? aplicable.descripcionKey,
      categoriaId: aplicable.categoriaId,
    }
  }
  return null
}

function aAplicable(regla: ReglaMem): ReglaCategorizacionAplicable {
  return aplicableDe(regla.tipo, regla.clave, regla.categoriaId)
}

function sumar(mapa: Map<string, number>, id: string | null, delta: number): void {
  if (!id) return
  mapa.set(id, (mapa.get(id) ?? 0) + delta)
}

/**
 * Reorganiza categorías y reglas según la semilla. Idempotente.
 * Con `simular` no escribe, pero el reporte es el de la corrida real
 * (las categorías nuevas salen con id `simulada:…`).
 *
 * Si ya hay una regla de CUIT apuntando a otra categoría, no se cambia la regla
 * y los movimientos elegibles pasan a ESA categoría: si no, la semilla pelearía
 * con lo que decidió el líder.
 */
export async function sembrarReglasCategorizacion(input: {
  actorUid: string
  simular?: boolean
}): Promise<SemillaReporte> {
  const simular = input.simular === true
  const reporte: SemillaReporte = {
    simulado: simular,
    categoriasCreadas: [],
    categoriasActualizadas: [],
    reglasCreadas: [],
    reglasMovidas: [],
    reglasRespetadas: [],
    movimientosMigrados: 0,
    movimientosPorCuit: 0,
    movimientosRetroactivos: 0,
    porCategoriaRetroactivo: {},
    categoriasRetiradas: [],
    categoriasMantenidas: [],
  }

  const cats: CatMem[] = (await listCategoriaMovimientoDocuments()).map((row) => ({
    id: row.id,
    nombre: row.data.nombre,
    nombreKey: row.data.nombreKey || claveNombreCategoria(row.data.nombre),
    grupo: typeof row.data.grupo === 'string' && row.data.grupo.trim() ? row.data.grupo : null,
  }))
  const reglas: ReglaMem[] = []
  for (const row of await listReglaCategorizacionDocuments()) {
    const mem = reglaMemDesdeDocumento(row.id, row.data)
    if (mem) reglas.push(mem)
  }

  const deltaMovimientos = new Map<string, number>()
  const deltaReglas = new Map<string, number>()
  const categoriaProyectada = new Map<string, string>()
  const migraciones: MigracionDescripcion[] = []

  for (const semilla of SEMILLA_CATEGORIAS_MOVIMIENTOS) {
    const nombre = validarNombreCategoria(semilla.nombre)
    const nombreKey = claveNombreCategoria(nombre)
    const grupo = normalizarGrupoCategoria(semilla.grupo)
    if (!grupo) throw new Error(`La categoría ${nombre} de la semilla no tiene grupo`)

    let categoria = cats.find((cat) => cat.nombreKey === nombreKey)
    if (!categoria) {
      const color = normalizarColorCategoria(semilla.color, nombre)
      const id = simular
        ? `simulada:${nombreKey}`
        : await createCategoriaMovimientoDocument({
            nombre,
            nombreKey,
            color,
            grupo,
            createdBy: input.actorUid,
          })
      categoria = { id, nombre, nombreKey, grupo }
      cats.push(categoria)
      reporte.categoriasCreadas.push({ nombre, id, grupo })
    } else if (categoria.grupo !== grupo) {
      if (!simular) await updateCategoriaMovimientoDocument(categoria.id, { grupo })
      categoria.grupo = grupo
      reporte.categoriasActualizadas.push({ nombre: categoria.nombre, id: categoria.id, grupo })
    }

    for (const texto of semilla.descripciones) {
      const valor = validarDescripcionRegla(texto)
      const clave = claveDescripcionRegla(valor)
      const existente = buscarRegla(reglas, 'descripcion', clave)
      const decision = decidirReglaDescripcionSemilla({
        regla: existente ? { categoriaId: existente.categoriaId } : null,
        categoriaSemillaId: categoria.id,
        categoriaActualNombre: existente ? nombreDe(cats, existente.categoriaId) : null,
        reemplazaA: semilla.reemplazaA ?? [],
      })
      if (decision.accion === 'crear') {
        const creada: ReglaMem = { id: null, tipo: 'descripcion', clave, valor, categoriaId: categoria.id }
        if (!simular) {
          creada.id = await createReglaCategorizacionDocument({
            tipo: 'descripcion',
            valor,
            clave,
            categoriaId: categoria.id,
            createdBy: input.actorUid,
          })
        }
        reglas.push(creada)
        sumar(deltaReglas, categoria.id, 1)
        reporte.reglasCreadas.push({ tipo: 'descripcion', valor, categoria: categoria.nombre })
      } else if (decision.accion === 'mover' && existente) {
        const desdeId = existente.categoriaId
        const desde = decision.categoriaActualNombre
        existente.categoriaId = categoria.id
        if (!simular && existente.id) {
          await updateReglaCategoria({ id: existente.id, categoriaId: categoria.id, updatedBy: input.actorUid })
        }
        sumar(deltaReglas, desdeId, -1)
        sumar(deltaReglas, categoria.id, 1)
        migraciones.push({ descripcionKey: clave, origenId: desdeId, destinoId: categoria.id })
        reporte.reglasMovidas.push({ tipo: 'descripcion', valor, desde, hacia: categoria.nombre })
      } else if (decision.accion === 'respetar') {
        reporte.reglasRespetadas.push({ tipo: 'descripcion', valor, categoriaActual: decision.categoriaActualNombre })
      }
    }

    for (const codigo of semilla.codigosIb ?? []) {
      const valor = validarCodigoIbRegla(codigo)
      const existente = buscarRegla(reglas, 'codigoIb', valor)
      const decision = decidirReglaClaveSemilla({
        regla: existente ? { categoriaId: existente.categoriaId } : null,
        categoriaSemillaId: categoria.id,
        categoriaActualNombre: existente ? nombreDe(cats, existente.categoriaId) : null,
      })
      if (decision.accion === 'crear') {
        const creada: ReglaMem = { id: null, tipo: 'codigoIb', clave: valor, valor, categoriaId: categoria.id }
        if (!simular) {
          creada.id = await createReglaCategorizacionDocument({
            tipo: 'codigoIb',
            valor,
            clave: valor,
            categoriaId: categoria.id,
            createdBy: input.actorUid,
          })
        }
        reglas.push(creada)
        sumar(deltaReglas, categoria.id, 1)
        reporte.reglasCreadas.push({ tipo: 'codigoIb', valor, categoria: categoria.nombre })
      } else if (decision.accion === 'respetar') {
        reporte.reglasRespetadas.push({ tipo: 'codigoIb', valor, categoriaActual: decision.categoriaActualNombre })
      }
    }
  }

  const migracionesPorOrigen = new Map<string, MigracionDescripcion[]>()
  for (const migracion of migraciones) {
    const lista = migracionesPorOrigen.get(migracion.origenId) ?? []
    lista.push(migracion)
    migracionesPorOrigen.set(migracion.origenId, lista)
  }
  for (const [origenId, lista] of migracionesPorOrigen) {
    const porClave = new Map(lista.map((item) => [item.descripcionKey, item]))
    await eachMovimientoParaCategorizar({ kind: 'categoria', categoriaId: origenId }, async (rows) => {
      const updates: Array<{ id: string; categoriaId: string }> = []
      for (const row of rows) {
        const migracion = porClave.get(claveDescripcionRegla(row.descripcion))
        if (!migracion) continue
        updates.push({ id: row.id, categoriaId: migracion.destinoId })
        categoriaProyectada.set(row.id, migracion.destinoId)
        reporte.movimientosMigrados += 1
        sumar(deltaMovimientos, origenId, -1)
        sumar(deltaMovimientos, migracion.destinoId, 1)
      }
      if (!simular && updates.length > 0) await guardarCategoriasEnBatch(updates)
    })
  }

  const cuits = new Map<string, string>()
  for (const semilla of SEMILLA_REGLAS_CUIT) {
    const clave = validarCuitRegla(semilla.cuit)
    const nombreKey = claveNombreCategoria(semilla.categoria)
    const categoria = cats.find((cat) => cat.nombreKey === nombreKey)
    if (!categoria) {
      throw new Error(`La semilla de CUIT apunta a una categoría que no está: ${semilla.categoria}`)
    }
    const existente = buscarRegla(reglas, 'cuit', clave)
    const decision = decidirReglaClaveSemilla({
      regla: existente ? { categoriaId: existente.categoriaId } : null,
      categoriaSemillaId: categoria.id,
      categoriaActualNombre: existente ? nombreDe(cats, existente.categoriaId) : null,
    })
    let destinoId = categoria.id
    if (decision.accion === 'crear') {
      const creada: ReglaMem = { id: null, tipo: 'cuit', clave, valor: clave, categoriaId: categoria.id }
      if (!simular) {
        creada.id = await createReglaCategorizacionDocument({
          tipo: 'cuit',
          valor: clave,
          clave,
          categoriaId: categoria.id,
          createdBy: input.actorUid,
        })
      }
      reglas.push(creada)
      sumar(deltaReglas, categoria.id, 1)
      reporte.reglasCreadas.push({ tipo: 'cuit', valor: clave, categoria: categoria.nombre })
    } else if (decision.accion === 'respetar' && existente) {
      destinoId = existente.categoriaId
      reporte.reglasRespetadas.push({
        tipo: 'cuit',
        valor: clave,
        categoriaActual: decision.categoriaActualNombre,
      })
    } else if (existente) {
      destinoId = existente.categoriaId
    }
    cuits.set(clave, destinoId)
  }

  if (cuits.size > 0) {
    const indiceSinCuit = indexarReglas(reglas.filter((regla) => regla.tipo !== 'cuit').map(aAplicable))
    await eachMovimientoParaCategorizar({ kind: 'todos' }, async (rows) => {
      const updates: Array<{ id: string; categoriaId: string }> = []
      for (const row of rows) {
        const cuit = digitosCuit(row.customerCuit)
        const destinoId = cuit ? cuits.get(cuit) : undefined
        if (!destinoId) continue
        const categoriaId = categoriaProyectada.get(row.id) ?? row.categoriaId
        const automatica = categoriaPorIndice(row, indiceSinCuit)
        if (!debePasarMovimientoACuit({ categoriaId, categoriaPorTextoOCodigo: automatica, categoriaCuitId: destinoId })) {
          continue
        }
        updates.push({ id: row.id, categoriaId: destinoId })
        categoriaProyectada.set(row.id, destinoId)
        reporte.movimientosPorCuit += 1
        sumar(deltaMovimientos, categoriaId, -1)
        sumar(deltaMovimientos, destinoId, 1)
      }
      if (!simular && updates.length > 0) await guardarCategoriasEnBatch(updates)
    })
  }

  const retro = await aplicarReglasAMovimientosSinCategoria({
    simular,
    excluirIds: new Set(categoriaProyectada.keys()),
    reglas: reglas.map(aAplicable),
    nombresCategoria: new Map(cats.map((cat) => [cat.id, cat.nombre])),
  })
  reporte.movimientosRetroactivos = retro.categorizados
  reporte.porCategoriaRetroactivo = retro.porCategoria
  for (const [id, cantidad] of Object.entries(retro.porCategoriaId)) sumar(deltaMovimientos, id, cantidad)

  for (const nombre of SEMILLA_CATEGORIAS_A_RETIRAR) {
    const cat = cats.find((item) => item.nombreKey === claveNombreCategoria(nombre))
    if (!cat || cat.id.startsWith('simulada:')) continue
    const movimientosBase = await countMovimientosPorCategoria(cat.id)
    const reglasBase = await countReglasPorCategoria(cat.id)
    const movimientosFinal = Math.max(
      0,
      simular ? movimientosBase + (deltaMovimientos.get(cat.id) ?? 0) : movimientosBase,
    )
    const reglasFinal = Math.max(0, simular ? reglasBase + (deltaReglas.get(cat.id) ?? 0) : reglasBase)
    const motivo = motivoCategoriaMantenida({ movimientos: movimientosFinal, reglas: reglasFinal })
    if (!motivo) {
      if (!simular) await deleteCategoriaMovimientoDocument(cat.id)
      reporte.categoriasRetiradas.push({ nombre: cat.nombre, id: cat.id })
    } else {
      reporte.categoriasMantenidas.push({ nombre: cat.nombre, motivo })
    }
  }

  return reporte
}
