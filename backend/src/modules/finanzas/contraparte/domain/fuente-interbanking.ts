import { cuitOnceDigitos, nombreContraparteLimpio, soloDigitos, claveTexto } from './normalizar.js'

/**
 * Créditos que suelen ser una transferencia recibida por Interbanking.
 * TRANS P PR y CREDITO PROVEEDOR TA son los textos que manda el banco;
 * la lista queda acá para sumar otro texto sin tocar el resto.
 */
export const TEXTOS_CREDITO_INTERBANKING = ['TRANS P PR', 'CREDITO PROVEEDOR TA']

export interface TransferenciaIbRecibida {
  id: string
  fecha: string
  montoCentavos: number
  cuentaCreditoNumero: string
  bancoCreditoNumero: string
  /** Quien paga: debit_account.account_label del spec. */
  nombrePagador: string | null
  /** Quien paga: debit_account.customer_cuit del spec. */
  cuitPagador: string | null
  estado: string | null
  /** Cuenta débito (para los pagos que hace Bacar: sueldos, proveedores, cuentas propias). */
  cuentaDebitoNumero: string
  bancoDebitoNumero: string
  /** Quien cobra: `account_label` de la raíz ("Nombre del beneficiario"). */
  nombreBeneficiario: string | null
  cuitBeneficiario: string | null
  bancoCreditoNombre: string | null
  /** Transferencia entre cuentas propias de Bacar. */
  cuentasPropias: boolean
  /** `lot_number`: el banco debita un lote (p. ej. sueldos) en UN solo movimiento. */
  loteNumero?: string | null
  /** `transfer_type_description` (Sueldos, Proveedores, Cuentas Propias...). */
  tipoTransferencia?: string | null
}

const NOMBRES_EN_RESUMEN = 2

/**
 * Sueldos (y otros pagos en lote): Interbanking informa una transferencia por empleado, pero el
 * banco debita el lote entero en un solo movimiento (verificado Córdoba 22/09/2026: lote 323 =
 * 4 × $32.242,15 = el débito TF.PAG.HAB.O/B de $128.968,60). Arma un candidato por lote con la suma.
 */
export function lotesDeTransferencias(transferencias: readonly TransferenciaIbRecibida[]): TransferenciaIbRecibida[] {
  const grupos = new Map<string, TransferenciaIbRecibida[]>()
  for (const transferencia of transferencias) {
    if (!transferencia.loteNumero || estadoDescartado(transferencia.estado)) continue
    const clave = `${transferencia.fecha}|${transferencia.cuentaDebitoNumero}|${transferencia.loteNumero}`
    const lista = grupos.get(clave) ?? []
    lista.push(transferencia)
    grupos.set(clave, lista)
  }
  const lotes: TransferenciaIbRecibida[] = []
  for (const lista of grupos.values()) {
    if (lista.length < 2) continue
    const primera = lista[0]!
    const nombres = [...new Set(lista.map((item) => item.nombreBeneficiario).filter((n): n is string => !!n))]
    const visibles = nombres.slice(0, NOMBRES_EN_RESUMEN).join(', ')
    const resto = nombres.length - NOMBRES_EN_RESUMEN
    const resumen = nombres.length === 0 ? null : resto > 0 ? `${visibles} y ${resto} más` : visibles
    lotes.push({
      ...primera,
      id: `lote:${primera.fecha}:${primera.cuentaDebitoNumero}:${primera.loteNumero}`,
      montoCentavos: lista.reduce((suma, item) => suma + item.montoCentavos, 0),
      nombreBeneficiario: etiquetaLote(lista.length, primera.tipoTransferencia ?? null, resumen),
      cuitBeneficiario: null,
      cuentasPropias: lista.every((item) => item.cuentasPropias),
    })
  }
  return lotes
}

/**
 * GET /v1/transfers/details trae sobre todo las transferencias que HACE Bacar por Interbanking
 * (verificado 30/09/2026: 226 en una semana, la mayoría sueldos, con el nombre de cada empleado).
 * Por eso sirve para cualquier débito, y para los créditos con los textos de arriba.
 */
export function movimientoPuedeVenirDeInterbanking(mov: {
  tipo: string
  descripcion?: unknown
  codeDescriptionIb?: unknown
}): boolean {
  if (mov.tipo === 'debito') return true
  if (mov.tipo !== 'credito') return false
  const desc = claveTexto(mov.descripcion)
  const code = claveTexto(mov.codeDescriptionIb)
  return TEXTOS_CREDITO_INTERBANKING.some((texto) => {
    const clave = claveTexto(texto)
    return desc === clave || code === clave || (clave.length > 0 && desc.includes(clave))
  })
}

function estadoDescartado(estado: string | null): boolean {
  if (!estado) return false
  const clave = estado.toLocaleLowerCase('es')
  return clave.includes('rechaz') || clave.includes('anulad')
}

function mismaCuenta(numeroMovimiento: string, numeroTransferencia: string): boolean {
  const a = soloDigitos(numeroMovimiento)
  const b = soloDigitos(numeroTransferencia)
  if (!a || !b) return false
  if (a === b) return true
  const corto = a.length <= b.length ? a : b
  const largo = a.length <= b.length ? b : a
  return corto.length >= 6 && largo.endsWith(corto)
}

function mismoBanco(bancoMovimiento: string, bancoTransferencia: string): boolean {
  const a = soloDigitos(bancoMovimiento)
  const b = soloDigitos(bancoTransferencia)
  if (!a || !b) return true
  return a.slice(-3).padStart(3, '0') === b.slice(-3).padStart(3, '0')
}

