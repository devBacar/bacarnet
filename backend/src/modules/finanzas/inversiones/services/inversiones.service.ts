import { isSuperAdminUser, type AuthedUser } from '../../../auth/middleware.js'
import { capitalEsperadoCentavos, ingresadoCentavos } from '../domain/agenda-plan.js'
import { horizonteSinVencimiento, validarCondiciones } from '../domain/condiciones.js'
import { generarCronograma, totalesDe } from '../domain/cronograma.js'
import { hoyArgentina } from '../domain/fechas.js'
import type { CondicionesInversion, ConfigInversiones, EstadoInversion, InversionDocumentBase } from '../domain/inversion.types.js'
import { ESTADO_INVERSION_TEXTO } from '../domain/seguimiento.js'
import { ErrorValidacion, NoEncontrado, numeroInversion, validarTransicion } from '../domain/validar.js'
import { alertasVista, cuotasVista, deudaHoyCentavos, kpisDe, resumenInversion, type CompromisoDeCuota } from '../domain/vista.js'
import { transicionConAgenda } from './agenda-inversiones.js'
import {
  compromisosDeCuotas,
  getInversionDoc,
  guardarInversionDoc,
  listHistorial,
  type HistorialEstadoDocument,
} from './inversiones.repository.js'
import { getConfigInversiones, getInversorDoc, listInversionesDocs, siguienteNumeroInversion } from './inversores.repository.js'

function puedeAprobar(user: AuthedUser): boolean {
  return isSuperAdminUser(user) || user.permissions.finanzas_inversiones_aprobar === true
}

function cronogramaDe(cond: CondicionesInversion, config: ConfigInversiones, hoy: string) {
  try {
    return generarCronograma(cond, {}, null, { hasta: cond.sinVencimiento ? horizonteSinVencimiento(hoy, config) : null })
  } catch (err) {
    // Los errores del cálculo ya vienen en palabras simples (ver cronograma.ts).
    throw new ErrorValidacion(err instanceof Error ? err.message : 'No pude calcular las cuotas.')
  }
}

function historial(anterior: EstadoInversion | null, nuevo: EstadoInversion, user: AuthedUser, nota: string | null): HistorialEstadoDocument {
  return {
    estadoAnterior: anterior,
    estadoNuevo: nuevo,
    fecha: new Date().toISOString(),
    usuario: user.uid,
    usuarioNombre: user.displayName,
    nota,
  }
}

function notaDe(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  return t ? t.slice(0, 1000) : null
}

async function cargar(id: string): Promise<InversionDocumentBase> {
  const inv = await getInversionDoc(id)
  if (!inv) throw new NoEncontrado('No encontré esa inversión.')
  return inv
}

function vistas(
  docs: ReadonlyArray<{ id: string; data: InversionDocumentBase }>,
  compromisos: Map<string, Map<number, CompromisoDeCuota>>,
  hoy: string,
  config: ConfigInversiones,
) {
  return docs.map(({ id, data }) => {
    const cuotas = cuotasVista(id, data, compromisos.get(id) ?? new Map(), hoy)
    return { id, data, cuotas, resumen: resumenInversion(id, data, cuotas, hoy, config.diasAvisoPorVencer) }
  })
}

/** Resúmenes de inversiones (de un inversor o todas). Lo usa también la ficha del inversor. */
export async function resumenesDeInversiones(inversorId?: string) {
  const [docs, config] = await Promise.all([listInversionesDocs(inversorId), getConfigInversiones()])
  const hoy = hoyArgentina()
  const items = vistas(docs, await compromisosDeCuotas(docs), hoy, config)
  items.sort((a, b) => b.data.fechaAlta.localeCompare(a.data.fechaAlta))
  return { items, hoy }
}

export async function listarInversiones() {
  const { items, hoy } = await resumenesDeInversiones()
  return { inversiones: items.map((i) => i.resumen), kpis: kpisDe(items, hoy) }
}

