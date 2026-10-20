import type { ContraparteGuardada, ContraparteOrigen } from './contraparte.types.js'
import { emparejarUnico } from './emparejar-unico.js'
import { agendaCandidatos, identidadDeAgenda, type ItemAgenda } from './fuente-agenda.js'
import { contraparteDesdeBanco } from './fuente-banco.js'
import { chequesCandidatos, contraparteDeCheque, type ChequeParaContraparte } from './fuente-cheque.js'
import { contraparteDesdeCategoria, type CategoriaConocida } from './fuente-categoria.js'
import { contraparteDesdeDirectorio, type EntradaDirectorio } from './fuente-directorio.js'
import {
  interbankingCandidatas,
  contraparteDeTransferenciaIb,
  movimientoPuedeVenirDeInterbanking,
  type TransferenciaIbRecibida,
} from './fuente-interbanking.js'
import {
  identidadDeTransferencia,
  transferenciasCandidatas,
  type IdentidadDestino,
  type TransferenciaParaContraparte,
} from './fuente-transferencia.js'
import { cuitOnceDigitos, nombreContraparteLimpio } from './normalizar.js'
import { elegirContraparte } from './resolver-prioridad.js'

export interface MovimientoParaContraparte {
  id: string
  cuentaId: string
  bancoNombre: string
  bancoNumero: string
  numeroCuenta: string
  tipo: 'debito' | 'credito'
  montoCentavos: number
  fechaProceso: string
  descripcion: string
  codeDescriptionIb: string | null
  voucherNumber: string | null
  correlativeNumber: string | null
  depositorDescription: string | null
  customerCuit: string | null
  categoriaId: string | null
  contraparteNombre: string | null
  contraparteCuit: string | null
  contraparteOrigen: ContraparteOrigen | null
}

export interface ContextoContraparte {
  transferencias: readonly TransferenciaParaContraparte[]
  destinatariosPorCbu: ReadonlyMap<string, IdentidadDestino>
  proveedoresPorCompromiso: ReadonlyMap<string, IdentidadDestino>
  agenda: readonly ItemAgenda[]
  cheques: readonly ChequeParaContraparte[]
  transferenciasIb: readonly TransferenciaIbRecibida[]
  directorio: ReadonlyMap<string, EntradaDirectorio>
  categorias: ReadonlyMap<string, CategoriaConocida>
}

export interface ResultadoMovimiento {
  id: string
  contraparte: ContraparteGuardada
  aportaDirectorio: { cuit: string; nombre: string; origen: ContraparteOrigen } | null
}

const APORTA_DIRECTORIO = new Set<ContraparteOrigen>([
  'manual',
  'banco',
  'transferencia',
  'agenda',
  'interbanking',
])

interface CandidatoConId {
  id: string
  contraparte: ContraparteGuardada
}

function actualDe(mov: MovimientoParaContraparte): ContraparteGuardada {
  return {
    nombre: mov.contraparteNombre,
    cuit: mov.contraparteCuit,
    origen: mov.contraparteOrigen,
  }
}

function conNombre(candidatos: CandidatoConId[]): CandidatoConId[] {
  if (candidatos.length !== 1) return []
  const unico = candidatos[0]
  if (!unico || !nombreContraparteLimpio(unico.contraparte.nombre)) return []
  return [unico]
}

