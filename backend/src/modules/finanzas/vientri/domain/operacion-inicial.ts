import type { ChequeEnOperacion, ChequeOcasionalDoc, DesgloseInicial, OperacionRenovacion } from './cheque-ocasional.types.js'
import { esOtroPago } from './clasificar-ocasional.js'
import { docAChequeEnOp, extraerBanco, fechaModaVto } from './operacion-renovacion.js'

/** Número completo y corto (último segmento), igual que el resto del dominio de ocasionales. */
function clavesDeNumero(numero: string): string[] {
  if (!numero) return []
  const corto = numero.split('-').pop()
  return corto && corto !== numero ? [numero, corto] : [numero]
}

/** Las tasas se pactan redondas: de a 0,25 % por mes, entre 0,5 % y 15 %. */
const PASO_TASA = 0.0025
const TASA_MIN_PASOS = 2
const TASA_MAX_PASOS = 60
/** Cada cheque de interés se redondea al peso: se acepta hasta $1 de diferencia por cheque con capital × tasa. */
const TOLERANCIA_CENTAVOS = 100

function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000)
}

const mesDespues = (a: string, b: string) => {
  const d = diasEntre(a, b)
  return d >= 25 && d <= 35
}

/**
 * Cuántos cheques de interés vencen por mes (1, 2…), o null si no vencen mes a mes. Con los vencimientos ordenados,
 * cada cheque tiene que vencer un mes después del que está k lugares antes, y los k de un mismo mes, a menos de 25
 * días entre sí. Ej. MAHUM DIEGO: 24/10, 26/10, 24/11, 26/11, 24/12, 26/12 → 2 por mes. Pide al menos 2 meses.
 */
function chequesPorMes(vtos: string[]): number | null {
  const n = vtos.length
  for (let k = 1; k <= n / 2; k++) {
    if (n % k !== 0) continue
    const cadaMes = vtos.every((v, i) => i < k || mesDespues(vtos[i - k]!, v))
    const mismoMes = vtos.every((v, i) => i % k === 0 || diasEntre(vtos[i - (i % k)]!, v) < 25)
    if (cadaMes && mismoMes) return k
  }
  return null
}

/**
 * Separa interés y capital de una operación inicial cuando el interés se pagó mes a mes en cheques iguales:
 *  1. candidatos a interés: cheques del mismo monto que vencen mes a mes durante 2 meses o más, uno o varios por mes
 *     (ver `chequesPorMes`);
 *  2. capital: todos los demás;
 *  3. se confirma solo si el interés de un mes (monto × cheques por mes) es capital × una tasa redonda (de a 0,25 %),
 *     con hasta $1 de diferencia por cheque. Si no da redonda, o hay más de una forma de que dé, devuelve null.
 */
export function detectarDesgloseInicial(cheques: ChequeEnOperacion[]): DesgloseInicial | null {
  const porMonto = new Map<number, ChequeEnOperacion[]>()
  for (const c of cheques) {
    if (c.montoCentavos <= 0) continue
    const g = porMonto.get(c.montoCentavos)
    if (g) g.push(c)
    else porMonto.set(c.montoCentavos, [c])
  }

  const encontrados: DesgloseInicial[] = []
  for (const [monto, grupo] of porMonto) {
    if (grupo.length < 2 || grupo.some((c) => !c.fechaVencimiento)) continue
    const porMes = chequesPorMes(grupo.map((c) => c.fechaVencimiento!).sort())
    if (porMes === null) continue
    const interesPorMes = monto * porMes

    const enGrupo = new Set(grupo)
    const capital = cheques.filter((c) => !enGrupo.has(c))
    const capitalCentavos = capital.reduce((s, c) => s + c.montoCentavos, 0)
    if (capital.length === 0 || capitalCentavos <= interesPorMes) continue

    const pasos = Math.round(interesPorMes / capitalCentavos / PASO_TASA)
    if (pasos < TASA_MIN_PASOS || pasos > TASA_MAX_PASOS) continue
    if (Math.abs(capitalCentavos * pasos * PASO_TASA - interesPorMes) > TOLERANCIA_CENTAVOS * porMes) continue

    encontrados.push({
      tasaMensual: Math.round(pasos * PASO_TASA * 10_000) / 10_000,
      capitalCentavos,
      interesCentavos: monto * grupo.length,
      interesPorChequeCentavos: monto,
      chequesPorMes: porMes,
      interesPorMesCentavos: interesPorMes,
      chequesInteres: grupo.map((c) => c.numeroCheque),
      chequesCapital: capital.map((c) => c.numeroCheque),
    })
  }
  return encontrados.length === 1 ? encontrados[0]! : null
}