export async function detalleInversion(id: string, user: AuthedUser) {
  const [inv, config, hist] = await Promise.all([cargar(id), getConfigInversiones(), listHistorial(id)])
  const hoy = hoyArgentina()
  const compromisos = (await compromisosDeCuotas([{ id, data: inv }])).get(id) ?? new Map()
  const cuotas = cuotasVista(id, inv, compromisos, hoy)
  const abierta = inv.estado === 'borrador' || inv.estado === 'pendiente_aprobacion'
  return {
    id,
    numero: inv.numero,
    inversorId: inv.inversorId,
    inversorNombre: inv.inversorNombre,
    estado: inv.estado,
    condiciones: {
      moneda: inv.moneda,
      capitalCentavos: inv.capitalCentavos,
      fechaAlta: inv.fechaAlta,
      sistema: inv.sistema,
      periodicidad: inv.periodicidad,
      cantidadCuotas: inv.cantidadCuotas,
      fechaVencimiento: inv.fechaVencimiento,
      sinVencimiento: inv.sinVencimiento ?? false,
      cuotasPrevias: inv.cuotasPrevias ?? 0,
      tasa: inv.tasa,
      baseDias: inv.baseDias,
      cuotasAMedida: inv.cuotasAMedida ?? null,
      devolucionEnPesos: inv.devolucionEnPesos ?? null,
      medioIngresoPrevisto: inv.medioIngresoPrevisto,
      mediosDevolucion: inv.mediosDevolucion,
      penalidadPrecancelacion: inv.penalidadPrecancelacion,
    },
    cronograma: cuotas,
    totales: totalesDe(inv.cronograma.filter((c) => !c.anulada)),
    ingresos: inv.ingresos,
    ingresoEsperadoCentavos: capitalEsperadoCentavos(inv),
    ingresadoCentavos: ingresadoCentavos(inv.ingresos),
    aprobacion: inv.aprobacion,
    operacionPendiente: inv.operacionPendiente,
    renovacionDe: inv.renovacionDe,
    renovadaEn: inv.renovadaEn,
    alertas: alertasVista(inv, cuotas, hoy, config.diasAvisoPorVencer),
    deudaHoyCentavos: deudaHoyCentavos(inv, cuotas, hoy),
    avisosAgenda: inv.avisosAgenda ?? [],
    indiceAlta: inv.indiceAlta,
    observaciones: inv.observaciones,
    importada: inv.importada,
    historial: hist,
    createdAt: hist.at(-1)?.fecha ?? null,
    createdBy: hist.at(-1)?.usuario ?? '',
    permisos: {
      editar: inv.estado === 'borrador',
      enviar: inv.estado === 'borrador',
      aprobar: inv.estado === 'pendiente_aprobacion' && puedeAprobar(user),
      registrarIngreso: inv.estado === 'vigente',
      operar: false,
      anular: abierta,
    },
  }
}

export async function simular(raw: unknown) {
  const config = await getConfigInversiones()
  const cond = validarCondiciones(raw, config)
  const cronograma = cronogramaDe(cond, config, hoyArgentina())
  return { cronograma, totales: totalesDe(cronograma), avisos: [] as string[], baseDias: cond.baseDias, indiceAlta: null }
}

async function inversorDe(raw: unknown): Promise<{ inversorId: string; inversorNombre: string }> {
  const inversorId = (raw as Record<string, unknown> | null)?.inversorId
  if (typeof inversorId !== 'string' || !inversorId) throw new ErrorValidacion('Elegí el inversor.')
  const inversor = await getInversorDoc(inversorId)
  if (!inversor) throw new ErrorValidacion('No encontré el inversor elegido.')
  if (inversor.estado !== 'activo') throw new ErrorValidacion('Ese inversor está dado de baja.')
  return { inversorId, inversorNombre: inversor.nombre }
}

/** Alta: queda en borrador. El número INV-0001 se reserva recién acá. */
export async function crearInversion(raw: unknown, user: AuthedUser) {
  const config = await getConfigInversiones()
  const cond = validarCondiciones(raw, config)
  const inversor = await inversorDe(raw)
  const cronograma = cronogramaDe(cond, config, hoyArgentina())
  const numero = numeroInversion(await siguienteNumeroInversion())
  const data: InversionDocumentBase = {
    ...cond,
    ...inversor,
    numero,
    estado: 'borrador',
    cronograma,
    ingresos: [],
    aprobacion: null,
    operacionPendiente: null,
    renovacionDe: null,
    renovadaEn: null,
    versionCronograma: 1,
    indiceAlta: null,
    observaciones: notaDe((raw as Record<string, unknown>).observaciones),
    importada: false,
  }
  const id = await guardarInversionDoc(null, data, historial(null, 'borrador', user, 'Alta'))
  return detalleInversion(id, user)
}

