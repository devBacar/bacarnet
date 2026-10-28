/**
 * Regla de cheques de Vientri (verificada con consultas sobre la copia del 15/10/2026):
 * - La tabla Chq tiene los cheques recibidos Y los cheques/echeqs emitidos por BACAR.
 *   Emitido o recibido se decide por el librador (librador_es_bacar), no por la tabla.
 * - CHQOCA tiene cheques de papel emitidos. Algunos están también en Chq, otros solo en CHQOCA.
 *   Se unen por IDCHQ con el mismo importe, o por serie (últimos 8 dígitos) + banco + importe.
 *   Si hay más de un candidato no se adivina: queda separado y marcado para revisar.
 * - Un cheque de Chq dado de baja con otro vivo del mismo número se descarta (se volvió a cargar).
 * - Estados de Chq confirmados en Vientri: 4 Pago a proveedor, 8 Vendido, 10 Pago confirmado a proveedor.
 *   1, 2 y 13 se infirieron de los datos (en cartera, depositado, rechazado).
 */
import type { FilaCsv } from './csv.js'
import { refPersona } from './personas.js'
import type { EstadoChequeVientri, VientriChequeDoc, VientriPersonaDoc } from './tipos.js'
import { aBool, aCentavos, aCuit, aEntero, aFecha, aTexto, fechaImposible, serieCheque } from './valores.js'

export const COLUMNAS_CHEQUES = [
  'vientri_id', 'numero', 'id_banco', 'echeq', 'librador_es_bacar', 'importe', 'id_estado', 'fecha_vto', 'baja',
] as const

export const COLUMNAS_CHEQUES_PROPIOS = [
  'vientri_id', 'numero', 'numero_completo', 'id_banco', 'importe', 'pagado', 'fecha_vto', 'id_cheque', 'baja',
] as const

export const NOMBRE_ESTADO_CHQ: Record<number, string> = {
  1: 'En cartera',
  2: 'Depositado',
  4: 'Pago a proveedor',
  5: 'Renovado',
  8: 'Vendido',
  10: 'Pago confirmado a proveedor',
  13: 'Rechazado',
}

export function estadoDesdeChq(idEstado: number | null, emitido: boolean, rechazado: boolean): EstadoChequeVientri {
  if (rechazado || idEstado === 13) return 'rechazado'
  switch (idEstado) {
    case 1:
      return 'en_cartera'
    case 2:
      return 'depositado'
    case 5:
      return 'renovado'
    case 8:
      return 'vendido'
    case 4:
      return emitido ? 'pendiente_debito' : 'entregado'
    case 10:
      return emitido ? 'debitado' : 'entregado'
    default:
      return 'otro'
  }
}

export interface Catalogos {
  personas: Map<number, VientriPersonaDoc>
  bancos: Map<number, string>
  comprobantes?: Map<number, string>
}

interface ChqLeido {
  fila: FilaCsv
  id: number
  serie: string
  bancoId: number | null
  centavos: number
  baja: boolean
  emitido: boolean
  usado: boolean
}

function claveCruce(banco: number | null, serie: string, centavos: number): string {
  return `${banco ?? 'x'}|${serie}|${centavos}`
}