export function interbankingCandidatas(
  mov: {
    tipo: string
    descripcion?: unknown
    codeDescriptionIb?: unknown
    numeroCuenta: string
    bancoNumero: string
    montoCentavos: number
    fechaProceso: string
  },
  transferencias: readonly TransferenciaIbRecibida[],
): TransferenciaIbRecibida[] {
  if (!movimientoPuedeVenirDeInterbanking(mov)) return []
  const esDebito = mov.tipo === 'debito'
  const coincide = (transferencia: TransferenciaIbRecibida) => {
    if (estadoDescartado(transferencia.estado)) return false
    if (transferencia.fecha !== mov.fechaProceso) return false
    if (transferencia.montoCentavos !== mov.montoCentavos) return false
    const cuenta = esDebito ? transferencia.cuentaDebitoNumero : transferencia.cuentaCreditoNumero
    const banco = esDebito ? transferencia.bancoDebitoNumero : transferencia.bancoCreditoNumero
    if (!mismaCuenta(mov.numeroCuenta, cuenta)) return false
    return mismoBanco(mov.bancoNumero, banco)
  }
  const sueltas = transferencias.filter(coincide)
  if (sueltas.length > 0 || !esDebito) return sueltas
  return lotesDeTransferencias(transferencias).filter(coincide)
}

/** Nombre/CUIT a mostrar según de qué lado está el movimiento. */
export function contraparteDeTransferenciaIb(
  mov: { tipo: string },
  transferencia: TransferenciaIbRecibida,
): { nombre: string | null; cuit: string | null } {
  if (mov.tipo !== 'debito') {
    return { nombre: transferencia.nombrePagador, cuit: transferencia.cuitPagador }
  }
  if (transferencia.cuentasPropias) {
    const banco = transferencia.bancoCreditoNombre ? ` en ${transferencia.bancoCreditoNombre}` : ''
    return { nombre: `Bacar · a su cuenta${banco}`, cuit: null }
  }
  return { nombre: transferencia.nombreBeneficiario, cuit: transferencia.cuitBeneficiario }
}

function texto(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function objeto(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** Pesos del spec (`amount`) a centavos. `toFixed` evita el error de binario. */
export function importeACentavos(amount: unknown): number | null {
  const n = typeof amount === 'number' ? amount : typeof amount === 'string' ? Number(amount.replace(',', '.')) : NaN
  if (!Number.isFinite(n)) return null
  const [whole, frac = '00'] = Math.abs(n).toFixed(2).split('.')
  return Number(whole) * 100 + Number(frac)
}

function fechaDeRequest(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  return null
}

/**
 * GET /v1/transfers/details → DetalleTransferenciaDTO.
 *
 * Quien paga (el débito de la transferencia) está en la cuenta débito:
 *   - debit_account.account_label  "Nombre de la empresa"
 *   - debit_account.customer_cuit  "CUIT de la empresa"
 * El `account_label` de la raíz es "Nombre del beneficiario" (quien cobra), no el pagador.
 * `taxpayer_cuit` ("CUIT de la empresa pagadora") está en el comprobante
 * (CuentaComprobanteDTO), no en este GET.
 */
export function parseDetalleTransferencias(body: unknown): TransferenciaIbRecibida[] {
  const root = objeto(body)
  const transfers = root && Array.isArray(root.transfers) ? root.transfers : []
  const filas: TransferenciaIbRecibida[] = []
  for (const raw of transfers) {
    const row = objeto(raw)
    if (!row) continue
    const currency = texto(row.currency).toUpperCase()
    if (currency && currency !== 'ARS') continue
    const fecha = fechaDeRequest(row.request_date)
    const montoCentavos = importeACentavos(row.amount)
    if (!fecha || montoCentavos == null) continue
    const debito = objeto(row.debit_account)
    const credito = objeto(row.credit_account)
    const cuentaCreditoNumero = soloDigitos(credito?.account_number)
    const cuentaDebitoNumero = soloDigitos(debito?.account_number)
    if (!cuentaCreditoNumero && !cuentaDebitoNumero) continue
    const tipoTransferencia = claveTexto(row.transfer_type_description)
    const cuentasPropias = row.same_owner === true || tipoTransferencia === claveTexto('Cuentas Propias')
    const transferId = row.transfer_id != null ? String(row.transfer_id) : ''
    const cuit = cuitOnceDigitos(debito?.customer_cuit)
    const id =
      transferId && transferId !== '0'
        ? transferId
        : `${fecha}|${montoCentavos}|${cuentaCreditoNumero}|${cuit ?? ''}|${texto(debito?.account_label)}`
    filas.push({
      id,
      fecha,
      montoCentavos,
      cuentaCreditoNumero,
      bancoCreditoNumero: soloDigitos(credito?.bank_number),
      nombrePagador: nombreContraparteLimpio(debito?.account_label),
      cuitPagador: cuit,
      estado: texto(row.status) || null,
      cuentaDebitoNumero,
      bancoDebitoNumero: soloDigitos(debito?.bank_number),
      nombreBeneficiario: nombreContraparteLimpio(row.account_label),
      cuitBeneficiario: cuitOnceDigitos(credito?.customer_cuit),
      bancoCreditoNombre: texto(credito?.bank_name) || null,
      cuentasPropias,
      tipoTransferencia: texto(row.transfer_type_description) || null,
      loteNumero: row.lot_number != null && String(row.lot_number) !== '0' ? String(row.lot_number) : null,
    })
  }
  return filas
}

function etiquetaLote(cantidad: number, tipo: string | null, resumen: string | null): string {
  const esSueldos = claveTexto(tipo) === claveTexto('Sueldos')
  const cabeza = esSueldos ? `Sueldos de ${cantidad} empleados` : `${cantidad} pagos`
  return resumen ? `${cabeza}: ${resumen}` : cabeza
}