export async function editarInversion(id: string, raw: unknown, user: AuthedUser) {
  const config = await getConfigInversiones()
  const cond = validarCondiciones(raw, config)
  const inversor = await inversorDe(raw)
  const cronograma = cronogramaDe(cond, config, hoyArgentina())
  const observaciones = notaDe((raw as Record<string, unknown>).observaciones)
  await transicionConAgenda(id, user.uid, (inv) => {
    if (inv.estado !== 'borrador') throw new ErrorValidacion('Solo se puede editar mientras es borrador.')
    return {
      data: { ...inv, ...cond, ...inversor, cronograma, versionCronograma: inv.versionCronograma + 1, observaciones },
      historial: historial('borrador', 'borrador', user, 'Editada'),
    }
  })
  return detalleInversion(id, user)
}

async function cambiarEstado(
  id: string,
  user: AuthedUser,
  desde: EstadoInversion[],
  hacia: EstadoInversion,
  nota: string | null,
  cambios: (inv: InversionDocumentBase) => Partial<InversionDocumentBase> = () => ({}),
) {
  await transicionConAgenda(id, user.uid, (inv) => {
    validarTransicion(inv.estado, desde, ESTADO_INVERSION_TEXTO)
    return { data: { ...inv, ...cambios(inv), estado: hacia }, historial: historial(inv.estado, hacia, user, nota) }
  })
  return detalleInversion(id, user)
}

export function enviarAAprobacion(id: string, rawNota: unknown, user: AuthedUser) {
  const nota = notaDe(rawNota)
  return cambiarEstado(id, user, ['borrador'], 'pendiente_aprobacion', nota, () => ({
    aprobacion: {
      solicitadaPor: user.uid,
      solicitadaPorNombre: user.displayName,
      solicitadaAt: new Date().toISOString(),
      resueltaPor: null,
      resueltaPorNombre: null,
      resueltaAt: null,
      resultado: null,
      nota,
    },
  }))
}

function resolver(id: string, user: AuthedUser, resultado: 'aprobada' | 'rechazada', nota: string | null) {
  return cambiarEstado(id, user, ['pendiente_aprobacion'], resultado === 'aprobada' ? 'vigente' : 'borrador', nota, (inv) => ({
    aprobacion: {
      ...(inv.aprobacion ?? { solicitadaPor: user.uid, solicitadaPorNombre: user.displayName, solicitadaAt: new Date().toISOString() }),
      resueltaPor: user.uid,
      resueltaPorNombre: user.displayName,
      resueltaAt: new Date().toISOString(),
      resultado,
      nota,
    },
  }))
}

/** Solo el Líder (la ruta ya lo exige con finanzas_inversiones_aprobar). Queda vigente: recién ahí cuenta para la Agenda. */
export function aprobarInversion(id: string, rawNota: unknown, user: AuthedUser) {
  return resolver(id, user, 'aprobada', notaDe(rawNota))
}

/** Rechazada vuelve a borrador para que se corrija; el motivo queda en la aprobación y en el historial. */
export function rechazarInversion(id: string, rawMotivo: unknown, user: AuthedUser) {
  const motivo = notaDe(rawMotivo)
  if (!motivo) throw new ErrorValidacion('Contá por qué se rechaza.')
  return resolver(id, user, 'rechazada', motivo)
}

/** Baja lógica de una inversión que todavía no está vigente (REGLAS 5.1: no se borra). */
export function anularInversion(id: string, rawMotivo: unknown, user: AuthedUser) {
  const motivo = notaDe(rawMotivo)
  if (!motivo) throw new ErrorValidacion('Contá por qué se anula.')
  return cambiarEstado(id, user, ['borrador', 'pendiente_aprobacion'], 'anulada', motivo)
}