function desdeChq(c: ChqLeido, cat: Catalogos): VientriChequeDoc {
  const f = c.fila
  const idEstado = aEntero(f.id_estado)
  const rechazado = aBool(f.rechazado)
  const echeq = aBool(f.echeq) || /e-?cheq/i.test(f.numero ?? '')
  const revisar: string[] = []
  const fechaVencimiento = aFecha(f.fecha_vto)
  if (fechaImposible(fechaVencimiento)) revisar.push(`Fecha de vencimiento imposible (${fechaVencimiento})`)
  let estado = estadoDesdeChq(idEstado, c.emitido, rechazado)
  if (estado === 'otro') revisar.push(`Estado de Vientri desconocido (${idEstado ?? 'vacío'})`)
  if (c.baja) estado = 'anulado'
  if (c.centavos <= 0) revisar.push('Importe cero o negativo')
  const libradorId = aEntero(f.id_persona_librador)
  const libradorRef = refPersona(cat.personas, libradorId)
  const librador = libradorRef ?? (aCuit(f.cuit_librador) ? { vientriId: 0, nombre: null, cuit: aCuit(f.cuit_librador) } : null)
  const idCmpIngreso = aEntero(f.id_cmp_ingreso)
  const idCmpSalida = aEntero(f.id_cmp_salida)
  return {
    clave: `chq-${c.id}`,
    direccion: c.emitido ? 'emitido' : 'recibido',
    tipo: echeq ? 'echeq' : 'fisico',
    numero: (f.numero ?? '').trim(),
    serie: c.serie,
    bancoId: c.bancoId,
    bancoNombre: c.bancoId !== null ? cat.bancos.get(c.bancoId) ?? null : null,
    montoCentavos: c.centavos,
    fechaEmision: aFecha(f.fecha_emision),
    fechaVencimiento,
    fechaRecibido: aFecha(f.fecha_recibido),
    fechaDeposito: aFecha(f.fecha_deposito),
    fechaEntregado: aFecha(f.fecha_entregado),
    fechaConciliado: null,
    estado,
    estadoVientri: idEstado !== null ? NOMBRE_ESTADO_CHQ[idEstado] ?? `Estado ${idEstado}` : 'Sin estado',
    estadoVientriId: idEstado,
    librador,
    entregadoPor: refPersona(cat.personas, aEntero(f.id_persona_entrega)),
    entregadoA: refPersona(cat.personas, aEntero(f.id_persona_recibe)),
    destinatario: null,
    idCmpIngreso,
    cmpIngresoDesc: idCmpIngreso !== null ? (cat.comprobantes?.get(idCmpIngreso) ?? null) : null,
    idCmpSalida,
    cmpSalidaDesc: idCmpSalida !== null ? (cat.comprobantes?.get(idCmpSalida) ?? null) : null,
    idCmpNdRechazo: aEntero(f.id_cmp_nd_rechazo),
    idCmpPagoBanco: aEntero(f.id_cmp_pago_banco),
    estadoPrevioId: aEntero(f.id_estado_previo),
    motivoRechazoId: aEntero(f.id_motivo_rechazo),
    fuentes: ['Chq'],
    vientriChqId: c.id,
    vientriChqocaId: null,
    baja: c.baja,
    revisar,
    fecsys: aTexto(f.fecsys),
  }
}

export interface ResultadoCheques {
  cheques: VientriChequeDoc[]
  resumen: {
    chq: number
    chqoca: number
    unidosPorId: number
    unidosPorNumero: number
    soloChqoca: number
    bajasReemplazadas: number
    renovados: number
    ambiguos: number
  }
}