export function resolverLote(
  movimientos: readonly MovimientoParaContraparte[],
  ctx: ContextoContraparte,
): ResultadoMovimiento[] {
  const elegiblesTransferencia = movimientos.filter(
    (mov) => mov.contraparteOrigen !== 'manual' && !contraparteDesdeBanco(mov),
  )
  const transferMap = emparejarUnico(elegiblesTransferencia, (mov) =>
    conNombre(
      transferenciasCandidatas(mov, ctx.transferencias).map((transferencia) => ({
        id: transferencia.id,
        contraparte: {
          ...identidadDeTransferencia(transferencia, ctx.destinatariosPorCbu, ctx.proveedoresPorCompromiso),
          origen: 'transferencia' as const,
        },
      })),
    ),
  )

  const elegiblesAgenda = elegiblesTransferencia.filter((mov) => !transferMap.has(mov.id))
  const agendaMap = emparejarUnico(elegiblesAgenda, (mov) =>
    conNombre(
      agendaCandidatos(mov, ctx.agenda).map((item) => ({
        id: item.id,
        contraparte: { ...identidadDeAgenda(item), origen: 'agenda' as const },
      })),
    ),
  )

  const elegiblesCheque = elegiblesAgenda.filter((mov) => !agendaMap.has(mov.id))
  const chequeMap = new Map<string, CandidatoConId>()
  const chequesUsados = new Set<string>()
  const elegiblesChequePorId = new Map(elegiblesCheque.map((mov) => [mov.id, mov]))

  for (const cheque of ctx.cheques) {
    if (!cheque.movimientoBancarioId) continue
    chequesUsados.add(cheque.id)
    if (!elegiblesChequePorId.has(cheque.movimientoBancarioId)) continue
    const [unico] = conNombre([{ id: cheque.id, contraparte: contraparteDeCheque(cheque) }])
    if (unico) chequeMap.set(cheque.movimientoBancarioId, unico)
  }

  const chequesSinVincular = ctx.cheques.filter((cheque) => !chequesUsados.has(cheque.id))
  const chequePorNumeroMap = emparejarUnico(
    elegiblesCheque.filter((mov) => !chequeMap.has(mov.id)),
    (mov) =>
      conNombre(
        chequesCandidatos(
          {
            tipo: mov.tipo,
            montoCentavos: mov.montoCentavos,
            fechaProceso: mov.fechaProceso,
            descripcion: mov.descripcion,
            codeDescriptionIb: mov.codeDescriptionIb,
            voucherNumber: mov.voucherNumber,
            correlativeNumber: mov.correlativeNumber,
            categoriaNombre: mov.categoriaId ? (ctx.categorias.get(mov.categoriaId)?.nombre ?? null) : null,
          },
          chequesSinVincular,
          { soloNumero: true },
        ).map((cheque) => ({
          id: cheque.id,
          contraparte: contraparteDeCheque(cheque),
        })),
      ),
  )
  for (const [movId, cand] of chequePorNumeroMap) {
    chequeMap.set(movId, cand)
    chequesUsados.add(cand.id)
  }

  const chequesRestantes = ctx.cheques.filter((cheque) => !chequesUsados.has(cheque.id))
  const chequeRestanteMap = emparejarUnico(
    elegiblesCheque.filter((mov) => !chequeMap.has(mov.id)),
    (mov) =>
      conNombre(
        chequesCandidatos(
          {
            tipo: mov.tipo,
            montoCentavos: mov.montoCentavos,
            fechaProceso: mov.fechaProceso,
            descripcion: mov.descripcion,
            codeDescriptionIb: mov.codeDescriptionIb,
            voucherNumber: mov.voucherNumber,
            correlativeNumber: mov.correlativeNumber,
            categoriaNombre: mov.categoriaId ? (ctx.categorias.get(mov.categoriaId)?.nombre ?? null) : null,
          },
          chequesRestantes,
        ).map((cheque) => ({
          id: cheque.id,
          contraparte: contraparteDeCheque(cheque),
        })),
      ),
  )
  for (const [movId, cand] of chequeRestanteMap) {
    chequeMap.set(movId, cand)
  }

  const elegiblesIb = elegiblesCheque.filter(
    (mov) => !chequeMap.has(mov.id) && movimientoPuedeVenirDeInterbanking(mov),
  )
  const ibMap = emparejarUnico(elegiblesIb, (mov) =>
    conNombre(
      interbankingCandidatas(mov, ctx.transferenciasIb).map((transferencia) => ({
        id: transferencia.id,
        contraparte: {
          ...contraparteDeTransferenciaIb(mov, transferencia),
          origen: 'interbanking' as const,
        },
      })),
    ),
  )

  const altos = new Map<string, ContraparteGuardada>()
  for (const mov of movimientos) {
    const elegido = elegirContraparte({
      actual: actualDe(mov),
      candidatos: [
        contraparteDesdeBanco(mov),
        transferMap.get(mov.id)?.contraparte ?? null,
        agendaMap.get(mov.id)?.contraparte ?? null,
        chequeMap.get(mov.id)?.contraparte ?? null,
        ibMap.get(mov.id)?.contraparte ?? null,
      ],
    })
    if (elegido.origen) altos.set(mov.id, elegido)
  }

  const directorio = new Map(ctx.directorio)
  for (const mov of movimientos) {
    const alto = altos.get(mov.id)
    if (!alto?.nombre || !alto.cuit || !alto.origen || !APORTA_DIRECTORIO.has(alto.origen)) continue
    const prev = directorio.get(alto.cuit)
    if (prev?.origen === 'manual' && alto.origen !== 'manual') continue
    directorio.set(alto.cuit, { nombre: alto.nombre, origen: alto.origen })
  }

  return movimientos.map((mov) => {
    const alto = altos.get(mov.id) ?? null
    let contraparte = alto
    if (!contraparte?.nombre) {
      const cuitIb = cuitUnicaInterbanking(mov, ctx.transferenciasIb)
      const cuit = cuitOnceDigitos(mov.customerCuit) ?? cuitOnceDigitos(mov.contraparteCuit) ?? cuitIb
      contraparte = elegirContraparte({
        actual: actualDe(mov),
        candidatos: [
          contraparteDesdeDirectorio(cuit, directorio),
          contraparteDesdeCategoria(
            { categoriaId: mov.categoriaId, bancoNombre: mov.bancoNombre },
            ctx.categorias,
          ),
        ],
      })
    }
    const yaEstaba =
      nombreContraparteLimpio(mov.contraparteNombre) === contraparte.nombre &&
      cuitOnceDigitos(mov.contraparteCuit) === contraparte.cuit &&
      mov.contraparteOrigen === contraparte.origen
    const aporta =
      !yaEstaba &&
      contraparte.nombre &&
      contraparte.cuit &&
      contraparte.origen &&
      APORTA_DIRECTORIO.has(contraparte.origen)
        ? { cuit: contraparte.cuit, nombre: contraparte.nombre, origen: contraparte.origen }
        : null
    return { id: mov.id, contraparte, aportaDirectorio: aporta }
  })
}

function cuitUnicaInterbanking(
  mov: MovimientoParaContraparte,
  transferencias: readonly TransferenciaIbRecibida[],
): string | null {
  if (mov.contraparteOrigen === 'manual' || contraparteDesdeBanco(mov)) return null
  const candidatas = interbankingCandidatas(mov, transferencias)
  if (candidatas.length !== 1 || !candidatas[0]) return null
  return cuitOnceDigitos(contraparteDeTransferenciaIb(mov, candidatas[0]).cuit)
}