/** Cheques emitidos juntos: mismo beneficiario, mismo día y mismo OBS (igual que "Otros pagos" y A revisar). */
function claveInicial(d: ChequeOcasionalDoc): string {
  return `${d.beneficiarioNormalizado}|${d.fechaEmision ?? '?'}|${(d.obsOriginal ?? '').trim().toLowerCase()}`
}

/**
 * Operaciones iniciales: el préstamo original del que después pueden salir renovaciones.
 *
 * Un grupo de cheques emitidos juntos es operación inicial si no renueva a ningún cheque y además:
 *  - su OBS dice capital (rol `capital` o `mixto`: "Capital", "INTERESES Y CAP", "k+i"), o
 *  - alguno de sus cheques aparece como viejo en una renovación (es el primer eslabón aunque el OBS esté vacío).
 *
 * Los cheques van en `chequesNuevos` (es lo que se debe) y no hay viejos, así `derivarSeguimiento` les calcula estado,
 * exposición y el enlace con la renovación que los reemplazó sin cambios. Interés y tasa quedan en cero: no hay contra
 * qué compararlos (`vinculada: false`).
 */
export function armarOperacionesIniciales(
  docs: ChequeOcasionalDoc[],
  renovaciones: OperacionRenovacion[],
): OperacionRenovacion[] {
  const nuevosDeRenov = new Set<string>()
  const viejosDeRenov = new Set<string>()
  for (const op of renovaciones) {
    for (const c of op.chequesNuevos) for (const k of clavesDeNumero(c.numeroCheque)) nuevosDeRenov.add(k)
    for (const c of op.chequesViejos) for (const k of clavesDeNumero(c.numeroCheque)) viejosDeRenov.add(k)
  }

  const grupos = new Map<string, ChequeOcasionalDoc[]>()
  for (const d of docs) {
    if (d.baja || d.esRenovacion || d.esCompraIva || !d.numeroCheque) continue
    if (clavesDeNumero(d.numeroCheque).some((k) => nuevosDeRenov.has(k))) continue
    if (d.esOtroPago || esOtroPago(d.beneficiarioNormalizado ?? '', d.obsOriginal ?? '')) continue
    const k = claveInicial(d)
    const g = grupos.get(k)
    if (g) g.push(d)
    else grupos.set(k, [d])
  }

  const operaciones: OperacionRenovacion[] = []
  for (const cheques of grupos.values()) {
    const esCapital = cheques.some((d) => d.rolEnOperacion === 'capital' || d.rolEnOperacion === 'mixto')
    const fueRenovado = cheques.some((d) => clavesDeNumero(d.numeroCheque).some((k) => viejosDeRenov.has(k)))
    if (!esCapital && !fueRenovado) continue

    const ordenados = [...cheques].sort(
      (a, b) => (a.fechaVencimiento ?? '').localeCompare(b.fechaVencimiento ?? '') || a.numeroCheque.localeCompare(b.numeroCheque),
    )
    const enOp = ordenados.map(docAChequeEnOp)
    const bancos = new Set(ordenados.map((d) => extraerBanco(d.numeroCheque)))
    const primero = ordenados[0]!
    operaciones.push({
      id: '',
      tipo: 'inicial',
      beneficiario: primero.beneficiario,
      beneficiarioNormalizado: primero.beneficiarioNormalizado,
      fechaEmision: primero.fechaEmision,
      banco: bancos.size === 1 ? [...bancos][0] ?? null : null,
      chequesViejos: [],
      chequesNuevos: enOp,
      totalViejosCentavos: 0,
      totalNuevosCentavos: enOp.reduce((s, c) => s + c.montoCentavos, 0),
      interesCentavos: 0,
      fechaVtoViejos: null,
      fechaVtoNuevos: fechaModaVto(enOp),
      diasRenovacion: null,
      tasaImplicita: 0,
      tasaMensualEstimada: null,
      avisoTasa: null,
      viejosNoEncontrados: [],
      vinculada: false,
      tipoVinculo: 'explicito',
      obsOriginal: (primero.obsOriginal ?? '').trim(),
      desgloseInicial: detectarDesgloseInicial(enOp),
    })
  }
  return operaciones
}