export function armarCheques(filasChq: FilaCsv[], filasChqoca: FilaCsv[], cat: Catalogos): ResultadoCheques {
  const resumen = { chq: filasChq.length, chqoca: filasChqoca.length, unidosPorId: 0, unidosPorNumero: 0, soloChqoca: 0, bajasReemplazadas: 0, renovados: 0, ambiguos: 0 }

  const leidos: ChqLeido[] = []
  for (const f of filasChq) {
    const id = aEntero(f.vientri_id)
    if (id === null) continue
    leidos.push({
      fila: f,
      id,
      serie: serieCheque(f.numero),
      bancoId: aEntero(f.id_banco),
      centavos: aCentavos(f.importe) ?? 0,
      baja: aBool(f.baja),
      emitido: aBool(f.librador_es_bacar),
      usado: false,
    })
  }

  // Bajas que se volvieron a cargar: hay otro cheque vivo con la misma serie y banco.
  const vivos = new Set(leidos.filter((c) => !c.baja).map((c) => `${c.bancoId ?? 'x'}|${c.serie}`))
  const vigentes = leidos.filter((c) => {
    if (c.baja && vivos.has(`${c.bancoId ?? 'x'}|${c.serie}`)) {
      resumen.bajasReemplazadas++
      return false
    }
    return true
  })

  for (const c of vigentes) {
    if (!c.baja && aEntero(c.fila.id_estado) === 5) resumen.renovados++
  }

  const porId = new Map(vigentes.map((c) => [c.id, c]))
  const porClave = new Map<string, ChqLeido[]>()
  for (const c of vigentes) {
    if (!c.emitido) continue
    const k = claveCruce(c.bancoId, c.serie, c.centavos)
    const lista = porClave.get(k) ?? []
    lista.push(c)
    porClave.set(k, lista)
  }

  const docs = new Map<number, VientriChequeDoc>()
  for (const c of vigentes) docs.set(c.id, desdeChq(c, cat))
  const extras: VientriChequeDoc[] = []

  for (const o of filasChqoca) {
    const oid = aEntero(o.vientri_id)
    if (oid === null) continue
    const centavos = aCentavos(o.importe) ?? 0
    const bancoId = aEntero(o.id_banco)
    const serie = serieCheque(o.numero_completo || o.numero)
    const bajaOca = aBool(o.baja)

    let pareja: ChqLeido | null = null
    const porEnlace = porId.get(aEntero(o.id_cheque) ?? -1)
    if (porEnlace && porEnlace.centavos === centavos && !porEnlace.usado) {
      pareja = porEnlace
      resumen.unidosPorId++
    } else {
      const candidatos = (porClave.get(claveCruce(bancoId, serie, centavos)) ?? []).filter((c) => !c.usado)
      if (candidatos.length === 1) {
        pareja = candidatos[0]
        resumen.unidosPorNumero++
      } else if (candidatos.length > 1) {
        resumen.ambiguos++
      }
    }

    if (pareja) {
      pareja.usado = true
      const d = docs.get(pareja.id)
      if (d) {
        d.fuentes = ['Chq', 'CHQOCA']
        d.vientriChqocaId = oid
        d.fechaConciliado = aFecha(o.fecha_conciliado)
        d.destinatario = aTexto(o.destinatario)
        d.entregadoA = d.entregadoA ?? refPersona(cat.personas, aEntero(o.id_persona_recibe))
        if (d.direccion === 'emitido' && d.estado === 'pendiente_debito' && (aBool(o.pagado) || d.fechaConciliado)) {
          d.estado = 'debitado'
        }
      }
      continue
    }

    resumen.soloChqoca++
    const fechaVencimiento = aFecha(o.fecha_vto)
    const revisar: string[] = []
    if (fechaImposible(fechaVencimiento)) revisar.push(`Fecha de vencimiento imposible (${fechaVencimiento})`)
    if (centavos <= 0) revisar.push('Importe cero o negativo')
    const pagado = aBool(o.pagado) || aFecha(o.fecha_conciliado) !== null
    extras.push({
      clave: `oca-${oid}`,
      direccion: 'emitido',
      tipo: 'fisico',
      numero: (o.numero_completo || o.numero || '').trim(),
      serie,
      bancoId,
      bancoNombre: bancoId !== null ? cat.bancos.get(bancoId) ?? null : null,
      montoCentavos: centavos,
      fechaEmision: aFecha(o.fecha_emision),
      fechaVencimiento,
      fechaRecibido: null,
      fechaDeposito: null,
      fechaEntregado: null,
      fechaConciliado: aFecha(o.fecha_conciliado),
      estado: bajaOca ? 'anulado' : pagado ? 'debitado' : 'pendiente_debito',
      estadoVientri: pagado ? 'Pagado (cheques propios)' : 'Pendiente (cheques propios)',
      estadoVientriId: aEntero(o.id_estado),
      librador: refPersona(cat.personas, 1),
      entregadoPor: null,
      entregadoA: refPersona(cat.personas, aEntero(o.id_persona_recibe)),
      destinatario: aTexto(o.destinatario),
      idCmpIngreso: null,
      cmpIngresoDesc: null,
      idCmpSalida: null,
      cmpSalidaDesc: null,
      idCmpNdRechazo: null,
      idCmpPagoBanco: null,
      estadoPrevioId: null,
      motivoRechazoId: null,
      fuentes: ['CHQOCA'],
      vientriChqId: null,
      vientriChqocaId: oid,
      baja: bajaOca,
      revisar,
      fecsys: aTexto(o.fecsys),
    })
  }

  // Bajas sin reemplazo que nadie usa: quedan anuladas y para revisar si alguna vez se emitieron.
  for (const d of docs.values()) {
    if (d.baja && d.direccion === 'emitido') d.revisar.push('Dado de baja en Vientri sin reemplazo')
  }

  return { cheques: [...docs.values(), ...extras], resumen }
}
